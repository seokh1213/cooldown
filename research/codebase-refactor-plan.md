# cooldown 코드베이스 개편 조사

조사일: 2026-09-04

## 결론

패시브 상세 툴팁을 현재 파이프라인에 먼저 완성한 뒤, 정적 데이터 계약을 v2로 끊고 생성기, 데이터 접근, 화면 상태, UI 순서로 개편한다. 기존 JSON과 localStorage 하위 호환은 유지하지 않는다. 다만 동작을 보존하는 회귀 테스트를 먼저 추가해 각 단계가 독립적으로 배포 가능하게 만든다.

목표 구조는 다음과 같다.

```text
Riot sources
  -> scripts/data-pipeline (수집 -> 추출 -> 계산 -> locale 렌더 -> 검증)
  -> public/data/v2 manifest + 기능별 정적 JSON
  -> src/data repositories (fetch/cache/schema validation)
  -> src/features (상태와 view model)
  -> desktop/mobile presentational views
```

브라우저는 Riot 수식 AST를 해석하지 않는다. CI가 스킬과 패시브를 구조화하고 언어별 완성 문자열을 생성하며, 프론트는 구조 데이터를 안전하게 표현한다.

## 확인된 현황

- `src` TypeScript 파일은 87개이며 전체 `src`/`scripts`는 약 18,000줄이다.
- `scripts/generate-static-data.ts`는 1,738줄이고 네트워크 수집, 폴백, 원본 병합, 계산 데이터 추출, 정규화, 파일 저장, 이전 버전 삭제를 모두 담당한다.
- `src/services/api.ts`는 775줄이고 URL, fetch, 메모리/sessionStorage 캐시, 런타임 검증, 도메인 변환, 룬 UI 문구 생성을 함께 담당한다.
- 400줄을 넘는 핵심 파일이 13개다. 생성기 외에도 ItemsTab 779줄, SimulationPage 587줄, ChampionCooldownPage 556줄, App 479줄, SkillTooltip 467줄이다.
- `scripts/**`는 현재 `tsconfig.json`과 ESLint 검사 대상에서 제외되어 있다. `any` 계열 사용 52건 중 47건이 정적 생성기에 있다.
- 소스에서 localStorage 직접 접근 45회, sessionStorage 17회, setTimeout 13회가 확인된다. 초기 복원 로직이 App과 페이지 훅 양쪽에 중복되어 있다.
- 현재 정적 데이터는 약 17MB, 528개 파일이다. 챔피언 원본, 정규화 챔피언, 별도 spell BIN 데이터가 서로 겹친다.
- 앱 진입점 기준으로 `LaningTipsPage.tsx`와 `spellTooltipParser/textCleaner.ts`는 도달하지 않는다. `gamePatchVersion.ts`와 `spellTooltipParser/index.ts`는 브라우저에서는 도달하지 않지만 생성기/테스트 진입점에서 사용하므로 삭제 대상이 아니다.
- `@radix-ui/react-select`, `react-content-loader`는 코드와 설정 어디에서도 참조되지 않는다.
- 소스 모듈 순환 의존은 없다. 이 점은 개편 중 유지해야 한다.
- 현재 테스트는 파서, 패치 버전, 정적 spell 매핑, lol.ps 연구 분석 중심이다. React 화면, 저장 상태, 라우팅, PWA, 공개 정적 데이터 계약에 대한 자동 회귀 테스트가 없다.
- 현재 `sanitizeHtml`은 이름과 달리 공백만 정규화하며, 툴팁은 `dangerouslySetInnerHTML`로 렌더링된다. Riot 원문을 신뢰하는 암묵적 경계라서 입력 출처가 늘어나면 실제 HTML 허용 목록 검증이 필요하다.

## 주요 문제와 변경 방향

### 1. 생성기가 하나의 트랜잭션이 아니다

현재 생성은 일부 챔피언이나 언어 요청이 실패해도 계속 진행하고 마지막에 성공할 수 있다. CDragon 폴백은 챔피언별로 달라질 수 있지만 전역 `version.json`에는 최초 폴백 하나만 기록한다. 생성 도중 기존 버전 디렉터리를 직접 삭제하고 같은 위치에 결과를 쓰므로 중간 실패 시 부분 데이터가 남을 수 있다.

변경:

- `sources/ddragon`, `sources/cdragon`, `extractors`, `normalizers`, `renderers`, `validators`, `writer` 모듈로 분리한다.
- 임시 출력 디렉터리에 전부 생성하고 스키마/개수/미해결 토큰 기준을 통과한 뒤 최종 디렉터리로 교체한다.
- 모든 산출물에 source별 실제 버전과 생성 시각을 넣고, 전역 manifest에는 혼합 폴백 여부와 실패 목록을 기록한다.
- 네트워크 fetch와 순수 변환을 분리해 fixture 기반 테스트가 가능하게 한다.
- `unknown -> decoder -> domain type` 경계를 두고 생성기의 `any`를 제거한다.

### 2. 정적 데이터 계약이 화면 요구와 원본 보존을 섞는다

현재 프론트는 챔피언 DDragon 파일과 spell BIN 파일을 런타임에 다시 합치고 툴팁 토큰을 치환한다. 이 구조 때문에 이번처럼 올바른 JSON을 생성하고도 다른 경로를 읽는 오류가 발생했다.

변경:

- `schemaVersion: 2` manifest를 도입한다.
- 챔피언 목록은 선택기에 필요한 최소 데이터만 가진다.
- 챔피언 상세는 P/Q/W/E/R의 공통 `Ability` 구조를 사용한다.
- `Ability`는 `summary`, `body`, `cost`, `cooldown`, `rankValues`, `scalings`, `conditions`, `diagnostics`를 가진다.
- locale별 완성 텍스트와 언어 중립 계산 AST를 구분하되, 브라우저 기본 경로는 CI가 렌더한 결과만 사용한다.
- 미해결 토큰을 삭제하지 않고 diagnostics와 CI 허용 목록으로 관리한다.
- ko_KR/en_US/zh_CN을 상수 분기 대신 locale registry로 다룬다.
- HTML 문자열은 생성 단계에서 허용 태그·속성만 통과시키거나 구조 노드로 변환한다. 프론트는 검증된 구조만 렌더링하고 임의 원문 HTML을 직접 주입하지 않는다.

### 3. 데이터 접근 계층의 책임이 너무 많다

`api.ts`는 정적 파일 저장소, 캐시, 변환기, 일부 프레젠테이션 로직 역할을 동시에 한다. 각 함수가 sessionStorage JSON을 직접 읽고 비슷한 유효성 검사를 반복한다.

변경:

- `src/data/http/staticDataClient.ts`: base path와 fetch/error만 담당한다.
- `src/data/cache/versionedCache.ts`: 메모리/sessionStorage 정책과 직렬화를 담당한다.
- `src/data/repositories/`: champion, item, rune, summoner 저장소를 분리한다.
- 저장소 반환 타입은 화면 타입이 아니라 v2 도메인 타입으로 고정한다.
- 룬 라벨과 HTML 생성은 feature presenter로 옮긴다.
- 오류는 `null`, 빈 객체, throw가 섞이지 않도록 typed result 또는 일관된 예외 정책 하나를 사용한다.

### 4. 앱 초기화와 저장 상태가 중복된다

App이 버전/언어/테마/PWA/스토리지 복원/라우팅/스플래시를 모두 관리하고, 페이지 훅은 같은 localStorage를 다시 읽는다. `setTimeout(..., 0)`으로 effect 경고와 순서를 우회하는 로직도 있다.

변경:

- `AppProviders`, `AppRouter`, `UpdateBanner`로 App을 분리한다.
- 비동기 bootstrap은 `useAppBootstrap` 한 곳에서 상태 머신(`loading | ready | error`)으로 관리한다. 무한 스플래시 대신 재시도 가능한 오류 화면을 제공한다.
- `usePersistentState` 또는 기능별 storage repository 하나만 localStorage를 읽고 쓴다.
- 스토리지 키와 decoder를 `storageSchema.ts`에 모으고 앱 시작 시 전부 지우는 대신 앱 소유 키만 초기화한다.
- v2 전환 시 serialization version을 올려 기존 상태는 한 번 폐기한다.

### 5. 화면 컴포넌트가 데이터 로딩과 표시를 함께 한다

SkillsSection Desktop/Mobile이 각각 spell 데이터를 fetch하고 cooldown 행을 계산한다. Items/Runes/Summoner 탭도 로딩, 필터, 선택, 렌더링이 큰 파일 안에 결합되어 있다.

변경:

- `useChampionAbilities`가 한 번 로드하고 `AbilityComparisonViewModel`을 만든다.
- desktop/mobile은 같은 view model을 받는 표현 컴포넌트로 만든다.
- 공통 헤더, ability cell, cooldown rows를 작은 컴포넌트로 분리한다.
- ItemsTab은 query/filter, selection, detail presenter, grid view로 분리한다.
- Simulation은 순수 계산 엔진과 React form을 분리하고 계산 엔진을 fixture로 검증한다.
- 파일은 대체로 300~400줄 이내, 한 파일 한 책임을 기준으로 한다.

### 6. 빌드 설정에 취약한 후처리가 있다

Vite가 생성한 JS import 문자열을 `closeBundle`에서 정규식으로 다시 쓰고, publicDir가 이미 복사한 데이터를 다시 복사한다. preload 순서도 생성 HTML 문자열을 직접 조작한다.

변경:

- 별도 브랜치에서 세 플러그인을 하나씩 제거하고 `/cooldown/` 하위 직접 진입, lazy route, service worker 갱신을 Playwright로 검증한다.
- Vite `base`가 처리하는 import 경로를 우선 사용한다.
- GitHub Pages용 404와 `.nojekyll`만 명시적인 작은 플러그인 또는 배포 단계로 남긴다.
- 배포 버전은 무작위 값보다 commit SHA/run ID를 사용해 재현 가능하게 만든다.

## 실행 순서

### 0단계: 안전망

1. scripts용 tsconfig와 ESLint 대상을 추가한다.
2. 생성기 변환 fixture, storage decoder, repository 경로 테스트를 추가한다.
3. Playwright smoke test로 첫 로드, 언어 변경, 오공 Q/P 툴팁, lazy route, 새 배포 갱신을 검증한다.
4. 현재 번들 크기와 정적 JSON 개수/크기를 기준선으로 기록한다.

### 1단계: 패시브 기능 완료

별도 worktree 구현을 검토해 먼저 병합한다. 이 단계에서 확보한 passive locator/stringtable/calculation fixture를 v2 생성기의 첫 계약 테스트로 사용한다.

### 2단계: 생성기 분해와 v2 계약

순수 함수부터 이동하고 기존 생성기 출력과 snapshot 비교를 유지한다. v2 writer가 완성되면 기존 포맷을 한 번에 제거한다. 하위 호환 어댑터는 만들지 않는다.

### 3단계: repository 전환

기능별 repository와 공통 캐시를 만든 뒤 페이지를 하나씩 전환한다. 마지막 consumer가 이동하면 `api.ts`, 런타임 spell parser, 미사용 staticData 함수와 옛 캐시 키를 삭제한다.

### 4단계: 상태와 UI 분해

App bootstrap/storage를 먼저 단일화하고, 그 다음 비교 화면과 백과사전 탭을 view model 기반으로 바꾼다. Desktop/Mobile의 데이터 로딩 중복을 제거한다.

### 5단계: 빌드 단순화와 청소

Vite 후처리를 실험적으로 제거하고 Pages E2E를 통과시킨다. 도달하지 않는 파일과 미사용 패키지를 삭제하고 public data 중복을 정리한다.

## 권장 커밋 경계

1. `test: 리팩터링 회귀 안전망 추가`
2. `refactor: 정적 데이터 생성기 모듈 분리`
3. `feat: v2 스킬 데이터 계약 생성`
4. `refactor: 기능별 정적 데이터 저장소 도입`
5. `refactor: 앱 초기화와 저장 상태 단일화`
6. `refactor: 비교 및 백과사전 UI 분리`
7. `build: Vite Pages 후처리 제거`
8. `chore: 미사용 코드와 의존성 제거`

각 커밋은 type-check, lint, unit/fixture test, build를 통과해야 한다. 3단계 이후에는 공개 Pages smoke test도 필수로 둔다.

## 즉시 삭제 후보와 보류 대상

삭제 후보:

- `src/pages/LaningTipsPage.tsx`
- `src/lib/spellTooltipParser/textCleaner.ts`
- `@radix-ui/react-select`
- `react-content-loader`
- `staticDataUtils.ts`의 항상 빈 배열을 반환하는 버전 탐색 API

보류:

- `spellTooltipParser/index.ts`: 생성기 진입점에서 사용한다.
- `gamePatchVersion.ts`: 생성기와 회귀 테스트에서 사용한다.
- 런타임 spell parser 전체: v2 데이터 consumer 전환이 끝난 뒤 삭제한다.
- Vite 커스텀 플러그인: Pages E2E로 대체 동작을 증명한 뒤 제거한다.

## 완료 기준

- 패시브와 Q/W/E/R이 동일한 Ability 계약을 사용한다.
- 세 언어에서 미해결 토큰 수와 허용 사유가 CI 보고서에 나온다.
- 생성기 핵심 모듈에 `any`가 없고 scripts도 타입검사/린트를 받는다.
- App, API/repository, 주요 feature 파일이 책임별로 분리된다.
- storage를 직접 만지는 코드는 storage 계층으로 제한된다.
- 공개 Pages에서 첫 로드, 직접 URL, PWA 갱신, 오공 Q/P가 자동 검증된다.
- 도달 불가능 코드와 미사용 의존성이 제거된다.
