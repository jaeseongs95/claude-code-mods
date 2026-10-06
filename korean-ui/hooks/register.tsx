import type { Register, ToolGroupCall } from 'claude-code'

import { COMMAND_DESCRIPTIONS, CONFIG_LABELS } from './dict'

// 문자열 전체가 이 단어일 때만 바꾼다(문장 속 같은 단어는 건드리지 않는다).
const WORDS: Record<string, string> = {
  focus: '집중',
  'memory paused': '메모리 일시 정지',
  interrupted: '중단됨',
  thinking: '생각 중',
  waiting: '대기 중',
  running: '실행 중',
  'compacting conversation': '대화 압축 중',
}

const KEY = '((?:ctrl|shift|alt|option|cmd|meta|esc|tab|enter)\\S*)'
const key = (pattern: string) => new RegExp(pattern.replace('KEY', KEY), 'gi')

// 엔진이 그리는 고정 문구. 앞에서부터 차례로 바꾸고, 사전에 없는 문장은 그대로 둔다.
const PHRASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\? for shortcuts/gi, '? 단축키'],
  [key('press KEY again to exit'), '종료하려면 $1 한 번 더'],
  [key('press KEY again to clear'), '지우려면 $1 한 번 더'],
  [key('KEY to interrupt'), '$1 중단'],
  [key('KEY to run in background'), '$1 백그라운드 실행'],
  [key('KEY to expand'), '$1 펼치기'],
  [key('KEY to collapse'), '$1 접기'],
  [key('KEY to show todos'), '$1 할 일 보기'],
  [key('KEY to hide todos'), '$1 할 일 숨기기'],
  [key('KEY to cycle'), '$1 전환'],
  [key('KEY to cancel'), '$1 취소'],
  [key('KEY to edit'), '$1 편집'],
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

export const ko = (text: string): string =>
  WORDS[text.trim().toLowerCase()] ??
  PHRASES.reduce((s, [from, to]) => s.replace(from, to), text)

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

  // /config 메뉴는 엔진 화면 그대로 두고 항목 이름만 바꾼다.
  on('config.describe', async ($, e, next) => {
    const row = await next(e)
    return { ...row, label: CONFIG_LABELS[row.label] ?? row.label }
  })

  on('command.describe', async ($, e, next) => {
    const row = await next(e)
    return { ...row, description: COMMAND_DESCRIPTIONS[e.command] ?? row.description }
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
