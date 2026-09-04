# cooldown

리그 오브 레전드의 챔피언 스킬을 비교하고, 아이템·룬·소환사 주문을 조합해 콤보 피해와 킬각을 계산하는 정적 웹 앱입니다.

서비스: https://seokh1213.github.io/cooldown/

## 제공 기능

- 173개 챔피언의 P/Q/W/E/R 이름, 본문, 비용, 쿨다운, 레벨값, 계수와 계산 진단
- 여러 챔피언 쿨다운·기본 능력치 비교와 1:1 VS 보기
- 대상 레벨·체력·방어력·마법 저항력·피해 감소를 반영한 평타/스킬 콤보 계산
- 점화, 직접 피해 룬, CDragon 계산 원본으로 검증된 아이템 효과 합산
- 룬, 아이템, 소환사 주문 백과사전
- 한국어, 영어, 중국어와 데스크톱·모바일·PWA 오프라인 경로 지원

정적 데이터는 GitHub Actions에서 현재 패치의 Data Dragon과 CommunityDragon을 내려받아 미리 계산합니다. 브라우저는 Riot 계산 AST를 다시 해석하지 않고, 버전과 출처가 고정된 Ability v2 결과만 읽습니다.

## 데이터 흐름

```text
Data Dragon + CommunityDragon
  -> scripts/data-pipeline (수집, 정규화, 계산, 진단, 검증)
  -> public/data/<patch> (3개 언어 정적 산출물)
  -> src/data repositories (스키마 검사, 버전 캐시)
  -> React 비교·백과·시뮬레이션 화면
```

현재 산출물의 정확한 패치와 원본 버전은 `public/data/version.json`에서 확인할 수 있습니다. `26.17`과 `16.17.1`처럼 보이는 표기는 각각 Riot 표시 패치와 Data Dragon 배포 버전이라 의도적으로 형식이 다릅니다.

## 개발

Node.js 24와 npm을 사용합니다.

```bash
npm ci
npm run dev
```

전체 검증:

```bash
npm run type-check
npm run lint
npm test
npm run build
npm run test:e2e
```

현재 패치 데이터를 로컬에서 다시 생성하려면 다음 명령을 실행합니다.

```bash
npm run generate-static-data
```

## 자동화

`Update Static Data` 워크플로는 30분마다 원본 버전을 확인합니다. 데이터가 바뀌었거나 `master`가 갱신되면 타입 검사, 린트, 전체 데이터 테스트, 프로덕션 빌드, Playwright를 통과한 산출물만 GitHub Pages에 배포합니다. 브라우저 테스트는 세 언어의 데스크톱·모바일 화면과 PWA 오프라인 직접 진입도 검사합니다.

로컬 LLM 매치업 생성기는 별도의 수동 워크플로입니다. 사용법과 지식 계층 계약은 `docs/local-llm-advisor.md`와 `knowledge/README.md`를 참고하세요.
제품 우선순위와 완료 기준은 `docs/product-roadmap.md`에 정리되어 있습니다.

## 라이선스

Apache License 2.0
