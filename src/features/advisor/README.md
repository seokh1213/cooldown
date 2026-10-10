# 도우미 패키지

브라우저 도우미의 UI, 질문 해석, 답변 생성, 모델 실행을 이 기능 안에서 관리한다.

```text
advisor/
├── panel/             # 열기·닫기, 동의, 크기, 저장 공간, 위젯 진입점
├── conversation/      # 입력·대화 UI, 대화 상태, 문맥 선택
├── answers/           # 답변 카드, 답변 형식, 설명·수치·근거 렌더링
├── reference/         # 챔피언·스킬·능력치 참고 패널과 조회
├── history/           # 기록 목록 UI와 과거 답변의 참고 문맥
├── session/           # React 세션 상태, 질문 실행, worker 연결
├── application/       # 질문을 계획과 답변으로 연결하는 실행 흐름
├── understanding/     # 챔피언·스킬·의도·조건·능력치 질문 해석
├── retrieval/         # 현재 지식과 노트 검색·선택
├── mechanics/         # 스킬 메커니즘 질문의 조건·검색·계획·표현
├── model/             # 모델 설정, 판정기, 질문 범위 분류
├── contracts/         # 요청·응답 프로토콜과 계획 타입
├── storage/           # 대화 기록·스냅샷·검증·대용량 캐시
└── worker/            # 별도 스레드의 모델 로딩·생성·추론
```

UI부터 읽으려면 `panel/DeferredAdvisorWidget.tsx` → `panel/AdvisorWidget.tsx` →
`panel/AdvisorPanel.tsx` 순서로 본다. 패널 안에서 입력과 답변은 `conversation`,
답변 카드는 `answers`, 참고 자료는 `reference`, 과거 대화는 `history`가 맡는다.

질문 처리 흐름은 `session/useAdvisor.ts` → `application/routeAsk.ts` →
`application/plan.ts`에서 시작한다. 문맥은 `conversation`, 질문 분류는
`understanding`, 지식 선택은 `retrieval`과 `mechanics`로 이어진다.

React 훅은 해당 책임의 파일 옆에 둔다. `useReferenceSelection`은 `reference`,
`useMobileAdvisorViewport`는 `panel` 소속이다. UI와 함께 바뀌는 훅을 다른 전역
`hooks` 폴더에서 찾을 필요가 없다.

게임 지식의 공통 계산은 `src/domain/knowledge`, HTTP와 캐시는
`src/infrastructure`를 사용한다. 지식 원본과 생성·평가 도구는 `dev`에 있다.

전체 트리와 데이터 경계는 [프로젝트 구조](../../../dev/docs/project-structure.md),
상세 답변 흐름은 [도우미 설계](../../../dev/docs/advisor-answer-pipeline.md)를 참고한다.
