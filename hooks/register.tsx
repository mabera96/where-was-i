import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Header, Place, Stored, Summary } from '../types'
import { ago, branchOf, clip, buildPrompt, chatUrl, fallbackSummary, folderOf, lastTexts, linkId, parseReply, placesFrom, WELCOME_COMMANDS, WELCOME_NOTE, WELCOME_TITLE } from './helpers'

// Change a tag when that value's fields change: it declines what an earlier version stored.
export const header = atom({ plugin: 'where-was-i', key: 'header' } as const, null as Header | null, { shape: 'header-1' })
export const summary = atom({ plugin: 'where-was-i', key: 'summary' } as const, null as Summary | null, { shape: 'summary-1' })

export const welcoming = atom({ plugin: 'where-was-i', key: 'welcome' } as const, false as boolean, { shape: 'welcome-1' })
export const places = atom({ plugin: 'where-was-i', key: 'places' } as const, [] as Place[], { shape: 'places-1' })

const PREFIX = 'summary:'
const storeKey = (id: string) => `${PREFIX}${id}`
const PANE = 'where'

/** What the panel needs beside the two lines: where the chat is, when, and how the app opens it. */
async function whereabouts($: EngineInterface): Promise<Pick<Stored, 'folder' | 'branch' | 'at' | 'link'>> {
  const top = await read($, header)
  const out: Pick<Stored, 'folder' | 'branch' | 'at' | 'link'> = { at: await $.clock.now() }
  if (top) out.folder = top.folder
  if (top?.branch) out.branch = top.branch
  let link: string | undefined
  try {
    link = linkId(await $.env.get('CLAUDE_CODE_HOST_SESSION_ID'))
  } catch {
    link = undefined
  }
  if (link) out.link = link
  return out
}

const FOLLOW_MS = 4_000
const REFRESH_EVERY = 5
const SWITCH = 'panel'
const WELCOMED = 'welcomed'
const TITLE = 'Where you left things'
let ticker: { cancel: () => void } | undefined
let ticks = 0

const isUp = async ($: EngineInterface) => (await $.ui.panes()).some(pane => pane.id === PANE)

/** Whether the person has the panel switched on, in any chat. Chats share the store, nothing else. */
async function isSwitchedOn($: EngineInterface): Promise<boolean> {
  const v = (await $.store.get(SWITCH)) as { on?: unknown } | undefined
  return v?.on === true
}

/**
 * Makes this chat's panel match the shared switch, so the panel seems to follow the person from
 * chat to chat; while it is up, re-reads the list so other chats' news and the times stay current.
 */
async function follow($: EngineInterface) {
  const wanted = await isSwitchedOn($)
  const up = await isUp($)
  if (wanted && !up) {
    await loadPlaces($)
    await $.ui.open({ id: PANE, title: TITLE })
  } else if (!wanted && up) {
    await $.ui.close({ id: PANE })
  } else if (up && ++ticks % REFRESH_EVERY === 0) {
    await loadPlaces($)
    $.ui.invalidate('ui.render')
  }
}

function watch($: EngineInterface) {
  if (ticker) return
  ticker = $.clock.every(FOLLOW_MS, () => void follow($).catch(() => {}))
}

/** Drops a chat from the list: one the person deleted, which a mod has no way to hear about. It returns if that chat is used again. */
async function forget($: EngineInterface, id: string) {
  await $.store.delete(storeKey(id))
  await loadPlaces($)
}

let welcomeChecked = false

/** Shows the welcome in this chat's strip unless it was already dismissed on this computer. */
async function welcome($: EngineInterface) {
  await update($, welcoming, () => false)
  if ((await $.store.get(WELCOMED)) !== true) await update($, welcoming, () => true)
}

async function dismissWelcome($: EngineInterface) {
  await $.store.set(WELCOMED, true)
  await update($, welcoming, () => false)
}

/** Asks the operating system to open the desktop app at a chat. A panel's own links may only be web addresses. */
async function openChat($: EngineInterface, link: string) {
  const url = chatUrl(link)
  const isWindows = (await $.env.get('OS').catch(() => undefined)) === 'Windows_NT'
  const tries = isWindows ? [['cmd', '/c', 'start', '', url]] : [['open', url], ['xdg-open', url]]
  for (const argv of tries) {
    try {
      if ((await $.process.run(argv)).exitCode === 0) return
    } catch {
      // try the next way
    }
  }
  $.ui.toast('Could not open that chat. Find it in the sidebar.')
}

/** Every chat's stored summary, newest first, into the panel's list. */
async function loadPlaces($: EngineInterface): Promise<Place[]> {
  const entries: [string, unknown][] = []
  for (const key of await $.store.keys()) {
    if (key.startsWith(PREFIX)) entries.push([key.slice(PREFIX.length), await $.store.get(key)])
  }
  const list = placesFrom(entries)
  await update($, places, () => list)
  return list
}

/** Folder and branch. A branch that cannot be read is simply not shown. */
async function refreshHeader($: EngineInterface) {
  let cwd: string
  try {
    cwd = await $.session.cwd()
  } catch {
    await update($, header, () => null)
    return
  }
  const folder = folderOf(cwd)
  let branch: string | undefined
  if (folder !== 'No folder') {
    try {
      branch = branchOf(await $.process.run(['git', '-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD']))
    } catch {
      branch = undefined
    }
  }
  await update($, header, () => (branch ? { folder, branch } : { folder }))
}

/** The row of the chat you are in: a faint wash of Carolina blue, see-through so it reads on dark and light themes. */
const HERE = 'rgba(75,156,211,0.16)'
/** Every other row in the panel, so the list reads as stripes on any theme. */
const STRIPE = 'rgba(128,128,128,0.1)'
/** The folder name and labels, in the strip and the panel: the app's own amber, which it adjusts for light and dark themes. */
const AMBER = 'warning'
/** About two lines of the panel; the strip in that chat has the full text. */
const PANEL_LINE = 130

let busy = false

/** One summary: the model's two lines, else the first line Claude wrote. Skipped while another runs. */
async function summarize($: EngineInterface, latestAnswer?: string) {
  if (busy) return
  busy = true
  try {
    const { user, assistant: seen } = lastTexts(await $.session.messages())
    const assistant = latestAnswer?.trim() || seen
    if (!user && !assistant) {
      await update($, summary, () => null)
      return
    }
    let parsed: Summary | undefined
    try {
      const r = await $.model.complete({ model: 'haiku', prompt: buildPrompt(user, assistant), maxTokens: 150, effort: 'low', timeoutMs: 20_000 })
      parsed = r.isAnswered ? parseReply(r.text) : undefined
    } catch {
      parsed = undefined
    }
    const result = parsed ?? fallbackSummary(assistant)
    await update($, summary, () => result ?? null)
    // Only a real model answer is kept: a fallback should be retried next time.
    if (parsed) {
      const stored: Stored = { ...parsed, turns: await $.session.turns(), ...(await whereabouts($)) }
      await $.store.set(storeKey(await $.session.id()), stored)
      await loadPlaces($)
    }
  } finally {
    busy = false
  }
}

/** Runs after the hook returns, so the person is never kept waiting on the model. */
function later($: EngineInterface, work: () => Promise<void>) {
  $.clock.after(0, () => void work().catch(() => {}))
}

async function startUp($: EngineInterface) {
  await refreshHeader($)
  const { user, assistant } = lastTexts(await $.session.messages())
  if (!user && !assistant) return
  const stored = (await $.store.get(storeKey(await $.session.id()))) as Stored | undefined
  if (stored && typeof stored.last === 'string' && stored.turns === (await $.session.turns())) {
    await update($, summary, () => (stored.next ? { last: stored.last, next: stored.next } : { last: stored.last }))
    // A summary saved before folders and links were kept gains them here, with no model call.
    const now = await whereabouts($)
    if (typeof stored.folder !== 'string' || typeof stored.at !== 'number') {
      await $.store.set(storeKey(await $.session.id()), { ...stored, ...now })
    } else if (stored.folder !== now.folder || stored.branch !== now.branch || stored.link !== now.link) {
      // The saved place went stale (a branch switch, or one never recorded): fix it, keep its time.
      const { branch: _old, ...rest } = stored
      await $.store.set(storeKey(await $.session.id()), { ...rest, ...now, at: stored.at })
    }
    return
  }
  await summarize($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'where', description: 'Show where you left things in each of your chats' })
    later($, async () => {
      await startUp($)
      await follow($)
      watch($)
    })
    return next(e)
  })

  on('ui.close', async ($, e, next) => {
    // Closed by hand: switch it off everywhere. Our own close and an unload leave the switch alone.
    if (e.id === PANE && e.origin.kind === 'person') await $.store.set(SWITCH, { on: false })
    return next(e)
  })

  on('command.run', { command: 'where' }, async $ => {
    const list = await loadPlaces($)
    const { isPlaced } = await $.ui.open({ id: PANE, title: TITLE })
    if (isPlaced) {
      await $.store.set(SWITCH, { on: true })
      watch($)
      return { text: 'Opened the "Where you left things" panel. It follows you to your other open chats until you close it.' }
    }
    // No panel on this surface: the same list as text.
    if (list.length === 0) return { text: 'No chats to show yet. Each chat appears here after its next reply.' }
    const now = await $.clock.now()
    return {
      text: list
        .map(p => [`${p.folder}${p.branch ? ` · branch: ${p.branch}` : ''} · ${ago(now, p.at)}`, `  Last: ${p.last}`, ...(p.next ? [`  Next: ${p.next}`] : [])].join('\n'))
        .join('\n\n'),
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, places)
    const now = await $.clock.now()
    const here = await $.session.id()

    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor wrap="wrap">No chats to show yet. Each chat appears here after its next reply.</Text>}
        {list.map((p, i) => (
          <Box flexDirection="column">
            <Box flexDirection="column" paddingX="md" paddingY="lg" {...(p.id === here ? { backgroundColor: HERE } : i % 2 === 1 ? { backgroundColor: STRIPE } : {})}>
              <Text wrap="wrap">
                <Text bold color={AMBER}>{p.folder}</Text>
                <Text dimColor size="footnote">{`${p.branch ? ` · ${p.branch}` : ''} · ${ago(now, p.at)}`}</Text>
              </Text>
              <Text wrap="wrap">{clip(p.last, PANEL_LINE)}</Text>
              {p.next && (
                <Text dimColor wrap="wrap">{`Next: ${clip(p.next, PANEL_LINE)}`}</Text>
              )}
              {p.id === here ? (
                <Text dimColor size="footnote">This chat</Text>
              ) : (
                <Box flexDirection="row" gap={3}>
                  {p.link ? <Button key={`open:${p.id}`} plain label="Open" onPress={() => openChat($, p.link as string)} /> : null}
                  <Button key={`forget:${p.id}`} plain dimColor label="Hide" onPress={() => forget($, p.id)} />
                </Box>
              )}
            </Box>
          </Box>
        ))}
      </Box>
    )
  })

  on('turn.complete', async ($, e, next) => {
    // A subagent finishing is not the person's conversation moving on.
    if (!e.agentId) {
      later($, async () => {
        await refreshHeader($)
        await summarize($, e.answer)
      })
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // The strip being drawn means a person is looking: the desktop app counts as non-interactive at start.
    if (!welcomeChecked) {
      welcomeChecked = true
      later($, () => welcome($))
    }
    const top = await read($, header)
    const hello = await read($, welcoming)
    if (e.props.hasSurvey || (top === null && !hello)) return next(e)
    const lines = await read($, summary)
    const { Box, Text, Button } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {hello && (
          <Box flexDirection="column" marginBottom={1} gap={1}>
            <Text bold color={AMBER} wrap="wrap">{WELCOME_TITLE}</Text>
            <Box flexDirection="column">
              {WELCOME_COMMANDS.map(c => (
                <Text wrap="wrap">
                  <Text bold color={AMBER}>{c.name}</Text>
                  <Text>{`   ${c.what}`}</Text>
                </Text>
              ))}
            </Box>
            <Text dimColor wrap="wrap">{WELCOME_NOTE}</Text>
            <Button key="welcome-ok" label="Got it" onPress={() => dismissWelcome($)} />
          </Box>
        )}
        {top && (
          <Text wrap="truncate-end">
            <Text bold color={AMBER}>{top.folder}</Text>
            {top.branch ? <Text dimColor>{` · branch: ${top.branch}`}</Text> : null}
          </Text>
        )}
        {top && lines && (
          <Text wrap="wrap">
            <Text color={AMBER}>Last: </Text>
            <Text>{lines.last}</Text>
          </Text>
        )}
        {top && lines?.next && (
          <Text wrap="wrap">
            <Text color={AMBER}>Next: </Text>
            <Text>{lines.next}</Text>
          </Text>
        )}
      </Box>
    )
  })
}
