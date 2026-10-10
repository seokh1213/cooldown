# 프로젝트 구조와 읽는 순서

프로젝트의 큰 영역은 세 곳이다. `src`는 앱 코드, `public`은 공개 배포 파일,
`dev`는 개발에 사용하는 모든 자료다.

```text
cooldown/
├── src/                       # 브라우저에서 실행하는 TypeScript·React 코드
│   ├── main.tsx               # 앱 시작점
│   ├── app/                   # 앱 조립, 라우팅, 레이아웃, PWA
│   ├── features/              # 사용자가 이용하는 기능별 패키지
│   │   ├── advisor/           # 롤 지식 도우미
│   │   ├── champions/         # 여러 화면에서 쓰는 챔피언 선택·비교
│   │   ├── cooldown/          # 쿨타임 화면과 선택 상태
│   │   ├── encyclopedia/      # 챔피언·아이템·룬·주문 백과사전
│   │   ├── patch-notes/       # 패치 이력 화면
│   │   └── vs/                # 두 챔피언 대전 비교
│   ├── domain/                # 게임 계산, 데이터 계약, 지식 규칙
│   │   ├── game/              # 타입, 계약, 공식, 툴팁 계산
│   │   └── knowledge/         # 사실 카드, CC, 콤보, 출처와 노트
│   ├── infrastructure/        # HTTP, 저장소, 캐시, 쿼리, 생성된 자산 메타데이터
│   └── shared/                # 공통 UI, 일반 훅·유틸리티, 다국어
├── public/                    # 이 폴더의 파일은 URL로 공개된다
│   ├── data/                  # 앱이 읽는 패치별 정적 JSON
│   ├── img/                   # 챔피언·스킬·아이템·룬 이미지
│   ├── models/                # 브라우저 모델과 판정 파일
│   ├── patch-notes/           # 표시용 패치 이력과 아이콘
│   └── ort/                   # 빌드 시 복사하는 ONNX Runtime, Git 제외
├── dev/
│   ├── config/                # Vite, ESLint, Playwright, 도구용 TypeScript 설정
│   ├── scripts/               # 생성·검수·배포·평가 명령
│   │   ├── advisor/           # 도우미 지식 생성, 수집, 평가, 모델 도구
│   │   ├── build/             # 빌드 준비, PWA 배포 묶음, OG 이미지
│   │   ├── ci/                # 배포 검증, 원천 갱신 판단, push 검사
│   │   ├── data-pipeline/     # 게임 데이터 수집·정규화·검증
│   │   └── patch-notes/       # 패치 원문 수집과 표시 자료 생성
│   ├── tests/                 # unit, data, e2e, fixtures
│   ├── data/                  # 배포 자료를 만드는 원본과 검수 입력
│   │   ├── knowledge/         # 사람이 관리하는 지식 원본과 번역
│   │   ├── overrides/         # 보정값, 아이콘 상태, 검증 허용 목록
│   │   ├── patch-notes/       # 패치 원문·스냅샷·검수 원장
│   │   └── ability-research/  # 스킬 조사 원자료
│   ├── research/              # 조사 근거, 평가 입력·기준선·검토 기록
│   ├── docs/                  # 설계, 운영 방법, 감사 기록, README 이미지
│   ├── assets/                # 이미지 생성에 쓰는 원본 자산
│   ├── hooks/                 # Git pre-push 검사
│   └── artifacts/             # 빌드·미리보기·테스트 결과, Git 제외
├── index.html                 # Vite HTML 진입점
├── package.json               # 루트에서 실행하는 npm 명령
├── package-lock.json          # 의존성 잠금
└── tsconfig.json              # 편집기와 앱이 공유하는 TypeScript 설정
```

`.github`는 GitHub Actions가 정한 위치다. `node_modules`와 IDE·에이전트의 숨김
폴더는 도구가 관리하며 소스나 데이터 패키지에 포함하지 않는다.

## 처음 읽을 파일

1. `src/main.tsx` → `src/app/App.tsx` → `src/app/AppRouter.tsx`: 앱이 시작하고 화면을 선택하는 흐름.
2. 관심 있는 `src/features/<기능>/<기능명>Page.tsx`: 해당 화면의 구성.
3. 기능 안의 작은 책임별 폴더: 화면, 상태, 계산의 세부 구현.
4. `src/domain`과 `src/infrastructure`: 게임 규칙과 데이터 입출력.

도우미는 [도우미 패키지 안내](../../src/features/advisor/README.md)와
[답변 흐름](advisor-answer-pipeline.md)을 함께 읽는다.

## 폴더와 파일을 나누는 기준

같이 바뀌는 코드를 같은 기능 안에 둔다. 전체 소스에 `components`, `hooks`,
`utils`를 만들고 기능 전용 파일을 흩어 놓지 않는다. 여러 기능이 실제로 함께 쓰는
UI와 일반 도구만 `shared`에 둔다. 게임의 의미를 가진 계산·계약은 `domain`에 둔다.

복합 컴포넌트의 진입 파일도 자기 패키지 안에 둔다. 예를 들어
`champions/comparison/ChampionComparison.tsx`와 그 표·툴팁은 모두
`champions/comparison` 소속이다. 폴더 밖에 같은 이름의 진입 파일을 병렬로 두지 않는다.

```text
features/champions/
├── comparison/
│   ├── ChampionComparison.tsx       # 비교 기능의 진입 컴포넌트
│   ├── SkillsSectionDesktop.tsx
│   ├── SkillsSectionMobile.tsx
│   ├── StatsSectionDesktop.tsx
│   ├── StatsSectionMobile.tsx
│   ├── SortableChampionHeader.tsx   # 데스크톱 표가 공유하는 헤더
│   ├── SortableChampionCell.tsx     # 데스크톱 표가 공유하는 셀
│   ├── useChampionReordering.ts
│   └── …                          # 이 비교에서 쓰는 툴팁과 계산
├── selection/                     # 검색·선택·즐겨찾기
└── drag/                          # 챔피언 드래그 센서
```

관련 파일이 늘어나면 책임이 드러나는 하위 패키지로 나눈다. 한 파일마다 폴더를
만들지는 않는다. `panel`, `reference`, `history`처럼 무엇을 하는지 드러나는 이름을 쓴다.

타입과 훅은 이를 소유하는 기능 가까이에 둔다. 화면마다 다른 표현은 유지하되 같은
이벤트 처리나 계산을 복사하지 않는다. 컴포넌트 안에서 다른 컴포넌트를 선언하면
렌더링 때 새 컴포넌트로 인식될 수 있으므로 재사용 컴포넌트는 모듈 수준에 선언한다.

현재 경로를 직접 import한다. 이전 경로를 위한 재수출 파일이나 중복 구현은 두지 않는다.
새로운 의존성이나 실행 서비스는 이 구조 변경에 추가하지 않았다.

## 원본과 공개 데이터

`dev/data`는 수정·검수하는 입력이다. `public/data`와 `public/patch-notes`는 생성기가
만든 출력이다. 지식 원본은 챔피언별로 관리하지만 앱은 필요한 자료를 묶은 번들을 읽는다.
원본과 배포 번들은 이처럼 역할이 달라 둘 다 필요하다.

```text
dev/data + dev/research
         ↓ dev/scripts의 생성·검수 명령
public/data + public/img + public/patch-notes
         ↓ npm run build
dev/artifacts/dist                 # GitHub Pages에 전달하는 결과물
```

`public`의 내용은 개발 서버가 정적으로 제공하고 빌드에도 그대로 복사한다.
원문, 조사 보고서, 학습·검수 입력, 개발 문서를 넣지 않는다. `dev`에 있다는 사실은
Git 저장소의 공개 여부와 별개다. 비밀값은 어느 폴더에도 커밋하지 않는다.

`src/domain/game/abilityIconStates.ts`는 `dev/data/overrides/abilityIconStates.json`을
빌드 입력으로 읽는다. 해당 설정은 앱 코드에 필요한 부분으로 포함되고 원본 폴더 전체를
공개하지 않는다. `src/infrastructure/generated`의 TypeScript 파일도 앱이 import하는
생성 코드라 소스 영역에 유지한다.

과거 패치 자료는 패치 이력 화면과 검증 근거로 사용한다. 코드의 이전 구현을 유지하는
것과 다르므로 삭제하지 않는다. 캐시·실행 결과는 Git 제외 규칙을 그대로 적용한다.

## 개발과 검증

명령은 모두 저장소 루트에서 실행한다. npm 명령 이름은 유지하며 내부 경로만 정리했다.

```bash
npm run dev
npm run type-check
npm run lint
npm test
npm run build
npm run prepare-pages
npm run test:e2e
```

개발 서버와 배포 빌드 결과는 `dev/artifacts` 아래에 모인다.
Git 훅 경로는 `git config core.hooksPath dev/hooks`로 설정한다.

## 적용 근거

React는 컴포넌트를 책임별로 나누고 계층을 구성하도록 설명한다.
Redux의 공식 구조 가이드는 관련 코드를 기능별 폴더에 모으는 방식을 권한다.
Feature-Sliced Design도 기능 경계와 목적이 드러나는 내부 구분을 제시한다.
이 프로젝트는 이 원칙을 참고하되 FSD의 전체 계층이나 별도 패키지 관리 체계를 도입하지 않는다.

- [React: Thinking in React](https://react.dev/learn/thinking-in-react)
- [Redux: Code Structure](https://redux.js.org/faq/code-structure)
- [Feature-Sliced Design: Slices and Segments](https://fsd.how/docs/reference/slices-segments/)
- [Vite: The public Directory](https://vite.dev/guide/assets.html#the-public-directory)
