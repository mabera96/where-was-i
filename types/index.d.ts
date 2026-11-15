/** Line 1: the folder name, and the git branch when there is one to show. */
export type Header = { folder: string; branch?: string }

/** Lines 2-3: what just happened, and what is waiting. */
export type Summary = { last: string; next?: string }

/** What is kept per session so a restart does not pay for a model call. */
export type Stored = { last: string; next?: string; turns: number }

declare module 'claude-code' {
  interface PluginState {
    'where-was-i': {
      header: Shaped<Header | null>
      summary: Shaped<Summary | null>
    }
  }
}
