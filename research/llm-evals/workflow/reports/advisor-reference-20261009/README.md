# 복수 스킬 카드 중복과 자료 패널 누락 수정

`코르키 w, e 지속 틱은 어떻게되는거지?` 질문은 W·E 답을 `turn.answers`에
저장한다. 기존 대화 화면은 이 배열을 그대로 카드 두 장으로 그렸지만, 옆 자료
패널은 `turn.answer`만 받아 복수 답변에서 패널이 사라졌다. 화면 폭이나 자료 요청
실패가 아닌, 단일 답·복수 답의 표시 경로 차이였다.

## 변경

- 전체 스킬 자료가 있는 같은 챔피언의 답을 표시할 때만 하나로 묶는다.
  W·E 각각의 답과 강조, 수치와 본문은 유지한다. 특정 챔피언 이름이나 슬롯 조합에
  대한 예외는 두지 않는다.
- 자료 패널도 복수 답을 받는다. 1180px 이상에서는 기존 채팅 옆 자료 패널을,
  그보다 좁으면 대화 안의 카드 하나를 사용한다. 패널 접기 설정과 다시 열기를 유지한다.
- 같은 턴에 여러 자료가 있으면 턴 ID와 자료 식별자를 함께 사용해 탭·칩을 전환한다.
  상성 탭에는 대상 이름을 표시하고, 패널로 옮긴 복수 답의 이동 링크도 유지한다.
  이 링크는 기존처럼 해설보다 먼저 표시하고 44px 터치 영역을 보장한다.
- 원래 답·대화 기억·저장 형식·모델은 변경하지 않는다. 새로고침으로 복원한 답에도
  같은 표시 경로를 적용하며, 전체 자료 없는 옛 스킬 카드는 서로 합치지 않는다.

## 검증과 재실행

```bash
npm test
npm run type-check
npm run lint
npm run build
npx playwright test e2e/advisor-multi-skill-reference.spec.ts \
  e2e/advisor-shared-skills.spec.ts e2e/advisor-reference-tabs.spec.ts \
  e2e/advisor-dialogue-edits.spec.ts e2e/advisor-history-snapshots.spec.ts \
  e2e/advisor-matchups.spec.ts --workers=2
```

로컬 브라우저 회귀 17개 통과. 같은 챔피언의 W·E 카드 하나, 두 행 강조, 다른
자료로 전환 후 재선택, 기록 복원, 서로 다른 상성 자료 선택과 이동 링크를 검사한다.
390/1280px와 light/dark 4개 화면 조합도 직접 실행했다. 가로 넘침·브라우저 오류가
없고, 접은 패널은 자료 칩을 Enter로 눌러 다시 열 수 있다.

새 테스트는 master CI의 전체 Playwright 실행과 `llm:test:ui`의 advisor 파일
선택에 자동 포함된다. 품질 inventory에도 등록한다. 최종 CI·배포 결과는 같은
제목의 Vault 기록에 연결한다.

## UI·React 점검

- Hard Gate PASS: 기존 테마 토큰·실제 게임 자료 사용, 새 문구·그림·탐색 구조 없음.
  두 테마·두 화면 폭에서 카드 하나와 넘침 없음을 확인했다.
- Purpose Gate PASS: 기존 카드·스킬 아이콘·자료 칩을 재사용한다. 카드 통합은
  같은 전체 스킬 표를 반복하지 않고 요청한 행을 함께 보기 위한 선택이다.
- Liveliness PASS: 기존 UI 방향을 유지한다. ENERGY/RHYTHM/MOTION 1/1/1,
  스킬 이미지와 강조 행으로 읽는 위치를 잡고, 접힌 상세는 그대로 유지한다.
- Craftsmanship PASS: 브라우저 회귀 17개와 키보드 자료 전환 확인. React 점검은
  원본 불변성, 같은 출처의 안정적인 카드 키, 순수 표시 그룹, 요청·훅 순서 유지,
  기존 버튼·접기·링크 동작을 확인했다.
