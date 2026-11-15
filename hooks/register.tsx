import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Header, Stored, Summary } from '../types'
import { branchOf, buildPrompt, fallbackSummary, folderOf, lastTexts, parseReply } from './helpers'

// Change a tag when that value's fields change: it declines what an earlier version stored.
export const header = atom({ plugin: 'where-was-i', key: 'header' } as const, null as Header | null, { shape: 'header-1' })
export const summary = atom({ plugin: 'where-was-i', key: 'summary' } as const, null as Summary | null, { shape: 'summary-1' })

const storeKey = (id: string) => `summary:${id}`

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

/** The folder name and the two labels; everything else keeps the app's own text colors. */
const YELLOW = '#D9A21B'

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
      const stored: Stored = { ...parsed, turns: await $.session.turns() }
      await $.store.set(storeKey(await $.session.id()), stored)
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
    return
  }
  await summarize($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    later($, () => startUp($))
    return next(e)
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
    const top = await read($, header)
    if (e.props.hasSurvey || top === null) return next(e)
    const lines = await read($, summary)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text bold color={YELLOW}>{top.folder}</Text>
          {top.branch ? <Text dimColor>{` · branch: ${top.branch}`}</Text> : null}
        </Text>
        {lines && (
          <Text wrap="wrap">
            <Text color={YELLOW}>Last: </Text>
            <Text>{lines.last}</Text>
          </Text>
        )}
        {lines?.next && (
          <Text wrap="wrap">
            <Text color={YELLOW}>Next: </Text>
            <Text>{lines.next}</Text>
          </Text>
        )}
      </Box>
    )
  })
}
