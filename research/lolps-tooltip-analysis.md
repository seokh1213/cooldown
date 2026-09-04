# lol.ps 스킬 툴팁 역추적

생성 시각: 2026-09-04T08:07:50.797Z

## 결론

lol.ps 응답은 Data Dragon의 미완성 템플릿을 그대로 표시하지 않는다. 그러나 별도의 비공개 공식을 추측할 필요는 없다. Riot BIN의 DataValues와 mSpellCalculations가 계산 AST를 제공하며, 이를 현재 스키마대로 읽는 것이 핵심이다. lol.ps 원문은 연구용 검증 오라클로만 사용하고 제품/CI의 데이터 원천으로 사용하지 않는다.

이번 조사에서 생성기가 구형 필드명 mName/mValues를 기대해 현재 필드명 name/values를 전부 누락하고 있음을 확인했다. 이를 수정하자 해석 성공 표본은 1,076건에서 5066건으로 증가했다.

## 표본

- 패치 키: 26.17 (Data Dragon 16.17.1, CommunityDragon 16.17)
- 로컬 챔피언: 173
- lol.ps 수집 성공: 173
- 비교한 언어별 스킬: 1384
- 의미 있는 변수 표본: 5340
- 우리 파서 해석 성공: 5066
- 미해석: 274
- 해석값의 lol.ps 수치 포함: 4506
- 해석했지만 수치 불일치: 560
- 평균 단어 집합 유사도: 82.2%

## 발견한 규칙

1. DataValues의 현재 원소 스키마는 name/values이며 배열의 0번은 툴팁 스킬 레벨 범위에서 제외한다.
2. mSpellCalculations는 GameCalculation, GameCalculationModified, GameCalculationConditional 루트와 재귀 FormulaPart AST로 해석한다.
3. mDisplayAsPercent, mMultiplier, mPrecision은 계산 후 표시 단계에 적용한다.
4. spell.<spell-id>:<variable>은 같은 챔피언의 다른 스킬 데이터를 참조한다. 현재 미해석의 가장 큰 부류다.
5. fN/eN은 효과 배열 또는 클라이언트 포맷 인자의 별칭이므로 일반 DataValue와 분리해 해석한다.
6. 버프 개수, 조건 분기, 쿨다운 배율처럼 런타임 상태가 필요한 식은 단일 숫자로 확정하지 않고 조건/범위 구조로 보존한다.

## 많이 남은 변수

| 변수 | 건수 |
| --- | ---: |
| f1 | 12 |
| ammorechargetime | 10 |
| f2 | 6 |
| resistsfortooltip | 4 |
| spell.zyrap:plantdamage | 4 |
| spell.zyrap:plantduration | 4 |
| addamagecalc | 2 |
| alldamagehit | 2 |
| ammorechargeratetooltip | 2 |
| bonusattackspeedcalc | 2 |
| burstbonustruedamagetochamps | 2 |
| calc_base_heal | 2 |
| chargecooldown | 2 |
| cost | 2 |
| empoweredattackdamage | 2 |
| empowereddamagemultcalcmodified | 2 |
| empoweredhealtooltip | 2 |
| empoweredlightningbonusmax | 2 |
| executetooltipcalc | 2 |
| f10.1 | 2 |
| f11.1 | 2 |
| f2.0 | 2 |
| f2.1 | 2 |
| initialdr | 2 |
| maxammo | 2 |

## 미해석 계산 유형

| 유형 | 건수 |
| --- | ---: |
| CrossSpellReference | 174 |
| EffectAlias | 26 |
| missing | 18 |
| GameCalculation > ByCharLevelInterpolationCalculationPart | 10 |
| GameCalculation > BuffCounterByNamedDataValueCalculationPart | 8 |
| GameCalculationModified > NumberCalculationPart | 4 |
| GameCalculation > {f3cbe7b2} > ProductOfSubPartsCalculationPart > SumOfSubPartsCalculationPart > NamedDataValueCalculationPart > NumberCalculationPart | 2 |
| GameCalculation > BuffCounterByCoefficientCalculationPart | 2 |
| GameCalculation > EffectValueCalculationPart > ClampSubPartsCalculationPart > StatByCoefficientCalculationPart > NumberCalculationPart | 2 |
| GameCalculation > NamedDataValueCalculationPart > SumOfSubPartsCalculationPart > NumberCalculationPart > ProductOfSubPartsCalculationPart > StatByNamedDataValueCalculationPart > StatByCoefficientCalculationPart | 2 |
| GameCalculation > NamedDataValueCalculationPart > SumOfSubPartsCalculationPart > StatByNamedDataValueCalculationPart | 2 |
| GameCalculation > ProductOfSubPartsCalculationPart > CooldownMultiplierCalculationPart > NamedDataValueCalculationPart | 2 |
| GameCalculation > ProductOfSubPartsCalculationPart > CooldownMultiplierCalculationPart > NumberCalculationPart | 2 |
| GameCalculation > ProductOfSubPartsCalculationPart > SumOfSubPartsCalculationPart > StatByNamedDataValueCalculationPart > {ee18a47b} > NumberCalculationPart > NamedDataValueCalculationPart | 2 |
| GameCalculation > StatBySubPartCalculationPart > NamedDataValueCalculationPart | 2 |
| GameCalculation > StatBySubPartCalculationPart > SumOfSubPartsCalculationPart > ProductOfSubPartsCalculationPart > NumberCalculationPart > StatByCoefficientCalculationPart | 2 |
| GameCalculation > SumOfSubPartsCalculationPart > NamedDataValueCalculationPart | 2 |
| GameCalculation > SumOfSubPartsCalculationPart > NamedDataValueCalculationPart > ProductOfSubPartsCalculationPart > StatByCoefficientCalculationPart | 2 |
| GameCalculation > SumOfSubPartsCalculationPart > NumberCalculationPart | 2 |
| GameCalculation > SumOfSubPartsCalculationPart > NumberCalculationPart > ProductOfSubPartsCalculationPart > NamedDataValueCalculationPart > StatByCoefficientCalculationPart | 2 |
| GameCalculationConditional > HasBuffCastRequirement | 2 |
| GameCalculationModified > ProductOfSubPartsCalculationPart > NamedDataValueCalculationPart | 2 |
| GameCalculationModified > SumOfSubPartsCalculationPart > NamedDataValueCalculationPart > StatByNamedDataValueCalculationPart | 2 |

## 자주 불일치한 변수

| 변수 | 건수 |
| --- | ---: |
| totaldamage | 37 |
| totaldamagetooltip | 8 |
| damage | 7 |
| empowereddamage | 7 |
| initialdamage | 6 |
| stunduration | 6 |
| basedamage | 5 |
| maxdamage | 5 |
| maxhealthdamagecalc | 5 |
| slowamount*100 | 5 |
| slowduration | 5 |
| aoedamage | 4 |
| empowereddamagetooltip | 4 |
| healthdamagepercent | 4 |
| slowpercent | 4 |
| totalheal | 4 |
| trailduration | 4 |
| bonusmr | 3 |
| damagecalc | 3 |
| damagepersecond | 3 |
| duration | 3 |
| e2 | 3 |
| fearduration | 3 |
| knockupduration | 3 |
| maxdamagecalc | 3 |

## 해석 원칙

1. 언어별 문장은 번역 원문이므로 텍스트 전체 일치보다 각 변수의 수치 시그니처를 우선 비교한다.
2. 비용과 쿨다운은 lol.ps가 본문 뒤에 붙이므로 본문 비교에서 제외한다.
3. 불일치는 즉시 override로 만들지 않고 계산 파트 유형별 공통 규칙을 먼저 찾는다.
4. lol.ps 자체 오류 가능성이 있으므로 동일 수치를 Riot 원본 및 패치 노트와 교차 확인한다.

## lol.ps를 절대 정답으로 사용할 수 없는 이유

전체 표본에는 명백한 오타와 언어별 불일치가 있다. 예를 들어 알리스타 Q의 60/100/140/180/220이 60/100/450/180/220으로 기록되어 있고, 아칼리 W 영문은 2초 이동 속도 감소 시간을 스킬 레벨값으로 잘못 표시한다. 따라서 lol.ps 일치는 회귀 신호이지 정답 판정이 아니다. Riot BIN을 1차 원천으로 두고 불일치만 사람이 확인해야 한다.

## 구현 우선순위

1. 현재 DataValues 스키마 회귀 테스트 유지
2. 교차 스킬 참조 resolver 추가
3. SumOfSubParts, StatBySubPart, ClampSubParts 계산 파트 추가
4. GameCalculationConditional을 조건 구조로 정규화
5. 생성 단계에서 본문/비용/쿨다운/계수/미해결 진단을 구조 데이터로 저장

## 출처

- [lol.ps champion basic-info API](https://lol.ps/api/champ/42/basic-info.json)
- [CommunityDragon champion data](https://raw.communitydragon.org/16.17/plugins/rcp-be-lol-game-data/global/ko_kr/v1/champions/42.json)
- [CommunityDragon data extraction project](https://github.com/CommunityDragon/CDTB)
- [Reverse-engineered calculation structures](https://github.com/moonshadow565/calcrev/blob/master/calc_ida.h)
- [Riot Data Dragon documentation](https://developer.riotgames.com/docs/lol#data-dragon)
