import type { EngineInterface, Register, ToolGroupCall } from 'claude-code'

import { COMMAND_DESCRIPTIONS, CONFIG_LABELS } from './dict'
import { BATCH, needsTranslation, parseArray, SYSTEM, TRANSLATIONS_KEY, trim } from './translate'

// 문자열 전체가 이 문구일 때만 바꾼다(문장 속 같은 단어는 건드리지 않는다).
// 엔진 문구는 2.1.291 실행 파일에서 확인한 것이다. 끝의 말줄임표(…)는 떼고 찾는다.
const WORDS: Record<string, string> = {
  focus: '집중',
  'memory paused': '메모리 일시 정지',
  interrupted: '중단됨',
  thinking: '생각 중',
  waiting: '대기 중',
  running: '실행 중',
  retrying: '다시 시도하는 중',
  summarizing: '요약하는 중',
  'compacting conversation': '대화 압축 중',
  'waiting for api response': 'API 응답 기다리는 중',
  'esc again to clear': 'Esc를 한 번 더 누르면 지움',
  'draft restored': '쓰던 글 복원됨',
  'error compacting conversation': '대화 압축 오류',
  'compaction blocked by precompact hook': 'PreCompact 훅이 압축을 막음',
  'no background agents running': '실행 중인 백그라운드 에이전트 없음',
  'ctrl+y to paste deleted text': 'Ctrl+Y로 지운 글 붙여넣기',
  'plugins changed. run /reload-plugins to activate.': '플러그인이 바뀜. /reload-plugins로 적용하세요.',
  'deeper reasoning requested for this turn': '이번 턴에 더 깊은 추론 요청됨',
  'this prompt will launch an ultraplan cloud session': '이 프롬프트는 ultraplan 클라우드 세션을 시작함',
  'clear the input to edit this queued shell command': '대기 중인 셸 명령을 고치려면 입력창을 비우세요',
  'press up to edit queued messages': '↑ 키로 대기 중인 메시지 편집',
  'press up to edit queued messages, enter to send them immediately': '↑ 키로 대기 중인 메시지 편집, Enter로 바로 보내기',
  'press up to select a queued message to edit, or enter to send them now': '↑ 키로 고칠 메시지 선택, Enter로 지금 보내기',
  'showing detailed transcript': '자세한 대화 기록 표시 중',
  'conversation compacted': '대화를 압축함',
  'session resumed': '세션 재개됨',
  'session completed successfully': '세션이 끝남',
}

// 키 이름(ctrl+o, esc, enter, ↑ 등) 뒤에 오는 동작. 긴 것부터 맞춘다.
const ACTIONS: Record<string, string> = {
  'interrupt and send': '중단하고 보내기',
  'run in background': '백그라운드 실행',
  'show todos': '할 일 보기',
  'hide todos': '할 일 숨기기',
  'show tasks': '작업 보기',
  'hide tasks': '작업 숨기기',
  'go back': '뒤로',
  'open in editor': '편집기에서 열기',
  'switch mode': '모드 전환',
  interrupt: '중단',
  expand: '펼치기',
  collapse: '접기',
  cycle: '전환',
  cancel: '취소',
  edit: '편집',
  confirm: '확인',
  select: '선택',
  close: '닫기',
  continue: '계속',
  save: '저장',
  dismiss: '닫기',
  view: '보기',
  toggle: '전환',
  stop: '중지',
  delete: '삭제',
  copy: '복사',
  send: '보내기',
  keep: '유지',
  clear: '지우기',
  back: '뒤로',
  add: '추가',
  skip: '건너뛰기',
  open: '열기',
  search: '검색',
  retry: '다시 시도',
  queue: '대기열에 넣기',
  navigate: '이동',
  submit: '제출',
  undo: '되돌리기',
  apply: '적용',
  resume: '재개',
  exit: '종료',
}

// 단어 중간(setup의 up 등)에서 시작하지 않도록 앞을 막는다.
const KEY =
  '(?<![\\w+-])((?:ctrl|shift|alt|option|cmd|meta)[+-]\\S+|(?:esc|escape|tab|enter|return|space|up|down|left|right|backspace)\\b|[↑↓←→/?!@#])'
const key = (pattern: string) => new RegExp(pattern.replaceAll('KEY', KEY), 'gi')
const actions = Object.keys(ACTIONS).sort((a, b) => b.length - a.length).join('|')

// 엔진이 그리는 고정 문구. 앞에서부터 차례로 바꾸고, 사전에 없는 문장은 그대로 둔다.
const PHRASES: ReadonlyArray<readonly [RegExp, string | ((...m: string[]) => string)]> = [
  [/\? for shortcuts/gi, '? 단축키'],
  [key('press KEY again to exit'), '종료하려면 $1 한 번 더'],
  [key('press KEY again to clear'), '지우려면 $1 한 번 더'],
  [key('KEY then KEY'), '$1 다음 $2'],
  [key(`KEY to (${actions})\\b`), (_, k, action) => `${k} ${ACTIONS[action!.toLowerCase()]}`],
  [/accept edits on/gi, '편집 자동 수락 켜짐'],
  [/plan mode on/gi, '계획 모드 켜짐'],
  [/bypass permissions on/gi, '권한 확인 생략 켜짐'],
  [/auto mode on/gi, '자동 모드 켜짐'],
  // /cost
  [/total cost:/gi, '총 비용:'],
  [/total duration \(API\):/gi, '총 소요 시간(API):'],
  [/total duration \(wall\):/gi, '총 소요 시간(실제):'],
  [/total code changes:/gi, '총 코드 변경:'],
  [/(\d+) lines? added/gi, '$1줄 추가'],
  [/(\d+) lines? removed/gi, '$1줄 삭제'],
  [/usage by model:/gi, '모델별 사용량:'],
  [/([\d.,]+[kmb]?) input\b/gi, '입력 $1'],
  [/([\d.,]+[kmb]?) output\b/gi, '출력 $1'],
  [/([\d.,]+[kmb]?) cache read\b/gi, '캐시 읽기 $1'],
  [/([\d.,]+[kmb]?) cache write\b/gi, '캐시 쓰기 $1'],
]

export const ko = (text: string): string => {
  const bare = text.trim().replace(/(…|\.\.\.)$/, '')
  const word = WORDS[bare.toLowerCase()]
  if (word) return word + (bare.length < text.trim().length ? '…' : '')
  return PHRASES.reduce((s, [from, to]) => (typeof to === 'string' ? s.replace(from, to) : s.replace(from, to)), text)
}

// 사전에 없는 문장(안내 줄, 작업 알림, 스킬 설명)은 모델로 번역해 $.store에 남겨 다시 쓴다.
const loadCache = async ($: EngineInterface) => ((await $.store.get(TRANSLATIONS_KEY)) ?? {}) as Record<string, string>

const translateMany = async ($: EngineInterface, texts: readonly string[]): Promise<string[]> => {
  const cache = await loadCache($)
  const missing = [...new Set(texts.filter(t => needsTranslation(t) && !(t in cache)))]
  let isChanged = false
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH)
    const reply = await $.model
      .complete({ model: 'haiku', system: SYSTEM, prompt: JSON.stringify(batch), maxTokens: 8000, effort: 'low', timeoutMs: 30_000 })
      .catch(() => undefined)
    const out = reply?.isAnswered ? parseArray(reply.text, batch.length) : undefined
    if (!out) break // 실패하면 원문을 그대로 보여 주고 다음 기회에 다시 시도한다.
    batch.forEach((t, j) => (cache[t] = out[j]!))
    isChanged = true
  }
  if (isChanged) await $.store.set(TRANSLATIONS_KEY, trim(cache))
  return texts.map(t => cache[t] ?? t)
}

// 같은 문장을 동시에 여러 번 요청하지 않도록 진행 중인 요청을 공유한다.
const pending = new Map<string, Promise<string>>()

// 사전으로 먼저 바꾸고, 못 바꾼 문장만 모델 번역으로 넘긴다.
const toKorean = ($: EngineInterface, text: string): Promise<string> => {
  const fixed = ko(text)
  if (fixed !== text || !needsTranslation(text)) return Promise.resolve(fixed)
  const running = pending.get(text)
  if (running) return running
  const job = translateMany($, [text])
    .then(([out]) => out ?? text)
    .finally(() => pending.delete(text))
  pending.set(text, job)
  return job
}

const SPINNER = ['생각하는 중', '궁리하는 중', '고민하는 중', '정리하는 중', '분석하는 중', '다듬는 중', '짜 맞추는 중', '빚는 중']
const DONE = ['작업함', '생각함', '궁리함', '정리함', '다듬음', '빚어냄']

// 같은 행은 다시 그려도 같은 단어가 나오도록 id로 고른다.
const pick = (list: readonly string[], seed: string) => {
  let n = 0
  for (const c of seed) n = (n * 31 + c.charCodeAt(0)) >>> 0
  return list[n % list.length]!
}

export const duration = (ms: number) => {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}초`
  if (s < 3600) return `${Math.floor(s / 60)}분 ${s % 60}초`
  return `${Math.floor(s / 3600)}시간 ${Math.floor((s % 3600) / 60)}분`
}

const KINDS: Record<string, string> = {
  Read: '파일 {n}개 읽음',
  NotebookRead: '노트북 {n}개 읽음',
  Grep: '{n}회 검색',
  Glob: '{n}회 파일 찾기',
  WebSearch: '웹 {n}회 검색',
  WebFetch: '웹 페이지 {n}개 가져옴',
  Bash: '명령 {n}개 실행',
  PowerShell: '명령 {n}개 실행',
  LS: '폴더 {n}개 확인',
}

export const groupLine = (calls: ReadonlyArray<Pick<ToolGroupCall, 'tool'>>) => {
  const counts = new Map<string, number>()
  for (const { tool } of calls) counts.set(tool, (counts.get(tool) ?? 0) + 1)
  return [...counts]
    .map(([tool, n]) => (KINDS[tool] ?? `${tool} {n}회`).replace('{n}', String(n)))
    .join(', ')
}


const LANGUAGE = {
  id: 'korean-ui:language',
  scope: 'session',
  text: [
    '# 응답 언어',
    '사용자에게 보이는 모든 글(답변, 진행 설명, 질문, 작업 목록, 요약)은 한국어로 쓴다.',
    '코드, 명령어, 파일 경로, 식별자, URL, 오류 메시지 원문 인용은 번역하지 않는다.',
  ].join('\n'),
} as const

export const register: Register = on => {
  // 답변 본문: 화면에서 번역하지 않고 처음부터 한국어로 쓰게 한다.
  on('prompt.compose', async ($, e, next) => {
    const { sections } = await next(e)
    return { sections: [...sections.filter(s => s.id !== LANGUAGE.id), LANGUAGE] }
  })

  on('ui.render', { component: 'Spinner' }, ($, e, next) =>
    next({
      ...e,
      props: {
        ...e.props,
        word: pick(SPINNER, e.requestId + e.props.word),
        message: e.props.message === null ? null : ko(e.props.message),
      },
    }),
  )

  on('ui.render', { component: 'TurnDuration' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>✻ {duration(e.props.durationMs)} 동안 {pick(DONE, e.requestId)}</Text>
  })

  on('ui.render', { component: 'PromptHint' }, ($, e, next) =>
    e.props.hint ? next({ ...e, props: { ...e.props, hint: ko(e.props.hint) } }) : next(e),
  )

  on('ui.render', { component: 'ToolProgress' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, hint: ko(e.props.hint) } }),
  )

  on('ui.render', { component: 'SessionMode' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, modes: e.props.modes.map(ko) } }),
  )

  on('ui.render', { component: 'InfoNotice' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, text: ko(e.props.text) } }),
  )

  on('ui.render', { component: 'CommandOutput' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, text: ko(e.props.text) } }),
  )

  // 대화 중 엔진 안내 줄(notice). 모델이 읽지 않는 행이라 저장되는 글자를 바꿔도 된다.
  on('session.append', { door: 'notice' }, async ($, e, next) => {
    const { message } = e
    if (message.type !== 'system' || message.name === 'local_command') return next(e)
    const content = await Promise.all(
      message.content.map(async block =>
        block.type === 'text' && typeof block.text === 'string' ? { ...block, text: await toKorean($, block.text) } : block,
      ),
    )
    return next({ ...e, message: { ...message, content } })
  }).catch(($, e, next) => next(e))

  // 백그라운드 작업 알림 줄. 화면에 그리는 글자만 바꾸고 모델이 읽는 원문은 그대로 둔다.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) =>
    e.props.origin.kind === 'task-notification'
      ? next({ ...e, props: { ...e.props, text: await toKorean($, e.props.text) } })
      : next(e),
  )

  // /config 메뉴는 엔진 화면 그대로 두고 항목 이름만 바꾼다.
  on('config.describe', async ($, e, next) => {
    const row = await next(e)
    return { ...row, label: CONFIG_LABELS[row.label] ?? row.label }
  })

  // 스킬·플러그인 명령 설명은 시작 직후 한 번에 번역해 두고, 끝나면 메뉴가 설명을 다시 묻게 한다.
  on('session.start', async ($, e, next) => {
    const work = async () => {
      const commands = await $.command.list()
      await translateMany($, commands.filter(c => !COMMAND_DESCRIPTIONS[c.name]).map(c => c.description))
      $.ui.invalidate('command.describe')
    }
    $.clock.after(3000, () => void work().catch(() => {}))
    return next(e)
  })

  on('command.describe', async ($, e, next) => {
    const row = await next(e)
    const description = COMMAND_DESCRIPTIONS[e.command] ?? (await loadCache($))[row.description] ?? row.description
    return { ...row, description }
  })

  // 접힌 도구 묶음(`Read 3 files, ran 2 shell commands`)만 한국어 한 줄로 다시 그린다.
  on('ui.render', { component: 'ToolGroup' }, ($, e, next) => {
    if (e.props.isExpanded) return next(e)
    const { Text } = $.ui.resolve(e)
    return (
      <Text dimColor>
        {groupLine(e.props.calls)}
        {e.props.isActive ? '…' : ''} (ctrl+o 펼치기)
      </Text>
    )
  })
}
