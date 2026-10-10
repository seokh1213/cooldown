# 전체 폴더 구조 점검, 2026-10-10

정리 전 Git 관리 파일 18,015개의 경로를 전수 수집했다. 소스·개발 도구·테스트·설정·문서는 파일별 소유권과 import를 확인했고, 데이터·이미지·연구 기록은 전체 경로·용도·내용 해시를 확인했다. 로컬의 도구 폴더와 생성 산출물도 루트에서 별도로 구분했다.

## 적용 기준

기능 소유권, 함께 바뀌는 책임, 실행 시점, 입력과 출력의 경계를 기준으로 나눈다. 파일 개수만을 이유로 폴더를 추가하지 않는다. 기능 진입점은 해당 패키지 안에 두고 이전 경로를 위한 연결 파일을 남기지 않는다.

## 변경 판단

- 앱: 시작 처리와 라우팅을 분리하고 업데이트 UI는 PWA에 배치했다. 설정 훅 하나는 앱 전역을 소유하므로 App.tsx 가까이에 유지했다. 개발 전용 OG 화면은 dev/preview로 옮겨 제품 빌드에서 제외했다.
- 비교: 능력치·스킬·툴팁·공통 표 동작으로 구분했다. 백과사전은 챔피언·아이템·룬·주문·공식 분야로 구분했다. 쿨타임과 VS는 화면과 작업 상태를, 패치 이력은 항목·이력·스킬·조회·표시를 구분했다.
- 도우미: 답변의 카드·생성·표시·근거·참고 문맥, 대화의 화면·기억·계획, 질문의 챔피언·스킬·요청·능력치 해석으로 나눴다. 실행 계획은 application/plans가 맡는다.
- 도메인: 게임의 스킬·레벨·정적 데이터와 지식의 카드·전투·노트·텍스트를 구분했다. 툴팁은 계산·치환·원본 조회·표시로 나누고 큰 계산 디스패처와 계약·변수 모듈도 분리했다. 사실 카드의 계약·통계·생성·표시, 답변 검증의 근거·주장·표시도 각각 분리했다.
- 의존성: 런타임이 개발 스크립트의 메커니즘 계약을 가져오던 방향을 바로잡았다. 공통 계약은 domain/knowledge/notes/mechanicsContract.ts에 두고 앱과 생성기가 직접 가져온다. 개발 JSON을 번들 입력으로 읽는 경우는 그대로 유지한다.
- 개발 도구: 도우미 수집·지식 생성·번역·검수·콤보·평가, 데이터 생성기의 챔피언·스킬·시뮬레이션·툴팁·썸네일로 나눴다. 기존 npm 명령과 배포 URL은 유지했다.
- 테스트: unit·data·e2e의 실행 경계를 유지하면서 소유 분야별 하위 폴더로 이동했다. Node 재귀 수집과 테스트 누락 방지 검사를 함께 변경했다.
- 중복: 관리 소스·스크립트·시험에서 동일한 파일 내용은 없었다. 챔피언 카드·공격 속도·몬스터·레벨 보간에 흩어진 성장 계산은 game/levels/championLevel.ts의 statGrowth를 사용하도록 통합했다. HTML 평문화와 문장 분리는 줄바꿈·대상·언어 규칙이 다르므로 임의로 합치지 않았다.

## 유지 판단

- infrastructure: HTTP·조회·저장소·변환·캐시·영속 저장·자산·생성 메타데이터가 이미 책임별로 분리되어 있다. 작은 파일 묶음을 추가로 나누지 않았다.
- shared: 공용 아이콘은 icons, 번역 데이터는 locales, 기능별 번역 묶음은 catalogs로 구분했다. 일반 훅과 유틸리티, Radix 기반 단일 tooltip·dialog·popover 모듈은 현재 깊이를 유지했다. 번역 정의 세 파일의 400줄 초과는 선언형 데이터·계약이며 언어 단위로 유지했다.
- advisor/panel·reference·session·history·storage·mechanics·model·worker·retrieval: 기존 책임이 명확한 패키지는 유지했다. 모델 버전 검증은 파일 경로 하위 호환과 다른 데이터 무결성 검사다.
- 개발 실험 패키지: ability-ticks·atom-context·champion-mechanics·context-frames·conversational-advisor·game-knowledge·gemma-retrieval·kev-agent/b3·mechanic-schema·offline-classifier·passive-rag·quality·remote-evals·stat-classifier·tuning·vector-search는 각각 독립 실행·평가 단위로 유지했다. Python 패키지의 로컬 import와 unittest 발견 규칙을 바꾸는 임의 중첩 대신 각 실행 단위를 경계로 삼는다. tuning의 학습·내보내기·Colab 모듈과 그 회복 시험은 같은 실행 환경을 공유한다.
- dev/scripts/build·ci·patch-notes: 배포 준비·검증·패치 수집이라는 단일 실행 파이프라인의 작은 모듈이므로 유지했다. dev/config는 도구 설정, dev/docs는 설계·운영 문서, docs/images는 문서의 첨부 자료다.
- dev/data: knowledge·overrides·patch-notes·ability-research는 수정·검수 입력이다. public의 패치별 JSON·이미지·모델·패치 이력은 앱이 제공하는 출력이다. 역사 자료와 생성 출력은 코드 중복으로 보지 않는다.
- dev/research: 평가 계열·대상·패치·날짜가 이미 경계다. 과거 측정·출처·승인 기록은 재현 근거라 이동하거나 삭제하지 않는다. .cache와 dev/artifacts는 실행 결과로 Git에서 제외한다.
- .github·node_modules·.git·.idea·.claude 및 에이전트·IDE 폴더: 도구가 정한 위치와 사용자 환경 설정을 유지했다. package.json·tsconfig.json·index.html 등 루트 진입 설정과 README·LICENSE·AGENTS도 유지했다.

## 현재 관리 코드의 폴더 목록

아래 숫자는 각 폴더 바로 아래의 관리 파일 수다. 데이터와 산출물의 파일별 목록은 생략하고 뒤의 계열 경계로 관리한다.

```text
dev/config/ (5)
dev/docs/ (13)
dev/docs/images/ (12)
dev/hooks/ (1)
dev/preview/ (1)
dev/scripts/advisor/ability-ticks/ (5)
dev/scripts/advisor/atom-context/ (11)
dev/scripts/advisor/champion-mechanics/ (27)
dev/scripts/advisor/combos/ (6)
dev/scripts/advisor/context-frames/ (9)
dev/scripts/advisor/conversational-advisor/ (4)
dev/scripts/advisor/evaluation/ (8)
dev/scripts/advisor/game-knowledge/ (4)
dev/scripts/advisor/gemma-retrieval/ (16)
dev/scripts/advisor/kev-agent/ (9)
dev/scripts/advisor/kev-agent/b3/ (11)
dev/scripts/advisor/knowledge/ (11)
dev/scripts/advisor/lib/ (14)
dev/scripts/advisor/mechanic-schema/ (12)
dev/scripts/advisor/note-versions/ (1)
dev/scripts/advisor/offline-classifier/ (28)
dev/scripts/advisor/passive-rag/ (8)
dev/scripts/advisor/quality/ (21)
dev/scripts/advisor/remote-evals/ (13)
dev/scripts/advisor/review/ (13)
dev/scripts/advisor/review/lib/ (1)
dev/scripts/advisor/sources/ (10)
dev/scripts/advisor/stat-classifier/ (17)
dev/scripts/advisor/translations/ (9)
dev/scripts/advisor/translations/lib/ (1)
dev/scripts/advisor/tuning/ (93)
dev/scripts/advisor/vector-search/ (15)
dev/scripts/build/ (4)
dev/scripts/build/pwa/ (2)
dev/scripts/ci/ (8)
dev/scripts/data-pipeline/abilities/ (5)
dev/scripts/data-pipeline/audits/ (3)
dev/scripts/data-pipeline/champions/ (4)
dev/scripts/data-pipeline/commands/ (8)
dev/scripts/data-pipeline/generation/ (4)
dev/scripts/data-pipeline/io/ (1)
dev/scripts/data-pipeline/normalization/ (9)
dev/scripts/data-pipeline/simulation/ (5)
dev/scripts/data-pipeline/sources/ (5)
dev/scripts/data-pipeline/thumbnails/ (4)
dev/scripts/data-pipeline/tooltip/ (4)
dev/scripts/patch-notes/ (19)
dev/tests/ (1)
dev/tests/data/advisor/ (51)
dev/tests/data/data-pipeline/ (7)
dev/tests/data/encyclopedia/ (2)
dev/tests/data/patch-notes/ (2)
dev/tests/data/vs/ (1)
dev/tests/e2e/advisor/ (20)
dev/tests/e2e/app/ (2)
dev/tests/e2e/champions/ (4)
dev/tests/e2e/data-pipeline/ (3)
dev/tests/e2e/encyclopedia/ (2)
dev/tests/e2e/helpers/ (1)
dev/tests/e2e/patch-notes/ (4)
dev/tests/e2e/shared/ (2)
dev/tests/e2e/support/ (1)
dev/tests/e2e/vs/ (2)
dev/tests/fixtures/ (3)
dev/tests/unit/advisor/ (65)
dev/tests/unit/app/ (8)
dev/tests/unit/champions/ (4)
dev/tests/unit/data-pipeline/ (17)
dev/tests/unit/encyclopedia/ (1)
dev/tests/unit/patch-notes/ (5)
dev/tests/unit/shared/ (1)
dev/tests/unit/tooling/ (8)
dev/tests/unit/tooltip/ (5)
src/ (2)
src/app/ (3)
src/app/bootstrap/ (3)
src/app/layout/ (4)
src/app/pwa/ (7)
src/app/routing/ (2)
src/domain/game/ (1)
src/domain/game/abilities/ (2)
src/domain/game/contracts/ (10)
src/domain/game/formulas/ (9)
src/domain/game/levels/ (2)
src/domain/game/static-data/ (2)
src/domain/game/tooltip/ (2)
src/domain/game/tooltip/calculations/ (10)
src/domain/game/tooltip/data/ (4)
src/domain/game/tooltip/formatting/ (7)
src/domain/game/tooltip/variables/ (7)
src/domain/game/types/ (3)
src/domain/knowledge/cards/ (10)
src/domain/knowledge/combat/ (8)
src/domain/knowledge/notes/ (9)
src/domain/knowledge/text/ (3)
src/features/advisor/ (1)
src/features/advisor/answers/ (2)
src/features/advisor/answers/builders/ (8)
src/features/advisor/answers/cards/ (8)
src/features/advisor/answers/evidence/ (5)
src/features/advisor/answers/presentation/ (9)
src/features/advisor/answers/references/ (4)
src/features/advisor/application/ (6)
src/features/advisor/application/plans/ (13)
src/features/advisor/contracts/ (3)
src/features/advisor/conversation/ (1)
src/features/advisor/conversation/memory/ (8)
src/features/advisor/conversation/planning/ (11)
src/features/advisor/conversation/view/ (6)
src/features/advisor/history/ (2)
src/features/advisor/mechanics/ (7)
src/features/advisor/model/ (10)
src/features/advisor/panel/ (9)
src/features/advisor/reference/ (9)
src/features/advisor/retrieval/ (11)
src/features/advisor/retrieval/grounding/ (6)
src/features/advisor/session/ (8)
src/features/advisor/storage/ (5)
src/features/advisor/understanding/ (4)
src/features/advisor/understanding/champions/ (3)
src/features/advisor/understanding/requests/ (9)
src/features/advisor/understanding/spells/ (7)
src/features/advisor/understanding/stats/ (6)
src/features/advisor/worker/ (9)
src/features/champions/comparison/ (3)
src/features/champions/comparison/skills/ (4)
src/features/champions/comparison/stats/ (3)
src/features/champions/comparison/table/ (4)
src/features/champions/comparison/tooltip/ (4)
src/features/champions/drag/ (1)
src/features/champions/selection/ (6)
src/features/cooldown/ (1)
src/features/cooldown/view/ (3)
src/features/cooldown/workspace/ (10)
src/features/encyclopedia/ (4)
src/features/encyclopedia/champions/ (3)
src/features/encyclopedia/formulas/ (1)
src/features/encyclopedia/items/ (5)
src/features/encyclopedia/runes/ (2)
src/features/encyclopedia/summoners/ (1)
src/features/patch-notes/ (1)
src/features/patch-notes/data/ (2)
src/features/patch-notes/entries/ (2)
src/features/patch-notes/formatting/ (2)
src/features/patch-notes/history/ (3)
src/features/patch-notes/skills/ (3)
src/features/vs/ (1)
src/features/vs/comparison/ (8)
src/features/vs/workspace/ (2)
src/infrastructure/assets/ (1)
src/infrastructure/cache/ (2)
src/infrastructure/generated/ (3)
src/infrastructure/http/ (1)
src/infrastructure/mappers/ (2)
src/infrastructure/queries/ (2)
src/infrastructure/repositories/ (4)
src/infrastructure/storage/ (2)
src/shared/hooks/ (4)
src/shared/i18n/ (4)
src/shared/i18n/catalogs/ (2)
src/shared/i18n/locales/ (3)
src/shared/lib/ (6)
src/shared/ui/ (13)
src/shared/ui/icons/ (6)
```

## 데이터와 연구 영역

```text
public/                 # URL로 공개하는 배포 출력
├── data/<patch>/       # 챔피언, 프로필, 언어별 목록, 도우미 번들
├── img/<version>/      # 아이콘·스프라이트
├── models/             # 브라우저에서 사용하는 모델과 계약
└── patch-notes/         # 패치 이력·아이콘·스킬 상세
dev/data/               # 생성과 검수의 입력
├── knowledge/          # 원본 노트·별명·번역·playbooks·atoms
├── overrides/          # 검수한 보정값과 허용 목록
├── patch-notes/         # 원문·공식 자료·스냅샷·검수·목록
└── ability-research/    # 패치별 스킬 원자료
dev/research/           # 대상·평가 계열·패치·날짜별 재현 기록
dev/artifacts/          # 빌드·미리보기·브라우저 검사 출력, Git 제외
```

정리 전 배포·원본 데이터 5,457개를 SHA-256으로 비교했다. 요청 분류기의 경로·소스 지문 메타데이터를 제외한 내용은 보존했다. 분류기를 같은 입력으로 다시 학습해 가중치 바이너리가 동일한 것도 확인했다. public에는 개발 문서나 검수 원문을 추가하지 않았다.

## 회귀 기준과 Actions

이전 정리에서 회귀 기준의 caseHash·scorerHash·dataHash와 문맥 승인 scorerHash가 낡아 Advisor Regression이 실패했다. 같은 질문 5,893건을 전체 실측해 기존 master Actions 결과와 실행 시간을 제외한 모든 결과 필드가 동일함을 확인했다. 통과 5,796건, 기존 실패 77건, 수동 검수 20건으로 누락·신규 회귀·보호 답변 변경은 0건이다. 인프라 검사 12/12와 문맥 승인 검사를 통과한 뒤 경로와 지문을 갱신했다. 비교 조건과 승인 계약은 완화하지 않았다. 자세한 차이와 미해결 항목은 [기준 갱신 기록](../research/llm-evals/workflow/reports/structure-20261010/baseline-refresh.json)에 남겼다.

루트 안내와 읽는 순서는 [프로젝트 구조](project-structure.md), 도우미 진입점은 [도우미 패키지](../../src/features/advisor/README.md)를 참고한다.
