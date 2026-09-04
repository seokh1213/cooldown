# lol.ps 다국어 스킬 툴팁 역추적

생성 시각: 2026-09-04T08:34:57.960Z

## 직접 결론

lol.ps의 공개 챔피언 응답은 영어(Us), 한국어(Kr), 중국어(Cn) 완성 문장을 함께 제공한다. 세 언어의 DDragon 템플릿과 CDragon 현지화 템플릿을 같은 패치로 대조한 결과, 숫자 계산 규칙은 언어와 분리할 수 있다. 제품의 정답 원천은 언어 공통 Riot BIN 계산 AST로 두고, 각 언어 문장은 그 AST 결과를 삽입하는 렌더링 템플릿으로 취급해야 한다. lol.ps는 오류가 섞인 비교 오라클이지 원천 데이터가 아니다.

## 범위와 결과

- 패치: 26.17 / DDragon 16.17.1 / CDragon 16.17
- 챔피언: 173, 언어: en_US, ko_KR, zh_CN
- 언어별 Q/W/E/R 표본: 2076
- 변수 표본: 8010, 해석 7599, 미해석 411
- 해석값이 lol.ps 숫자에 포함: 6638/7599
- lol.ps 언어 간 숫자 집합 일치: 22/692
- 언어 간 숫자 불일치: 670

- DDragon 변수 집합 언어 간 일치: 692/692
- CDragon 변수 집합 언어 간 일치: 692/692

## 언어별 비교

| 언어 | 스킬 | 이름=DDragon | 이름=CDragon | 렌더 본문 | DDragon 골격 | CDragon 골격 | 변수 해석 | lol.ps 수치 포함 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| English | 692 | 99.0% | 99.0% | 79.6% | 64.1% | 64.1% | 2533/2670 | 2144/2533 |
| 한국어 | 692 | 99.4% | 99.4% | 84.8% | 60.3% | 60.3% | 2533/2670 | 2362/2533 |
| 简体中文 | 692 | 99.3% | 99.3% | 71.1% | 63.3% | 63.3% | 2533/2670 | 2132/2533 |

## 역추적된 규칙

1. DDragon의 언어별 `{{ token }}` 이름은 같은 스킬에서 대부분 동일하므로 계산 전에 언어 중립 키로 정규화한다.
2. CDragon의 `@Token@`은 BIN의 DataValues와 mSpellCalculations가 사용하는 이름과 연결된다.
3. DataValues와 계산 AST를 한 번 해석한 뒤 언어별 DDragon/CDragon 템플릿에 주입한다. 언어마다 공식을 다시 구현하지 않는다.
4. 비용과 쿨다운은 CDragon의 cost/cooldown 템플릿 및 coefficient 배열을 별도 구조 필드로 보존한다.
5. 언어 간 숫자가 다르면 번역 차이로 넘기지 않고 Riot 원본, 패치 노트, 계산 AST 순으로 판정한다.
6. 런타임 상태가 필요한 조건식과 버프 기반 식은 단일 값으로 접지 않고 조건/범위 AST로 출력한다.

문장 골격 친화도는 DDragon 우세 0, CDragon 우세 0, 동률 2076이다. 두 소스의 현지화 문장이 대체로 같은 클라이언트 원문에서 생성되므로 이 값만으로 lol.ps의 직접 입력 소스를 단정하지 않는다.

DDragon과 CDragon끼리의 문장 골격 완전 일치는 2067/2076, 평균 유사도는 100.0%다.

## 남은 계산 유형

| 유형 | 건수 |
| --- | ---: |
| CrossSpellReference | 261 |
| EffectAlias | 39 |
| missing | 27 |
| GameCalculation > ByCharLevelInterpolationCalculationPart | 15 |
| GameCalculation > BuffCounterByNamedDataValueCalculationPart | 12 |
| GameCalculationModified > NumberCalculationPart | 6 |
| GameCalculation > {f3cbe7b2} > ProductOfSubPartsCalculationPart > SumOfSubPartsCalculationPart > NamedDataValueCalculationPart > NumberCalculationPart | 3 |
| GameCalculation > BuffCounterByCoefficientCalculationPart | 3 |
| GameCalculation > EffectValueCalculationPart > ClampSubPartsCalculationPart > StatByCoefficientCalculationPart > NumberCalculationPart | 3 |
| GameCalculation > NamedDataValueCalculationPart > SumOfSubPartsCalculationPart > NumberCalculationPart > ProductOfSubPartsCalculationPart > StatByNamedDataValueCalculationPart > StatByCoefficientCalculationPart | 3 |
| GameCalculation > NamedDataValueCalculationPart > SumOfSubPartsCalculationPart > StatByNamedDataValueCalculationPart | 3 |
| GameCalculation > ProductOfSubPartsCalculationPart > CooldownMultiplierCalculationPart > NamedDataValueCalculationPart | 3 |
| GameCalculation > ProductOfSubPartsCalculationPart > CooldownMultiplierCalculationPart > NumberCalculationPart | 3 |
| GameCalculation > ProductOfSubPartsCalculationPart > SumOfSubPartsCalculationPart > StatByNamedDataValueCalculationPart > {ee18a47b} > NumberCalculationPart > NamedDataValueCalculationPart | 3 |
| GameCalculation > StatBySubPartCalculationPart > NamedDataValueCalculationPart | 3 |
| GameCalculation > StatBySubPartCalculationPart > SumOfSubPartsCalculationPart > ProductOfSubPartsCalculationPart > NumberCalculationPart > StatByCoefficientCalculationPart | 3 |
| GameCalculation > SumOfSubPartsCalculationPart > NamedDataValueCalculationPart | 3 |
| GameCalculation > SumOfSubPartsCalculationPart > NamedDataValueCalculationPart > ProductOfSubPartsCalculationPart > StatByCoefficientCalculationPart | 3 |
| GameCalculation > SumOfSubPartsCalculationPart > NumberCalculationPart | 3 |
| GameCalculation > SumOfSubPartsCalculationPart > NumberCalculationPart > ProductOfSubPartsCalculationPart > NamedDataValueCalculationPart > StatByCoefficientCalculationPart | 3 |
| GameCalculationConditional > HasBuffCastRequirement | 3 |
| GameCalculationModified > ProductOfSubPartsCalculationPart > NamedDataValueCalculationPart | 3 |
| GameCalculationModified > SumOfSubPartsCalculationPart > NamedDataValueCalculationPart > StatByNamedDataValueCalculationPart | 3 |

## 구현 권고

생성기는 `localizedTemplates`와 언어 공통 `calculationAst`를 분리하고, 최종 JSON에는 body/cost/cooldown/scalings/rankValues/conditions/unresolved를 저장한다. 다음 우선순위는 교차 스킬 참조, EffectAlias, 재귀 FormulaPart, 조건식 순이다.

## 패시브·아이템·소환사 주문

lol.ps 패시브는 Q/W/E/R과 같은 `basic-info.json` 응답의 `passiveNameKr/Us/Cn`, `passiveDescKr/Us/Cn` 완성 문자열이다. 오공 패시브처럼 DDragon에는 요약만 있는 경우에도 lol.ps 응답에는 방어력 레벨 보간, 체력 회복률, 중첩 지속시간과 최대 중첩이 이미 치환되어 있다.

Riot 원본에서 이를 재현하는 경로도 확인했다. 챔피언 BIN의 패시브 SpellObject에는 `mClientData.mTooltipData.mLocKeys.keyTooltip`과 DataValues/mSpellCalculations가 있고, locale별 `lol.stringtable.json`에는 그 키에 대응하는 `@BonusArmor@`, `@HealthPercentPer5*100@` 등의 템플릿이 있다. 따라서 패시브도 별도 수작업 데이터가 아니라 현재 Q/W/E/R과 같은 계산 AST 파이프라인으로 생성할 수 있다.

아이템과 소환사 주문은 챔피언 API와 분리되어 있다.

- 아이템: `/api/info/item-info/{itemId}`가 3개 언어 이름·완성 설명·가격·분류를 반환한다. 프론트는 DOMPurify 처리 후 줄을 능력치, 효과, 조합식, 가격으로 나눠 출력한다.
- 소환사 주문: `/api/info/spell-info/{spellId}`가 3개 언어 이름·설명을 반환한다. 프론트는 DOMPurify 처리 후 이름과 설명을 그대로 출력한다.
- 챔피언별 채택률/승률 데이터는 `/api/champ/{championId}/spellitem.json`에서 별도로 받아 위 정적 설명 API와 합친다.

즉 lol.ps의 공통 패턴은 `서버에서 locale별 완성 문자열 생성/저장 → 프론트에서 안전한 구조로 분해해 표현`이다. 우리 프로젝트는 서버가 없으므로 같은 작업을 CI 생성 단계에서 수행하고 정적 JSON으로 배포하면 된다.

## 한계

lol.ps 서버 내부 코드는 공개되어 있지 않아 구현 자체를 증명할 수는 없다. 이 보고서는 공개 API 출력과 Riot 계열 정적 데이터의 전수 비교로 동작 규칙을 추론한다. 중국어 파서의 계수 표시 라벨은 아직 제품 언어 타입에 포함되지 않아 수치 비교에는 영향이 없지만 최종 UI 현지화 시 별도 번역이 필요하다.

## 출처 및 주장 원장

- [lol.ps Corki basic-info API](https://lol.ps/api/champ/42/basic-info.json): Us/Kr/Cn 필드와 완성 문자열 확인, 2026-09-04 접근.
- [lol.ps Wukong basic-info API](https://lol.ps/api/champ/62/basic-info.json): 패시브 3개 언어 완성 문자열 확인, 2026-09-04 접근.
- [lol.ps Trinity Force item-info API](https://lol.ps/api/info/item-info/3078): 아이템 3개 언어 완성 설명과 구조 필드 확인, 2026-09-04 접근.
- [lol.ps Flash spell-info API](https://lol.ps/api/info/spell-info/4): 소환사 주문 3개 언어 이름·설명 확인, 2026-09-04 접근.
- [Riot Data Dragon 문서](https://developer.riotgames.com/docs/lol#data-dragon): 버전·locale URL 규칙, 변수와 effectBurn 해석, Riot Games, 2026-09-04 접근.
- [Data Dragon 언어 목록](https://ddragon.leagueoflegends.com/cdn/languages.json): 현재 locale 가용성, Riot Games, 2026-09-04 접근.
- [CommunityDragon 중국어 Corki 데이터](https://raw.communitydragon.org/16.17/plugins/rcp-be-lol-game-data/global/zh_cn/v1/champions/42.json): dynamicDescription, cost, cooldown 현지화 확인, 2026-09-04 접근.
- [CommunityDragon CDTB](https://github.com/CommunityDragon/CDTB): 게임 클라이언트 파일 추출 경로, CommunityDragon.
- [CommunityDragon 한국어 stringtable](https://raw.communitydragon.org/16.17/game/ko_kr/data/menu/en_us/lol.stringtable.json): 패시브 locale 템플릿과 치환 토큰 확인, 2026-09-04 접근.
- [calcrev 계산 구조](https://github.com/moonshadow565/calcrev/blob/master/calc_ida.h): 재귀 계산 노드 구조의 역공학 근거, moonshadow565.
