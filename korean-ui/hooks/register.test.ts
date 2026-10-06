import { expect, test } from 'claude-code/testing'

import { duration, groupLine, ko } from './register'

const ENGINE = { plugin: 'engine', tier: 'core' } as const

test('/config 항목 이름을 바꾸고 모르는 항목은 그대로 둔다', async ($, on) => {
  on('config.describe', ($, e) => ({ label: e.label, isHidden: e.isHidden }))
  const tips = await $.config.describe({ key: 'tips', label: 'Show tips', isHidden: false, provider: ENGINE })
  const other = await $.config.describe({ key: 'x', label: 'Brand new row', isHidden: false, provider: ENGINE })
  expect(tips.label).toBe('팁 표시')
  expect(other.label).toBe('Brand new row')
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
