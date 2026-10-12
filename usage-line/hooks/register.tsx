import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Cache, Seg } from '../types'

const band = atom({ plugin: 'usage-line', key: 'rows' } as const, [] as Seg[][])
// 상황에 따라 [status] [context] 와 [compact] 사이에 끼우는 버튼 이름.
const extra = atom({ plugin: 'usage-line', key: 'buttons' } as const, [] as string[])

// ~/.claude/statusline-usage.sh 의 정보를 두 줄 띠로 그린다. 스크립트에 있던 vim 모드는 mod API로 읽을 수 없어 뺐다.
//   1줄 "어디서·무엇으로": 폴더 · git · 모델 ⚡effort  (+ [status] [context] [diff?] [usage?] [compact] 버튼)
//   2줄 "얼마나": 컨텍스트 · 캐시 | 비용 | 사용 한도(5h · 7d · 모델별)
// 색 규칙: 라벨과 부가 정보는 흐리게, 값은 기본 글자색. 한도에 가까워질 때만 노랑·빨강으로 눈에 띄게 한다.
// 정체성(폴더·브랜치·모델·effort)만 고유 색을 쓴다.

export type Git = { branch: string; staged: number; modified: number; untracked: number; ahead: number; behind: number }
export type Line = {
  dir: string
  git?: Git
  ctxPct?: number
  ctxTokens?: number
  ctxWindow?: number
  cost?: number
  cacheHit?: number
  five?: { pct: number; reset?: string }
  seven?: number
  scoped: { name: string; pct: number }[]
  model?: string
  effort?: string
}

const LAVENDER = '#af87ff', ORANGE = '#ff8700'
const s = (text: string, color?: string, bold?: boolean): Seg => ({ text, color, bold })
const dim = (text: string): Seg => ({ text, dim: true })

// pct 가 warn 이상이면 노랑, crit 이상이면 굵은 빨강.
const pct = (label: string, v: number, warn: number, crit: number, note?: string): Seg[] => [
  dim(`${label} `),
  { text: `${Math.round(v)}%`, color: v >= crit ? 'red' : v >= warn ? 'yellow' : undefined, bold: v >= crit },
  ...(note ? [dim(` ${note}`)] : []),
]
const join = (items: Seg[][], sep: Seg) => items.filter(i => i.length).flatMap((g, i) => (i ? [sep, ...g] : g))
const DOT = dim(' · '), BAR = dim('  │  ')

export function humanTokens(n: number): string {
  if (n >= 1e6) {
    const m = Math.floor(n / 1e6), f = Math.floor((n % 1e6) / 1e5)
    return f ? `${m}.${f}M` : `${m}M`
  }
  return n >= 1000 ? `${Math.floor(n / 1000)}k` : String(n)
}

// $.session.model() 은 ID(claude-opus-5-5)를 준다. 스크립트처럼 표시 이름(Opus 5.5)으로 바꾸고, 모르는 형식이면 그대로 둔다.
export function modelName(id: string): string {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(\[.+\])?$/.exec(id)
  if (!m) return id
  const [, family = '', major, minor, suffix] = m
  return `${family[0]?.toUpperCase()}${family.slice(1)} ${major}${minor ? `.${minor}` : ''}${suffix ? ` ${suffix}` : ''}`
}

const EFFORT: Record<string, Omit<Seg, 'text'>> = {
  low: { color: 'gray' },
  medium: { color: 'cyan' },
  high: { color: 'yellow' },
  xhigh: { color: ORANGE },
  max: { color: 'red', bold: true },
}

export function format(d: Line): Seg[][] {
  const loc = [s(d.dir, 'cyan', true)]
  if (d.git) {
    const g = d.git
    loc.push(dim(' on '), s(` ${g.branch}`, 'magenta', true))
    const parts = [
      g.staged && s(`+${g.staged}`, 'green'),
      g.modified && s(`!${g.modified}`, 'yellow'),
      g.untracked && s(`?${g.untracked}`, 'red'),
      g.ahead && s(`⇡${g.ahead}`, 'cyan'),
      g.behind && s(`⇣${g.behind}`, 'magenta'),
    ].filter((p): p is Seg => !!p)
    if (parts.length) loc.push(dim(' ['), ...parts.flatMap((p, i) => (i ? [s(' '), p] : [p])), dim(']'))
  }

  const model = d.model ? [s(d.model, LAVENDER)] : []
  if (d.effort) model.push(...(model.length ? [s(' ')] : []), { ...(EFFORT[d.effort] ?? {}), text: `⚡${d.effort}` })

  const tokens = d.ctxTokens !== undefined && d.ctxWindow !== undefined ? `${humanTokens(d.ctxTokens)}/${humanTokens(d.ctxWindow)}` : undefined
  const context = join([
    pct('ctx', d.ctxPct ?? 0, 60, 80, tokens),
    d.cacheHit !== undefined ? [dim('cache '), s(`${d.cacheHit}%`)] : [],
  ], DOT)
  const limits = join([
    d.five ? pct('5h', d.five.pct, 70, 90, d.five.reset && `→${d.five.reset}`) : [],
    d.seven !== undefined ? pct('7d', d.seven, 70, 90) : [],
    ...d.scoped.map(x => pct(x.name, x.pct, 70, 90)),
  ], DOT)

  return [
    join([loc, model], BAR),
    join([context, [s(`$${(d.cost ?? 0).toFixed(2)}`)], limits], BAR),
  ]
}

// 필요할 때만 보이는 버튼: 커밋 안 한 변경이 있으면 [diff], 5h·7d 한도가 노랑(70%) 이상이면 [usage].
export function extraButtons(d: Line): string[] {
  const near = Math.max(d.five?.pct ?? 0, d.seven ?? 0) >= 70
  return [...(d.git && d.git.staged + d.git.modified ? ['diff'] : []), ...(near ? ['usage'] : [])]
}

// git status --porcelain=v2 --branch 한 번으로 브랜치·스테이징·수정·미추적·ahead/behind를 모두 읽는다.
export function parseGit(out: string): Git | undefined {
  const g: Git = { branch: '', staged: 0, modified: 0, untracked: 0, ahead: 0, behind: 0 }
  let oid = ''
  for (const l of out.split('\n')) {
    if (l.startsWith('# branch.head ')) g.branch = l.slice(14)
    else if (l.startsWith('# branch.oid ')) oid = l.slice(13)
    else if (l.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(l)
      if (m) { g.ahead = Number(m[1]); g.behind = Number(m[2]) }
    } else if (/^[12u] /.test(l)) {
      if (l[2] !== '.') g.staged++
      if (l[3] !== '.') g.modified++
    } else if (l.startsWith('? ')) g.untracked++
  }
  if (!g.branch) return undefined
  if (g.branch === '(detached)') g.branch = oid.slice(0, 7)
  return g
}

const hhmm = (iso?: string) => {
  if (!iso) return undefined
  const t = new Date(iso)
  return isNaN(+t) ? undefined : `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
}

// 모델별 주간 창: 상태 줄 입력에 없어서 Claude Code가 ~/.claude.json 에 캐시해 둔 값을 읽는다.
// 다른 계정 캐시거나 24시간 넘게 갱신이 없으면 버린다(스크립트와 같은 규칙).
async function readScoped($: EngineInterface) {
  const home = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  try {
    const j = JSON.parse((await $.fs.read(`${home}/.claude.json`)) as string)
    const cu = j.cachedUsageUtilization, uuid = j.oauthAccount?.accountUuid ?? ''
    if (!cu || (cu.accountUuid ?? uuid) !== uuid || (await $.clock.now()) -(cu.fetchedAtMs ?? 0) >= 864e5) return []
    return (cu.utilization?.limits ?? [])
      .filter((r: any) => r?.kind === 'weekly_scoped' && typeof r.scope?.model?.display_name === 'string' && typeof r.percent === 'number')
      .map((r: any) => ({ name: r.scope.model.display_name as string, pct: r.percent as number }))
  } catch {
    return []
  }
}

// 프롬프트 캐시 적중률 = 이 대화의 메인 스레드 요청 누적 cache_read / 전체 입력 토큰.
// 리로드 뒤에도 남게 state 에 두고, 대화가 바뀌면(/clear 는 session.start 없이 세션 id만 바뀐다) 0부터 센다.
// 새 프로세스(resume 포함)에서는 state 가 비어 있어 0부터 센다.
const cacheAcc = atom({ plugin: 'usage-line', key: 'cache' } as const, null as Cache | null)

export function addUsage(prev: Cache | null, sessionId: string, u: { input_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }): Cache {
  const base = prev?.sessionId === sessionId ? prev : { sessionId, read: 0, total: 0 }
  return {
    sessionId,
    read: base.read + u.cache_read_input_tokens,
    total: base.total + u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens,
  }
}

export const hitRatio = (c: Cache | null, sessionId: string) =>
  c?.sessionId === sessionId && c.total > 0 ? Math.round((c.read / c.total) * 100) : undefined

// effort 는 모델 요청(turn.step)이 있어야 알 수 있다. 그 값은 리로드 뒤에도 남게 state 에 두고,
// 아직 요청이 없으면 settings 의 modelSettings[모델 ID].effortLevel(없으면 effortLevel)로 채운다.
const lastEffort = atom({ plugin: 'usage-line', key: 'effort' } as const, null as string | null)

async function settingsEffort($: EngineInterface, modelId: string) {
  const s = (await $.settings.read({})) as {
    modelSettings?: Record<string, { effortLevel?: unknown } | undefined>
    effortLevel?: unknown
  }
  const v = s.modelSettings?.[modelId]?.effortLevel ?? s.effortLevel
  return typeof v === 'string' ? v : undefined
}

async function refresh($: EngineInterface) {
  const cwd = await $.session.cwd()
  const [usage, model, git, scoped] = await Promise.all([
    $.session.usage(),
    $.session.model(),
    $.process
      .run(['git', '--no-optional-locks', 'status', '--porcelain=v2', '--branch', '-uall'], { cwd })
      .then(r => (r.exitCode === 0 ? parseGit(r.stdout) : undefined), () => undefined),
    readScoped($),
  ])
  const effort = (await read($, lastEffort)) ?? (await settingsEffort($, model))
  const cacheHit = hitRatio(await read($, cacheAcc), await $.session.id())
  const rate = (k: string) => usage.rateLimits.find(r => r.kind === k)
  const five = rate('five_hour'), seven = rate('seven_day')
  const d: Line = {
    dir: cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd,
    git,
    ctxPct: usage.context.percent,
    ctxTokens: usage.context.tokens,
    ctxWindow: usage.context.window,
    cost: usage.cost?.usd,
    cacheHit,
    five: five && { pct: five.percentUsed, reset: hhmm(five.resetsAt) },
    seven: seven?.percentUsed,
    scoped,
    model: modelName(model),
    effort,
  }
  await update($, band, () => format(d))
  await update($, extra, () => extraButtons(d))
}

const REFRESH_MS = 10_000
// [compact] 버튼이 /compact 뒤에 붙이는 요약 지시.
export const COMPACT_PROMPT =
  '현재 상황을 유지하고 이어서 작업할 수 있게 요약해 줘. 사용자의 요청 원문과 목표, 확정된 결정과 그 이유, ' +
  '수정한 파일 경로와 핵심 변경, 실행한 검증과 결과(실패 메시지 포함), 진행 중인 작업과 남은 할 일, ' +
  '사용자가 준 제약과 피드백은 빠짐없이 남기고, 끝난 탐색 과정과 긴 도구 출력은 결론만 남겨.'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await refresh($)
    // 이벤트가 없어도(대기 중, Claude 밖의 git 변경) 10초마다 다시 읽는다. 앞선 갱신이 안 끝났으면 건너뛴다.
    // 리로드하면 엔진이 이전 타이머를 버리므로 따로 cancel 하지 않는다.
    let busy = false
    $.clock.every(REFRESH_MS, () => {
      if (busy) return
      busy = true
      refresh($).finally(() => (busy = false))
    })
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rows = await read($, band)
    if (!rows.length) return next(e)
    const buttons = await read($, extra)
    // 띠에 두 줄 자리가 없으면 한 줄로 합친다.
    const [top = [], bottom = []] = e.props.maxRows >= 2 ? rows : [join(rows, BAR)]
    const { Box, Button, Text } = $.ui.resolve(e)
    const draw = (segs: Seg[]) => (
      <Text wrap="truncate-end">
        {segs.map(g => (
          <Text color={g.color} bold={g.bold} dimColor={g.dim}>
            {g.text}
          </Text>
        ))}
      </Text>
    )
    // 버튼은 짧은 첫 줄 끝에 둔다: 폭이 좁아도 잘리지 않고, 긴 둘째 줄만 끝이 잘린다.
    // 응답 중에 누르면 응답이 끝난 뒤 열린다.
    const run = (command: string, args?: string) =>
      $.command.run({ command, args }).catch(err => $.ui.toast(`/${command} 실행 실패: ${err}`))
    return (
      // 위 대화와 붙어 보이지 않게 한 줄 띄운다. 자리가 모자라면 띄우지 않는다.
      <Box flexDirection="column" marginTop={e.props.maxRows > (bottom.length ? 2 : 1) ? 1 : 0}>
        <Box>
          {draw(top)}
          <Text> </Text>
          {['status', 'context', ...buttons].map(c => (
            <Box key={c} paddingLeft={1}>
              <Button key={c} label={c} onPress={() => void run(c)} />
            </Box>
          ))}
          <Text> </Text>
          <Button key="compact" label="compact" onPress={() => void run('compact', COMPACT_PROMPT)} />
        </Box>
        {bottom.length ? <Box paddingLeft={2}>{draw(bottom)}</Box> : null}
      </Box>
    )
  })

  // 메인 스레드 요청만 본다: effort 와 프롬프트 캐시 누적값.
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    if (e.agentId === undefined) {
      if (typeof e.effort === 'string') await update($, lastEffort, () => e.effort as string)
      if (r.usage) {
        const usage = r.usage, id = await $.session.id()
        await update($, cacheAcc, c => addUsage(c, id, usage))
      }
    }
    return r
  })

  on('session.measure', async ($, e, next) => {
    const r = await next(e)
    await refresh($)
    return r
  })

  // 턴 중 파일이 바뀌면 git 구간을 갱신한다.
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined) await refresh($)
    return r
  })
}
