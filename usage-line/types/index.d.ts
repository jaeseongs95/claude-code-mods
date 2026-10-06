export type Seg = { text: string; color?: string; bold?: boolean; dim?: boolean }
export type Cache = { sessionId: string; read: number; total: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-line': { rows: Seg[][]; effort: string | null; cache: Cache | null }
  }
}
