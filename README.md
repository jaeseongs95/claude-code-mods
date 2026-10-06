# Claude-Status

Claude Code mod 플러그인 두 개와, 이를 설치하는 마켓플레이스 `local-mods`를 담은 저장소입니다.

- `usage-line`: 입력창 바로 위에 작업 상태와 사용량을 두 줄 띠로 보여 줍니다.
- `korean-ui`: 화면에 보이는 영문을 한국어로 바꿉니다. [아래 절](#korean-ui) 참고.

## usage-line

`~/.claude/statusline-usage.sh` 상태 줄에 나오던 정보를 mod API로 다시 그립니다. 스크립트를 실행하지는 않으며, 스크립트에 있던 vim 모드 표시는 mod API로 읽을 수 없어 뺐습니다.

> mod(function hooks) API는 early access 기능이라 Claude Code 릴리스에 따라 바뀔 수 있습니다.

### 화면 구성

```
proj on  main [+1 ?3]  │  Opus 5.5 ⚡high  [status] [compact]
  ctx 42% 84k/200k · cache 87%  │  $1.23  │  5h 30% →14:00 · 7d 12% · Fable 5%
```

**1줄: 어디서, 무엇으로**

- 폴더 이름과 git 브랜치. 브랜치 뒤 괄호에는 스테이징(`+`), 수정(`!`), 미추적(`?`), ahead(`⇡`), behind(`⇣`) 개수를 0이 아닌 것만 표시합니다. detached 상태면 커밋 해시 앞 7자리를 보여 줍니다.
- 모델 표시 이름(`claude-opus-5-5` → `Opus 5.5`)과 effort. effort는 마지막 모델 요청 값을 쓰고, 아직 요청이 없으면 settings의 `modelSettings[모델 ID].effortLevel`, 그것도 없으면 `effortLevel`을 씁니다.
- `[status]` 버튼은 `/status`를, `[compact]` 버튼은 이어서 작업할 수 있게 요약하라는 지시문을 붙여 `/compact`를 실행합니다. 응답 중에 누르면 응답이 끝난 뒤 실행됩니다.

**2줄: 얼마나**

- `ctx`: 컨텍스트 사용률과 토큰 수(사용/창 크기)
- `cache`: 프롬프트 캐시 적중률. 이 대화의 메인 스레드 요청에서 누적한 `cache_read` 토큰을 전체 입력 토큰으로 나눈 값입니다. `/clear`로 세션 id가 바뀌거나 Claude Code를 새로 시작하면(resume 포함) 0부터 다시 셉니다.
- 세션 비용(USD)
- `5h`(초기화 시각 포함), `7d` 사용 한도와 모델별 주간 한도. 모델별 한도는 상태 줄 입력에 없어서 Claude Code가 `~/.claude.json`에 캐시해 둔 값을 읽으며, 다른 계정의 캐시이거나 24시간 넘게 갱신되지 않았으면 표시하지 않습니다.

라벨과 부가 정보는 흐리게, 값은 기본 글자색으로 그립니다. 사용률은 한도에 가까울 때만 색을 바꿉니다.

| 항목 | 노랑 | 굵은 빨강 |
| --- | --- | --- |
| `ctx` | 60% 이상 | 80% 이상 |
| `5h`, `7d`, 모델별 한도 | 70% 이상 | 90% 이상 |

띠에 두 줄을 그릴 자리가 없으면 한 줄로 합칩니다.

### 갱신 시점

- 세션 시작 시, 그리고 그 뒤 10초마다(대기 중이거나 Claude 밖에서 git 상태가 바뀐 경우 반영)
- 사용량이 다시 측정될 때(`session.measure`)
- 메인 스레드의 턴이 끝날 때

git 정보는 `git status --porcelain=v2 --branch` 한 번으로 읽으므로 `git`이 PATH에 있어야 합니다. git 저장소가 아닌 폴더에서는 git 구간을 표시하지 않습니다.

## korean-ui

플러그인 API가 바꿀 수 있게 열어 둔 화면 요소만 한국어로 바꿉니다.

| 위치 | 원래 | 바뀐 뒤 |
| --- | --- | --- |
| Claude 답변·질문·작업 목록 | 영어로 답할 때가 있음 | 시스템 프롬프트에 지시를 붙여 한국어로 답하게 함 |
| 작업 중 표시 | `Sauteing…` | `궁리하는 중…` |
| 턴 종료 줄 | `✻ Baked for 3s` | `✻ 3초 동안 궁리함` |
| 입력창 아래 힌트 | `? for shortcuts`, `esc to interrupt` | `? 단축키`, `esc 중단` |
| 모드 표시 | `plan mode on` | `계획 모드 켜짐` |
| 접힌 도구 묶음 | `Read 3 files, ran 2 shell commands` | `파일 3개 읽음, 명령 2개 실행 (ctrl+o 펼치기)` |
| `/config` 메뉴 항목 | `Auto-compact`, `Show tips` | `자동 압축`, `팁 표시` |
| `/` 자동완성 명령 설명 | `Start a new session …` | `빈 컨텍스트로 새 세션 시작 …` |

사전에 없는 문장은 섞인 문장이 되지 않도록 원문 그대로 둡니다. 코드, 명령어, 경로, 식별자는 번역하지 않습니다.

바꾸지 못하는 것: 시작 로고, 권한 확인 창, `/status`·`/usage` 창, `/config`의 탭 이름과 설정값, 도구 실행 줄(`Bash(...)`). 이 화면들은 플러그인 API에 바꿀 수 있는 지점이 없습니다.

`/config` 항목 이름은 Claude Code 2.1.291에서 뽑은 영문 label을 키로 씁니다. 버전이 바뀌어 label이 달라지면 그 항목은 영문으로 남으므로 `korean-ui/hooks/dict.ts`에 추가합니다.

## 설치

저장소를 내려받아 로컬 마켓플레이스로 추가한 뒤 플러그인을 설치합니다.

```sh
git clone https://github.com/jaeseongs95/Claude-Status.git ~/.claude/mods
claude plugin marketplace add ~/.claude/mods
claude plugin install usage-line@local-mods
claude plugin install korean-ui@local-mods
```

필요한 플러그인만 설치해도 됩니다.

## 구조

```
.claude-plugin/marketplace.json   마켓플레이스 local-mods 정의
usage-line/
  .claude-plugin/plugin.json      플러그인 매니페스트
  hooks/hooks.json                훅 모듈 목록
  hooks/register.tsx              띠 그리기와 갱신 로직
  hooks/usage-line.test.ts        테스트
  types/index.d.ts                state 타입 선언
korean-ui/
  .claude-plugin/plugin.json      플러그인 매니페스트
  hooks/hooks.json                훅 모듈 목록
  hooks/register.tsx              화면 요소별 한글화 훅
  hooks/dict.ts                   /config 항목 이름·명령 설명 사전
  hooks/register.test.ts          테스트
```

각 플러그인의 `.claude-plugin/types/`는 Claude Code가 mod를 불러올 때 생성하는 API 타입 선언이라 저장소에 포함하지 않습니다.

## 검사와 테스트

```sh
claude plugin validate usage-line
claude plugin test usage-line
claude plugin validate korean-ui
claude plugin test korean-ui
```
