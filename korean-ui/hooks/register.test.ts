import { expect, test } from 'claude-code/testing'

import { duration, groupLine, ko } from './register'
import { needsTranslation, parseArray } from './translate'

test('실제 엔진 문구와 키+동작 힌트', () => {
  expect(ko('Esc again to clear')).toBe('Esc를 한 번 더 누르면 지움')
  expect(ko('Compacting conversation…')).toBe('대화 압축 중…')
  expect(ko('enter to interrupt and send')).toBe('enter 중단하고 보내기')
  expect(ko('ctrl+x then enter to queue')).toBe('ctrl+x 다음 enter 대기열에 넣기')
  expect(ko('/ to search · esc to close')).toBe('/ 검색 · esc 닫기')
  expect(ko('Press Ctrl-C again to exit')).toBe('종료하려면 Ctrl-C 한 번 더')
  // 단어 중간이나 키가 아닌 단어 뒤의 "to"는 건드리지 않는다.
  expect(ko('run setup to continue')).toBe('run setup to continue')
  expect(ko('files to edit')).toBe('files to edit')
})

test('모델 번역 대상 판별과 응답 해석', () => {
  expect(needsTranslation('Session resumed without branch: main')).toBe(true)
  expect(needsTranslation('이미 한국어')).toBe(false)
  expect(needsTranslation('42 / 7')).toBe(false)
  expect(parseArray('```json\n["가", "나"]\n```', 2)).toEqual(['가', '나'])
  expect(parseArray('["가"]', 2)).toBeUndefined()
  expect(parseArray('not json', 1)).toBeUndefined()
})

test('안내 줄(notice)은 사전에 있으면 모델 없이 바꾼다', async ($, on) => {
  // 테스트에는 행을 저장할 엔진이 없어 호출은 실패한다. 플러그인이 아래로 넘긴 행만 본다.
  let seen: unknown
  on('session.append', ($, e, next) => {
    seen = e.message.content[0]?.text
    return next(e)
  })
  await $.session
    .append({
      door: 'notice',
      origin: { kind: 'engine' },
      uuid: 'u1',
      message: { type: 'system', name: 'compact_boundary', content: [{ type: 'text', text: 'Conversation compacted' }] },
    })
    .catch(() => {})
  expect(seen).toBe('대화를 압축함')
})

const ENGINE = { plugin: 'engine', tier: 'core' } as const

test('/config 항목 이름을 바꾸고 모르는 항목은 그대로 둔다', async ($, on) => {
  on('config.describe', ($, e) => ({ label: e.label, isHidden: e.isHidden }))
  const tips = await $.config.describe({ key: 'tips', label: 'Show tips', isHidden: false, provider: ENGINE })
  const other = await $.config.describe({ key: 'x', label: 'Brand new row', isHidden: false, provider: ENGINE })
  expect(tips.label).toBe('팁 표시')
  expect(other.label).toBe('Brand new row')
})

test('사전에 없는 /config 항목은 모델 번역 결과를 쓴다', async ($, on) => {
  on('config.describe', ($, e) => ({ label: e.label, isHidden: e.isHidden }))
  on('store.get', () => ({ value: { 'Brand new row': '새 항목' } }))
  const row = await $.config.describe({ key: 'x', label: 'Brand new row', isHidden: false, provider: ENGINE })
  expect(row.label).toBe('새 항목')
})

test('명령 설명을 바꾼다', async ($, on) => {
  on('command.describe', ($, e) => ({ description: e.description, isHidden: false }))
  const clear = await $.command.describe({
    command: 'clear', description: 'Start a new session', isHidden: false, immediate: false, provider: ENGINE,
  })
  expect(clear.description).toContain('새 세션')
})

test('고정 문구를 한국어로 바꾼다', () => {
  expect(ko('? for shortcuts')).toBe('? 단축키')
  expect(ko('esc to interrupt')).toBe('esc 중단')
  expect(ko('(ctrl+b to run in background)')).toBe('(ctrl+b 백그라운드 실행)')
  expect(ko('Interrupted')).toBe('중단됨')
  expect(ko('Total cost: $0.12')).toBe('총 비용: $0.12')
  expect(ko('1.2k input, 300 output')).toBe('입력 1.2k, 출력 300')
})

test('사전에 없는 문장과 문장 속 단어는 그대로 둔다', () => {
  expect(ko('npm run build')).toBe('npm run build')
  expect(ko('the input file is running')).toBe('the input file is running')
})

test('시간과 도구 묶음 줄', () => {
  expect(duration(3000)).toBe('3초')
  expect(duration(64000)).toBe('1분 4초')
  expect(groupLine([{ tool: 'Read' }, { tool: 'Read' }, { tool: 'Bash' }])).toBe('파일 2개 읽음, 명령 1개 실행')
})

test('시스템 프롬프트 끝에 한국어 응답 지시를 한 번 붙인다', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'x', scope: 'shared' }] }))
  const { sections } = await $.prompt.compose({
    model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [],
  })
  expect(sections.map(s => s.id)).toEqual(['intro', 'korean-ui:language'])
})
