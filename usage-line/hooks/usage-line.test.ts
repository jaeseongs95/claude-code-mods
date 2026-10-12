import { expect, mock, test } from 'claude-code/testing'
import { addUsage, COMPACT_PROMPT, extraButtons, format, hitRatio, humanTokens, modelName, parseGit } from './register'

const plain = (rows: { text: string }[][]) => rows.map(r => r.map(x => x.text).join(''))

test('humanTokens는 스크립트와 같은 단위로 줄인다', async () => {
  expect(humanTokens(999)).toBe('999')
  expect(humanTokens(240591)).toBe('240k')
  expect(humanTokens(1000000)).toBe('1M')
  expect(humanTokens(1500000)).toBe('1.5M')
})

test('parseGit은 브랜치·스테이징·수정·미추적·ahead/behind를 센다', async () => {
  const out = [
    '# branch.oid 0123456789abcdef',
    '# branch.head main',
    '# branch.upstream origin/main',
    '# branch.ab +2 -1',
    '1 M. N... 100644 100644 100644 a b staged.ts',
    '1 .M N... 100644 100644 100644 a b modified.ts',
    '1 MM N... 100644 100644 100644 a b both.ts',
    '? new.ts',
  ].join('\n')
  expect(parseGit(out)).toEqual({ branch: 'main', staged: 2, modified: 2, untracked: 1, ahead: 2, behind: 1 })
  expect(parseGit('# branch.oid 0123456789abcdef\n# branch.head (detached)')?.branch).toBe('0123456')
})

test('format은 1줄에 위치·모델, 2줄에 컨텍스트·비용·한도를 묶는다', async () => {
  const line = format({
    dir: 'proj',
    git: { branch: 'main', staged: 1, modified: 0, untracked: 3, ahead: 0, behind: 0 },
    ctxPct: 42,
    ctxTokens: 84000,
    ctxWindow: 200000,
    cost: 1.234,
    cacheHit: 87,
    five: { pct: 30.4, reset: '14:00' },
    seven: 12,
    scoped: [{ name: 'Fable', pct: 5 }],
    model: 'Opus 5.5',
    effort: 'high',
  })
  expect(plain(line)).toEqual([
    'proj on  main [+1 ?3]  │  Opus 5.5 ⚡high',
    'ctx 42% 84k/200k · cache 87%  │  $1.23  │  5h 30% →14:00 · 7d 12% · Fable 5%',
  ])
  expect(plain(format({ dir: 'x', scoped: [] }))).toEqual(['x', 'ctx 0%  │  $0.00'])
})

test('사용률은 한도에 가까울 때만 노랑·빨강으로 칠한다', async () => {
  const color = (v: number) => format({ dir: 'x', seven: v, scoped: [] })[1]!.find(g => g.text === `${v}%` && g.color !== undefined)?.color
  expect(color(69)).toBeUndefined()
  expect(color(70)).toBe('yellow')
  expect(color(95)).toBe('red')
})

test('modelName은 모델 ID를 표시 이름으로 바꾼다', async () => {
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelName('claude-fable-5-1')).toBe('Fable 5.1')
  expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(modelName('claude-opus-5-5[1m]')).toBe('Opus 5.5 [1m]')
  expect(modelName('Opus 5.5')).toBe('Opus 5.5')
})

test('diff 는 커밋 안 한 변경이 있을 때, usage 는 5h·7d 가 70% 이상일 때만 보인다', async () => {
  const git = (staged: number, modified: number, untracked = 0) => ({ branch: 'main', staged, modified, untracked, ahead: 0, behind: 0 })
  expect(extraButtons({ dir: 'x', scoped: [] })).toEqual([])
  expect(extraButtons({ dir: 'x', git: git(0, 0, 3), scoped: [] })).toEqual([])
  expect(extraButtons({ dir: 'x', git: git(1, 0), scoped: [] })).toEqual(['diff'])
  expect(extraButtons({ dir: 'x', git: git(0, 2), five: { pct: 69 }, seven: 69, scoped: [] })).toEqual(['diff'])
  expect(extraButtons({ dir: 'x', five: { pct: 70 }, scoped: [] })).toEqual(['usage'])
  expect(extraButtons({ dir: 'x', seven: 90, scoped: [] })).toEqual(['usage'])
})

test('띠 버튼을 누르면 해당 명령을 실행한다', async ($, on) => {
  // 띠를 채우려고 refresh 가 묻는 엔진 호출에 고정값으로 답한다.
  on('session.cwd', () => ({ value: 'D:/proj' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.id', () => ({ value: 's1' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000, tokens: 1000, percent: 1 }, rateLimits: [{ kind: 'five_hour', percentUsed: 75 }] } }))
  // 수정한 파일이 있고 5h 가 75% 라서 [diff] [usage] 도 보인다.
  on('process.run', () => ({ value: { exitCode: 0, stdout: '# branch.head main\n1 .M N... 100644 100644 100644 a b f.ts', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('env.get', () => ({ value: undefined }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { modelSettings: { 'claude-opus-5-5': { effortLevel: 'high' } } } }))
  const ran: string[] = []
  on('command.run', (_, e) => (ran.push(e.args ? `${e.command} ${e.args}` : e.command), { text: '' }))
  await $.session.measure({ context: { window: 1000000 }, rateLimits: [], changed: ['context'] })

  const mount = (surface: 'terminal' | 'desktop', bodyColumns: number) =>
    $.ui.mount({
      plugin: 'usage-line',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns, scroll: { offset: 0, bodyRows: 3 }, view: {} },
    })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mount(surface, 120)
    for (const key of ['status', 'context', 'diff', 'usage', 'compact']) await ui.press({ key })
    await ui.unmount()
  }
  const once = ['status', 'context', 'diff', 'usage', `compact ${COMPACT_PROMPT}`]
  expect(ran).toEqual([...once, ...once])

  // 넓으면 모두 [ label ], 좁으면 compact 말고는 테두리 없는 흐린 라벨. 버튼 묶음은 줄지 않는다.
  const plain = async (bodyColumns: number) => {
    const ui = await mount('terminal', bodyColumns)
    const r = await Promise.all(['status', 'diff', 'compact'].map(async key => (await ui.find({ type: 'Button', key }))?.props.plain))
    await ui.unmount()
    return r
  }
  expect(await plain(120)).toEqual([undefined, undefined, undefined])
  expect(await plain(60)).toEqual([true, true, undefined])
})

test('요청 전에는 settings 의 모델별 effortLevel 을 보여 준다', async ($, on) => {
  on('session.cwd', () => ({ value: 'D:/proj' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.id', () => ({ value: 's1' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000 }, rateLimits: [] } }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('env.get', () => ({ value: undefined }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { modelSettings: { 'claude-opus-5-5': { effortLevel: 'xhigh' } } } }))
  await $.session.measure({ context: { window: 1000000 }, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({
    plugin: 'usage-line',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 120, scroll: { offset: 0, bodyRows: 3 }, view: {} },
  })
  expect(await ui.find({ type: 'Text', text: '⚡xhigh' })).toBeDefined()
  await ui.unmount()
})

test('캐시 누적은 같은 대화에서 쌓이고, 세션 id 가 바뀌면(/clear) 0부터 센다', async () => {
  const u = (read: number, input: number, creation = 0) => ({ cache_read_input_tokens: read, input_tokens: input, cache_creation_input_tokens: creation })
  let c = addUsage(null, 's1', u(90, 10))
  c = addUsage(c, 's1', u(0, 0, 100))
  expect(c).toEqual({ sessionId: 's1', read: 90, total: 200 })
  expect(hitRatio(c, 's1')).toBe(45)
  expect(hitRatio(c, 's2')).toBeUndefined()
  expect(addUsage(c, 's2', u(5, 5))).toEqual({ sessionId: 's2', read: 5, total: 10 })
  expect(hitRatio(null, 's1')).toBeUndefined()
})

test('세션이 시작되면 10초마다 다시 읽는다', async ($, on) => {
  const clock = mock.clock(on)
  let gitRuns = 0
  on('session.cwd', () => ({ value: 'D:/proj' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.id', () => ({ value: 's1' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000 }, rateLimits: [] } }))
  on('process.run', () => (gitRuns++, { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('env.get', () => ({ value: undefined }))
  on('settings.read', () => ({ value: {} }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: 'D:/proj', surface: 'terminal', isInteractive: true })
  expect(gitRuns).toBe(1)
  await clock.advance(9_999)
  expect(gitRuns).toBe(1)
  await clock.advance(1)
  expect(gitRuns).toBe(2)
  await clock.advance(20_000)
  expect(gitRuns).toBe(4)
})
