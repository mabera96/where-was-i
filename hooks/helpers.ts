import type { SessionMessage } from 'claude-code'
import type { Place, Summary } from '../types'

export const MAX_LINE = 240
export const MAX_INPUT = 3000

/** The last path segment; `No folder` for the app's scratch workspaces. */
export function folderOf(cwd: string): string {
  const parts = cwd.split(/[\\/]/).filter(Boolean)
  if (parts.slice(0, -1).includes('scratch-workspaces')) return 'No folder'
  return parts.at(-1) ?? '/'
}

/** The branch name from `git rev-parse --abbrev-ref HEAD`; undefined for any failure or a detached head. */
export function branchOf(run: { exitCode: number; stdout: string; [more: string]: unknown } | undefined): string | undefined {
  if (!run || run.exitCode !== 0) return undefined
  const name = run.stdout.trim()
  return name === '' || name === 'HEAD' ? undefined : name
}

export function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text
}

/** Plain words only: no leading heading marks, bullets, asterisks or backticks. */
export function cleanLine(line: string): string {
  return line
    .replace(/[*`]/g, '')
    .replace(/^[\s#>\-]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The first `Last:` and the first `Next:` line of a reply; undefined when there is no usable `Last:`. */
export function parseReply(text: string): Summary | undefined {
  const lines = text.split('\n')
  const pick = (label: string) => {
    for (const line of lines) {
      const m = new RegExp(`^\\s*${label}:\\s*(.*)$`, 'i').exec(line.replace(/^[\s*`#>-]+/, ''))
      const body = m ? cleanLine(m[1] ?? '') : ''
      if (m && body) return clip(body, MAX_LINE)
    }
    return undefined
  }
  const last = pick('Last')
  if (!last) return undefined
  const next = pick('Next')
  return next ? { last, next } : { last }
}

/** No model answer: the first non-empty line of what Claude last said. */
export function fallbackSummary(assistantText: string): Summary | undefined {
  for (const line of assistantText.split('\n')) {
    const clean = cleanLine(line)
    if (clean) return { last: clip(clean, MAX_LINE) }
  }
  return undefined
}

/** The newest typed message and the newest assistant text; tool-result rows are not typed messages. */
export function lastTexts(messages: readonly SessionMessage[]): { user: string; assistant: string } {
  let user = ''
  let assistant = ''
  for (const m of [...messages].reverse()) {
    const text = m.text.trim()
    if (!text) continue
    if (m.role === 'user' && !user && !(m.toolResults && m.toolResults.length > 0)) user = text
    if (m.role === 'assistant' && !assistant) assistant = text
    if (user && assistant) break
  }
  return { user, assistant }
}

/** Keeps the start of the person's message and the END of Claude's, where conclusions sit. */
export function buildPrompt(user: string, assistant: string): string {
  const u = user.length > MAX_INPUT ? user.slice(0, MAX_INPUT) : user
  const a = assistant.length > MAX_INPUT ? assistant.slice(-MAX_INPUT) : assistant
  return [
    'A person is working with an AI assistant in a long chat and has lost track of where they left off.',
    'Write a reminder in exactly two lines, in this form and nothing else:',
    'Last: <what just happened>',
    'Next: <what is waiting, or who has to act next>',
    '',
    'Rules: each line is one short sentence, under 140 characters. Plain everyday words, as for someone who does not write code.',
    'No jargon: say "version of the project" instead of "branch", "changes" instead of "diff" or "commit".',
    'No markdown, no bullets, no emoji, no quotes. If nothing is waiting, write "Next: Nothing, you can pick the next task."',
    '',
    'What the person last asked:',
    u || '(nothing yet)',
    '',
    'What the assistant last said:',
    a || '(nothing yet)',
  ].join('\n')
}

export const MAX_PLACES = 12
const LINK_ID = /^local_[A-Za-z0-9-]{1,64}$/

/** The desktop app's id for a chat, only in the form its links accept. */
export function linkId(value: unknown): string | undefined {
  return typeof value === 'string' && LINK_ID.test(value) ? value : undefined
}

/** The address the desktop app opens a chat by. */
export function chatUrl(link: string): string {
  return `claude://code/continue?session=${link}`
}

/** How long ago, in everyday words. */
export function ago(now: number, at: number): string {
  const min = Math.floor(Math.max(0, now - at) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hours = Math.floor(min / 60)
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

/** Stored summaries as panel rows, newest first; one saved before folders were kept is left out. */
export function placesFrom(entries: readonly (readonly [string, unknown])[]): Place[] {
  const out: Place[] = []
  for (const [id, raw] of entries) {
    if (!raw || typeof raw !== 'object') continue
    const v = raw as Record<string, unknown>
    if (typeof v.last !== 'string' || typeof v.folder !== 'string' || typeof v.at !== 'number') continue
    const place: Place = { id, folder: v.folder, last: v.last, at: v.at }
    if (typeof v.branch === 'string') place.branch = v.branch
    if (typeof v.next === 'string') place.next = v.next
    const link = linkId(v.link)
    if (link) place.link = link
    out.push(place)
  }
  return out.sort((a, b) => b.at - a.at).slice(0, MAX_PLACES)
}

/** Shown in the strip the first time the mod loads on a computer, until the person dismisses it. */
export const WELCOME_TITLE = 'Hey, thanks for downloading this mod!'
export const WELCOME_COMMANDS = [
  { name: '/where', what: 'See your recent chats and jump between them.' },
  { name: '/reload-plugins', what: 'Run once in any chat that was already open.' },
] as const
export const WELCOME_NOTE = 'Chats join the /where list after their next reply.'
