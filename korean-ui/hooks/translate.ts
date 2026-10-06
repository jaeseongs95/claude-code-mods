// 모델 번역에 쓰는 순수 함수와 상수. $를 쓰는 부분은 엔진 규칙상 register.tsx 안에 있다.

export const TRANSLATIONS_KEY = 'translations'
export const MAX_CACHED = 500
export const BATCH = 10

export const SYSTEM = [
  'You translate Claude Code CLI interface text into natural Korean.',
  'Input: a JSON array of English strings. Output: only a JSON array of Korean strings, same length and order.',
  'Keep unchanged: code, commands, slash commands, file paths, URLs, identifiers, key names (ctrl+o, Esc), numbers, and product names (Claude Code, GitHub, MCP).',
  'Use short, plain UI wording. Do not add explanations.',
].join('\n')

const HANGUL = /[가-힣]/
const WORD = /[A-Za-z]{2,}/

export const needsTranslation = (text: string) => !HANGUL.test(text) && WORD.test(text)

export const parseArray = (text: string, length: number): string[] | undefined => {
  try {
    const value: unknown = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? '')
    return Array.isArray(value) && value.length === length && value.every(v => typeof v === 'string') ? value : undefined
  } catch {
    return undefined
  }
}

// ponytail: 최근 MAX_CACHED개만 남긴다. 넘치면 오래 전에 넣은 것부터 버린다.
export const trim = (cache: Record<string, string>) => Object.fromEntries(Object.entries(cache).slice(-MAX_CACHED))
