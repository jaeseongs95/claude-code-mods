# claude-code-mods

Claude Code mod 플러그인 두 개와, 이를 설치하는 마켓플레이스 `local-mods`를 담은 저장소입니다.

- `usage-line`: 입력창 바로 위에 작업 상태와 사용량을 두 줄 띠로 보여 줍니다.
- `korean-ui`: 화면에 보이는 영문을 한국어로 바꿉니다. [아래 절](#korean-ui) 참고.

## usage-line

`~/.claude/statusline-usage.sh` 상태 줄에 나오던 정보를 mod API로 다시 그립니다. 스크립트를 실행하지는 않으며, 스크립트에 있던 vim 모드 표시는 mod API로 읽을 수 없어 뺐습니다.

> mod(function hooks) API는 early access 기능이라 Claude Code 릴리스에 따라 바뀔 수 있습니다.

### 화면 구성

```
proj on  main [+1 ?3]  │  Opus 5.5 ⚡high  [status] [context] [diff] [compact]
  ctx 42% 84k/200k · cache 87%  │  $1.23  │  5h 30% →14:00 · 7d 12% · Fable 5%
```

**1줄: 어디서, 무엇으로**

- 폴더 이름과 git 브랜치. 브랜치 뒤 괄호에는 스테이징(`+`), 수정(`!`), 미추적(`?`), ahead(`⇡`), behind(`⇣`) 개수를 0이 아닌 것만 표시합니다. detached 상태면 커밋 해시 앞 7자리를 보여 줍니다.
- 모델 표시 이름(`claude-opus-5-5` → `Opus 5.5`)과 effort. effort는 마지막 모델 요청 값을 쓰고, 아직 요청이 없으면 settings의 `modelSettings[모델 ID].effortLevel`, 그것도 없으면 `effortLevel`을 씁니다.
- `[status]`, `[context]` 버튼은 `/status`, `/context`를, `[compact]` 버튼은 이어서 작업할 수 있게 요약하라는 지시문을 붙여 `/compact`를 실행합니다. 응답 중에 누르면 응답이 끝난 뒤 실행됩니다.
- 필요할 때만 보이는 버튼: 스테이징·수정한 파일이 있으면 `[diff]`(`/diff`), `5h`나 `7d` 사용률이 70% 이상이면 `[usage]`(`/usage`)가 `[compact]` 앞에 나타납니다. 미추적 파일만 있을 때는 `[diff]`를 보이지 않습니다.
- 버튼은 폭이 좁아도 줄어들지 않고, 대신 폴더·모델 쪽 글자가 `…`로 잘립니다. 버튼을 `[ label ]`로 그리면 폴더·모델에 40칸이 남지 않을 만큼 좁을 때는 `[compact]`를 뺀 버튼을 테두리 없는 흐린 라벨로 그립니다. 마우스를 올리거나 포커스가 가면 진하게 보입니다.

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
| `/config` 메뉴 항목 | `Auto-compact`, `Show tips` | `자동 압축`, `팁 표시`, 사전에 없는 항목은 모델 번역 |
| `/` 자동완성 명령 설명 | `Start a new session …` | `빈 컨텍스트로 새 세션 시작 …` |
| 대화 중 엔진 안내 줄 | `Conversation compacted`, `Session resumed without branch: main` | `대화를 압축함`, 그 밖의 문장은 모델 번역 |
| 백그라운드 작업 알림 줄 | `Task … completed` 같은 요약 | 모델 번역 |
| 스킬·플러그인 명령 설명, 사전에 없는 기본 명령 설명 | `/` 메뉴의 영문 설명 | 모델 번역 |

번역은 두 단계로 합니다.

1. **고정 사전**: 입력창 힌트, 스피너, 모드 표시, `/config` 항목, 기본 명령 설명처럼 문구가 정해진 곳은 `register.tsx`·`dict.ts`의 사전으로 바로 바꿉니다. 사전 문구는 Claude Code 2.1.296 실행 파일에서 확인했습니다. 키 이름 뒤에 동작이 붙는 힌트(`esc to close`, `/ to search`)는 `키 + 동작` 규칙으로 바꿉니다.
2. **모델 번역**: 안내 줄, 작업 알림, 스킬·플러그인 명령 설명, 사전에 없는 기본 명령 설명과 `/config` 항목 이름처럼 종류가 많거나 값이 섞여 드는 문장은 `haiku` 모델로 번역합니다. 결과는 `$.store`에 최근 500개까지 남겨 다시 쓰므로 같은 문장은 한 번만 번역합니다.
   - 명령 설명과 `/config` 항목 이름은 세션이 시작되고 3초 뒤 한 번에 번역합니다(10개씩 묶어 요청). 처음 설치한 세션이나 새 스킬·새 버전의 문구가 생겼을 때만 토큰이 듭니다.
   - 안내 줄과 작업 알림은 처음 나올 때 번역이 끝날 때까지 1~3초 늦게 표시될 수 있습니다. 번역이 실패하면 원문을 그대로 보여 주고 다음에 다시 시도합니다.
   - 모델이 읽는 대화 내용은 바꾸지 않습니다. 안내 줄은 모델이 읽지 않는 행이고, 작업 알림은 화면에 그리는 글자만 바꿉니다.

사전에도 없고 모델 번역 대상도 아닌 문장은 섞인 문장이 되지 않도록 원문 그대로 둡니다. 코드, 명령어, 경로, 식별자는 번역하지 않습니다.

바꾸지 못하는 것: 시작 로고, 권한 확인 창, 질문 창의 고정 버튼(`Other`, `Submit`), `/status`·`/usage` 창, `/config`의 탭 이름과 설정값, 도구 실행 줄(`Bash(...)`)과 결과 요약(`Read 120 lines`). 이 화면들은 플러그인 API에 바꿀 수 있는 지점이 없습니다.

`/config` 항목 이름과 기본 명령 설명은 Claude Code 2.1.296에서 뽑은 영문을 키로 씁니다. 버전이 바뀌어 사전에 없는 문구가 생기면 모델 번역으로 채우고, 번역을 고정하고 싶을 때만 `korean-ui/hooks/dict.ts`에 추가합니다. 입력창 힌트·스피너·모드 표시는 자주 다시 그려지는 짧은 문구라 사전으로만 바꾸므로, 새 문구는 영문으로 남습니다.

### 한국어 팁

스피너 아래 `Tip:` 줄은 플러그인 훅이 닿지 않아, Claude Code의 `spinnerTipsOverride` 설정으로 바꿉니다. `korean-ui/tips.json`에 2.1.291·2.1.296의 기본 팁을 옮긴 54개가 있습니다. 맥 전용, 기업·외부 클라우드 전용, 그때그때 값이 바뀌는 팁은 뺐습니다. `~/.claude/settings.json`에 다음을 넣으면 기본 영어 팁 대신 이 목록이 `팁:` 머리말로 나옵니다.

```json
"spinnerTipsOverride": {
  "tipsFile": "~/.claude/mods/korean-ui/tips.json",
  "excludeDefault": true,
  "label": "팁"
}
```

팁은 파일에서 바로 읽으므로 저장소를 `git pull`하면 갱신됩니다. Claude Code에 새 팁이 생기면 이 파일에 직접 추가해야 합니다(최대 200개, 각 500자).

## 설치

저장소를 내려받아 로컬 마켓플레이스로 추가한 뒤 플러그인을 설치합니다.

```sh
git clone https://github.com/jaeseongs95/claude-code-mods.git ~/.claude/mods
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
  hooks/translate.ts              모델 번역 프롬프트와 응답 해석
  hooks/register.test.ts          테스트
  tips.json                       spinnerTipsOverride용 한국어 팁 목록
```

각 플러그인의 `.claude-plugin/types/`는 Claude Code가 mod를 불러올 때 생성하는 API 타입 선언이라 저장소에 포함하지 않습니다.

## 검사와 테스트

```sh
claude plugin validate usage-line
claude plugin test usage-line
claude plugin validate korean-ui
claude plugin test korean-ui
```
