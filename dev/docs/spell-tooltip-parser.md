## 스킬 툴팁 파서 개요

2026-10-06 기준 구현 설명. 데이터 버전은 `public/data/version.json`을 따르며, 아래 크산테 예시는 26.19 저장 자료를 기준으로 한다.

이 모듈은 **Data Dragon 스킬 데이터(`ChampionSpell`)**와  
**Community Dragon 스킬 데이터(`CommunityDragonSpellData`)**를 조합해서
최종적으로 **HTML 툴팁 문자열**을 만들어 주는 레이어입니다.

- **입력**
  - Riot Data Dragon의 `ChampionSpell` (기본 툴팁/레벨별 수치)
  - Community Dragon의 `DataValues`, `mSpellCalculations`, `effectBurn` 등 (정확한 수식/계수 정보)
  - 원본 툴팁 텍스트(tooltip/description), 언어 코드(`ko_KR`, `en_US` 등)
- **출력**
  - 색상/강조 HTML, `levelValues`, 미해결 토큰과 생략된 계산 항 진단
  - 계수·조건·시뮬레이션은 후속 단계인 `dev/scripts/data-pipeline/champion-data-v2.ts`에서 Ability v2에 추가

툴팁 파싱은 정적 데이터 생성 단계에서 실행됩니다. 브라우저는 완성된 Ability v2를 읽고 `SafeBlockHtml`/`SafeInlineHtml`의 태그·속성 허용 목록을 거쳐 표시합니다. 레벨값 포맷터와 스탯 아이콘 유틸은 브라우저에서도 재사용합니다.

외부에서는 보통 다음 경로를 사용합니다.

```ts
import {
  parseSpellTooltip,
  parseSpellTooltipWithDiagnostics,
  parseSpellDescription,
  parseItemDescription,
} from "@/domain/game/tooltip/parser";
```

내부 구현은 `src/domain/game/tooltip/` 디렉터리 아래로 모듈화되어 있습니다.

---

## 주요 진입점

- **`parseSpellTooltip(text, spell, communityDragonData?, lang?)`**
  - 실제 스킬 **툴팁(tooltip)**에 사용되는 파서
  - XML 태그 → HTML 변환, `{{ 변수 }}` 치환, HTML 정리까지 전체 파이프라인 수행

- **`parseSpellDescription(text, spell, lang?)`**
  - 간단한 **description 필드** 전용
  - XML 태그 변환 + 변수 치환까지만 수행 (sanitize나 `<br />` 변환은 안 함)

- **`parseSpellTooltipWithDiagnostics(text, spell, communityDragonData?, lang?)`**
  - `{ html, unresolvedTokens, droppedCalculations, levelValues }` 반환
  - 문자열만 필요한 `parseSpellTooltip`도 이 함수를 거침

- **`parseItemDescription(text)`**
  - 아이템 XML 태그 변환, 변수의 `?` 표시, 공백·줄바꿈 정리

언어 기본값은 `ko_KR`이며 `en_US`, `zh_CN`도 지원합니다. 예전 `formatLeveltipStats` API와 facade 파일은 없습니다. 랭크별 수치는 Ability v2 생성기의 `buildRankValues`가 구조화합니다(아래 3절).

---

## 전체 파이프라인 흐름

### 1. XML 태그 → HTML (`convertXmlTagsToHtml`)

원본 툴팁에는 LoL 전용 XML 태그가 섞여 있습니다. 예:

```xml
<magicDamage>{{ e1 }} 마법 피해</magicDamage>
<physicalDamage>{{ e2 }} 물리 피해</physicalDamage>
<font color='#91d7ee'>투명</font>
```

이것을 Tailwind 스타일이 붙은 `<span>` 기반 HTML로 변환합니다.

- 예: `<magicDamage>...</magicDamage>`  
  → `<span class="text-blue-600 dark:text-blue-500 font-semibold">...</span>`
- `<font color='#91d7ee'>`  
  → `<span style="color: #91d7ee">`

`style`은 생성 문자열에 남을 수 있지만 브라우저의 허용 속성에 없으므로 표시할 때 제거됩니다. 이 단계의 `sanitizeHtml`은 공백·줄바꿈 정리 함수이며, HTML 보안 검증은 `src/shared/ui/safe-html.tsx`의 DOMPurify 정책이 맡습니다.

이 단계는 **변수 치환 전에 먼저** 수행됩니다.  
이유는 XML 태그 내부의 `{{ 변수 }}`도 그대로 유지하면서, HTML 구조만 바꾸기 위함입니다.

관련 코드: `xmlTagConverter.ts`

---

### 2. `{{ 변수 }}` 치환 (`replaceVariables` / `replaceVariable`)

`parseSpellTooltipWithDiagnostics`의 핵심 단계입니다. 문자열 전용 API도 이 경로를 거칩니다.

```ts
const replaced = replaceVariablesWithDiagnostics(converted, spell, communityDragonData, lang);
```

#### 2-1. 사전 정리 (문자/패턴 정제)

`replaceVariables`는 치환 전에 텍스트를 한 번 정제합니다.

- **연산자 주변 공백 보정**
  - `"{{ calc_damage_1_max }}+Max Health"` → `"{{ calc_damage_1_max }} + Max Health"`
  - `"50~100"` → `"50 ~ 100"`
- **중첩된 변수 패턴 정리**
  - 지원하지 않는 중첩 블록은 본문에서 제거하며 `unresolvedTokens`에는 집계하지 않음
- **치환 불가능한 특수 패턴 제거**
  - `{{Spell_*_Tooltip}}`, `{{ spellmodifierdescriptionappend }}` 등은 실제 수치를 만들 수 없어서 제거

#### 2-2. `{{ ... }}` 패턴 탐색

정규식으로 모든 `{{ ... }}`를 스캔합니다.

```regex
\{\{([^}]+)}}
```

각 변수 문자열에 대해 다음을 수행합니다.

1. **정밀도(precision) 접미사 처리**
   - 예: `rcooldownreduction.0*100`
   - 정규식으로 `변수명.정수 + 나머지식` 형태를 분리:
     - baseName: `rcooldownreduction`
     - precision: `0`
     - tail: `*100`
     - 실제 평가에 사용하는 표현식: `rcooldownreduction*100`
   - 이 정보는 **치환 결과 전체 숫자를 반올림할 때** 사용합니다.

2. **변수 치환 본체 호출 (`replaceVariable`)**

```ts
const replacement = replaceVariable(
  effectiveVar, // precision 접미사가 제거된 표현식
  spell,
  communityDragonData,
  lang
);
```

3. **정밀도 적용 (`applyNumericPrecision`)**
   - precision이 지정된 경우, 치환 결과 문자열 안의 **모든 숫자**를 해당 자릿수로 `toFixed` 처리
   - 예:
     - precision=0, `"33.333 / 66.666"` → `"33 / 67"`
     - precision=1, `"33.0"` → `"33.0"` (0이어도 표시)

#### 2-3. 변수 해석 우선순위 (`replaceVariable`)

`replaceVariable(trimmedVar, spell, communityDragonData, lang)`은
다음 **우선순위**로 데이터를 찾습니다.

1. 런타임 토큰 별칭을 정규화하고 자원·쿨타임 등 스킬 메타데이터를 먼저 조회
2. `spell.<이름>:<변수>` 참조가 있으면 해당 형제 스킬의 데이터·최대 랭크 선택. 출처가 없으면 실패
3. 단축키(`HotKey`), **`effectBurn` 기반 `eN` 변수**, DDragon의 `cost`·`maxammo` 순서로 조회
4. **Community Dragon `DataValues`** (`replaceData`)
5. **Community Dragon `mSpellCalculations`** (`replaceCalculateData`)

못 찾으면 `null`을 반환합니다. 호출자는 토큰을 `?`로 남기고 원본 토큰을 `diagnostics.unresolvedTokens`에 보존하므로 조용히 숫자가 사라지지 않습니다.

---

## 2-3-1. `e1`, `e2` 같은 `effectBurn` 변수 (`replaceEffectBurn`)

형식: `e1`, `e2`, `e5` …

1. `CommunityDragonSpellData.effectBurn`가 있으면 **우선 사용**
2. 없으면 `ChampionSpell.effectBurn` (Data Dragon) 사용
3. 문자열 파싱:
   - `"80/100/120"` → `[80, 100, 120]`
   - `"0.5"` → `0.5`
4. `parseExpression`가 `e1 * 100`, `e1 + 3` 같은 **수식**으로 파싱해 준 경우,
   `applyFormulaToValue`로 벡터/스칼라에 일괄 적용
5. 마지막으로 `valueToTooltipString`으로 툴팁용 문자열로 변환
   - 벡터: `"80/100/120"` 형식
   - 스칼라: `"80"`

관련 코드: `variableReplacer.ts` (`replaceEffectBurn`), `dataValueUtils.ts`, `valueUtils.ts`

---

## 2-3-2. Community Dragon `DataValues` (`replaceData`)

형식: **이름 기반 DataValues 조회 + 간단 수식**

- 예:
  - `{{ basedamage }}` → `DataValues["BaseDamage"]`
  - `{{ armorshredpercent*100 }}` → `DataValues["ArmorShredPercent"] * 100`

동작 순서:

1. `parseExpression`으로 `"변수"` 또는 `"변수 + 숫자"`, `"변수 * 숫자"` 등을 파싱
2. `getDataValueByName(DataValues, variable, spell.maxrank)`로 이름(대소문자 무시) 매칭
   - 배열의 칸 번호는 스킬 랭크이며 **0번은 아직 배우지 않은 0랭크**입니다. 보통 1~maxRank를 사용합니다.
   - 배우기 전에도 표시되는 형제 스킬 참조는 `rankZeroReferences.ts`의 조건에 따라 0랭크부터 읽습니다.
   - 이름의 대소문자, `m` 접두사, BIN 해시를 지원합니다. 모든 랭크 값이 같으면 스칼라, 다르면 벡터로 유지합니다.
3. `applyFormulaToValue`로 `* 100`, `+3` 같은 연산 적용
4. `valueToTooltipString`으로 `"1/2/3"` 혹은 `"250"` 같은 문자열로 변환

관련 코드: `dataValueHandler.ts`, `dataValueUtils.ts`, `expressionParser.ts`

---

## 2-3-3. Community Dragon `mSpellCalculations` (`replaceCalculateData`)

이 부분이 **가장 복잡한 계산 로직**입니다.  
목표는 `mSpellCalculations`의 구조화된 수식을

- **기본 값(base)**: 레벨별 피해량, 고정 수치 등
- **스탯 계수(statParts)**: `+ 60% bonus AD`, `+ 30% AP` 등

형태로 나눈 뒤, **사람이 읽을 수 있는 문자열**로 만드는 것입니다.

### 1) `SpellCalculation` 타입

- `GameCalculationModified`
  - 다른 `GameCalculation` 결과에 multiplier를 곱하는 래퍼
- `GameCalculationConditional`
  - 기본 계산식을 우선 선택하고, 없으면 조건 계산식을 사용. 현재 플레이 상태를 평가하는 것은 아님
- `GameCalculation`
  - `mFormulaParts` 배열과 여러 플래그(`mDisplayAsPercent`, `mMultiplier`, `mPrecision`, `mSimpleTooltipCalculationDisplay`)를 가지고 있음

### 2) 공통 결과 타입: `CalcResult`

- `base: Value`  
  - 순수 수치 부분 (벡터 또는 스칼라)
- `statParts: StatPart[]`  
  - 스탯 계수 목록 (이름 + 비율)
- `isPercent?: boolean`  
  - `mDisplayAsPercent` → 퍼센트로 표시해야 하는지
- `isCharLevelRange?` / `isBreakpointRange?`  
  - `(40% ~ 100%)`, `(12 ~ 8)` 같은 **레벨 범위 표현**을 위한 플래그
- `precision?: number`  
  - `mPrecision` 표시 자릿수. `-1`은 소수 셋째 자리까지 표시하고 끝자리 0 제거
- `extraRanges` / `groupedParts`
  - 랭크와 챔피언 레벨처럼 합칠 수 없는 축, 다른 계산식의 괄호·연산 순서 보존
- `statMultiplier` / `extraMultipliers`
  - 런타임 스탯에 의존하거나 다른 축을 가진 배율은 `× 배율` 형태로 별도 보존

### 3) GameCalculation 특수 케이스

`GameCalculation` 안에서 **특정 패턴**은 별도로 처리합니다.

- **브레이크포인트 단순 범위 (`ByCharLevelBreakpointsCalculationPart` + `mSimpleTooltipCalculationDisplay === 6`)**
  - 예: `(12 ~ 8)` 같은 형태
  - `mInitialBonusPerLevel`, 각 지점의 `mAdditionalBonusAtThisLevel`·`mBonusPerLevelAtAndAfter`를 적용해 1~20레벨 값을 보존

- **챔피언 레벨당 선형 증가 퍼센트 (`ByCharLevelBreakpointsCalculationPart` + `mDisplayAsPercent === true`)**
  - 예: 1레벨 40% ~ 16레벨 100% → `(40% ~ 100%)`
  - 첫 브레이크포인트에서 잘라 계산하지 않고 모든 레벨·브레이크포인트를 적용

- **선형 보간 퍼센트 범위 (`ByCharLevelInterpolationCalculationPart` + `mDisplayAsPercent === true`)**
  - 예: `mStartValue=0.8`, `mEndValue=0.95` → 나중에 ×100을 거쳐 `(80% ~ 95%)`
  - `mScaleByStatProgressionMultiplier`가 있으면 스탯 성장 곡선으로 보간. 19·20레벨은 18레벨 값 유지

레벨 범위 문구는 1·18레벨 끝값을 표시하지만 `levelValues.values`는 1~20레벨을 저장합니다. 레벨별 나열형 `ByCharLevelFormulaCalculationPart`도 지원합니다. 배열 `[0]`은 0레벨이므로 제외하고, 20레벨까지 값이 부족하면 마지막 값으로 채웁니다. 관련 코드: `src/domain/game/championLevel.ts`, `calculationPartEvaluator.ts`, `calculationResultFormatter.ts`.

### 4) 일반적인 Formula Part 처리

`mFormulaParts`를 순회하면서 다음 타입들을 분리합니다.

- **`NamedDataValueCalculationPart`**
  - `DataValues`에서 값 가져와 **base**에 더함

- **`EffectValueCalculationPart`**
  - `spell.effectBurn`(또는 CDragon effectBurn)의 N번째 인덱스를 파싱
  - `"80/100/120"` → `[80,100,120]`, 스칼라/벡터 모두 지원

- **`StatByNamedDataValueCalculationPart`**
  - 특정 스탯 비율 정보 (`0.5`, `[0.3, 0.4, ...]`)
  - `getStatName(mStat, mStatFormula, lang)`으로 `AD`, `bonus AD`, `Health` 같은 이름 결정
  - `statParts`에 `{ name, ratio }`로 축적

- **`StatByCoefficientCalculationPart`**
  - 순수 계수(예: `1` → 100%) + 스탯 코드 (`mStat`, `mStatFormula`)
  - 나중에 `ratio * 100` 또는 `scaleBy100`으로 퍼센트화하여 표시

- **`AbilityResourceByCoefficientCalculationPart`**
  - 자원(마나, 기력 등)에 비례하는 계수
  - `costType`, `resource`를 보고 실제 이름 결정 (`"mana"`, `"Energy"`, `"영혼의 조각"` 등)
  - `mStatFormula === 2`인 경우 `"bonus {resource}"`로 표시

- **`NumberCalculationPart`**
  - 단순 상수 → base에 더함

- **`ByCharLevelBreakpointsCalculationPart` (일반 케이스)**
  - 레벨마다 증가량과 추가량을 계산해 레벨 축의 base에 더함. 랭크 벡터와 길이가 다르면 별도 범위로 보존

- **`ProductOfSubPartsCalculationPart`**
  - `mPart1 × mPart2` 형태의 곱을 재귀 평가
  - 한 항이라도 안전하게 해석할 수 없으면 부분 값을 0으로 꾸미지 않고 해당 계산을 미지원으로 판정

`SumOfSubParts`, `ClampSubParts`, `SpellCalculationSubPart`, `StatBySubPart`, 버프 중첩 계수 등도 처리합니다. 지원되지 않는 항은 `droppedCalculations`에 남기고 해석 가능한 나머지 항을 표시할 수 있습니다. `unresolvedTokens`가 비어 있어도 계산이 완전하다는 뜻은 아닙니다.

### 5) multiplier, 퍼센트, 정밀도 반영

1. **multiplier (`mMultiplier`)**
   - `DataValue`, `Number` 및 계산 파트를 재귀 평가
   - 안전하게 접을 수 있는 배율은 base와 stat ratio에 곱함. 스탯 의존·랭크×레벨 배율은 별도 표시
2. **퍼센트 처리 (`mDisplayAsPercent`)**
   - `isPercent === true`인 경우 base를 ×100
   - `precision`이 있으면 단순 *100만 하고, 실제 반올림/표시는 포맷터에 위임
3. **정밀도(`mPrecision`) 해석**
   - 기본 수치의 챔피언 레벨 범위는 원래 자릿수 사용. 생략 시 정수, `-1`은 소수 셋째 자리까지 표시하며 끝자리 0 제거
   - 랭크별 값·스탯 계수·배율은 0 이상일 때 한 자리 더 사용(예: `mPrecision=1` → 소수 둘째 자리)
   - float32 잡음은 유효숫자 7자리로 정리한 뒤 10진 반올림. 범위 문구와 표는 같은 포맷터 사용

### 6) 최종 문자열 조립

1. **baseStr 만들기**
   - 합의 기본값 0은 보통 생략. 템플릿 연산으로 해결된 0은 `showZero`로 보존
   - 레벨 범위(`isCharLevelRange`, `isBreakpointRange`)인 경우
     - 퍼센트: `(40% ~ 100%)`
     - 일반 수치: `(12 ~ 8)`
   - 그 외:
     - 벡터: `"4/8/12/16/20"`
     - 스칼라: `"275"`
     - 퍼센트면 끝에 `%` 하나 붙임

2. **stat 계수 문자열**
   - 항상 `(% + 스탯 이름)` 형태
   - 예: `"(60% bonus AD)"`, `"(50% AP)"`

3. **합치기**
   - base + stat들을 `" + "`로 연결
   - 항목이 2개 이상일 때 전체를 한 번 더 괄호로 감쌈
   - 예:
     - `"20/45/70/95/120 + (50% AD)"` → `"20/45/70/95/120 + (50% AD)"`
     - 여러 항목일 경우 `"(... + ...)"` 형태

관련 코드: `spellCalculationHandler.ts`, `spellCalculationEvaluator.ts`, `calculationOperations.ts`, `calculationResultFormatter.ts`, `valueUtils.ts`, `types.ts`

---

## 3. Leveltip에서 랭크별 수치 생성 (`buildRankValues`)

Ability v2 생성기가 스킬 **랭크별 수치**를 구조화하는 로직입니다. 챔피언 레벨별 표인 `levelValues`와는 다른 축입니다.

- 입력: `ChampionSpell.leveltip.label` / `leveltip.effect`
  - label: `"피해량"`, `"둔화율"` 등
  - effect: `"{{ e1 }}"`, `"{{ armorshredpercent*100 }}"` 등
- 출력 예:
  - `[{ label: "피해량", values: "50/75/100/125/150" }, { label: "쿨다운", values: "10/9/8/7/6" }]`

동작 순서:

1. label/effect 페어를 순회하면서 effect에서 **첫 번째 `{{ ... }}` 변수**를 추출
2. `replaceVariable`로 본문과 같은 우선순위로 해석하고 스탯 아이콘 토큰 제거
3. 해석 결과가 없으면 그 항목을 제외. 별도의 Leveltip HTML 생성 API는 없음
4. label의 `@AbilityResourceName@`를 실제 자원 이름으로 치환
5. 번역된 label 대신 원본 effect의 `}}%` 패턴으로 퍼센트 여부 판단. 결과에 `%`가 없으면 슬래시로 나뉜 각 값에 추가
6. `{ label, values }` 목록을 `rankValues`로 저장

변신 형태 생성은 기본 폼의 비용·effect·leveltip을 다른 폼에 섞지 않도록 `leveltip`을 비웁니다. 각 폼 본문과 `levelValues`·쿨타임을 별도로 보존하며, 폼별 `rankValues` 목록은 현재 계약에 없습니다.

관련 코드: `dev/scripts/data-pipeline/champion-data-v2.ts`, `dev/scripts/data-pipeline/ability-forms.ts`

---

## 4. 숫자 포맷 정책

### `formatNumber`

- 정수: 그대로 (`10`)
- 소수: 최대 3자리까지, 불필요한 0 제거
  - `0.3000` → `"0.3"`
  - `1.000` → `"1"`

### `valueToTooltipString`

- 벡터: 모든 값이 같으면 하나만, 다르면 `"v1/v2/v3"` 형식
- 스칼라: `formatNumber` 그대로

### `scaleBy100`

- 퍼센트 변환 전용
- 기존에는 `Math.round(v * 100)`이었으나 지금은 **단순 ×100만 수행**하고,
  실제 반올림/표시는 `formatNumber`에 맡김

### `applyNumericPrecision`

- precision이 붙은 변수(`rcooldownreduction.0*100` 등)에서 사용
- 치환 후 문자열 안의 **모든 숫자**를 `toFixed(precision)`로 강제 포맷

관련 코드: `formatters.ts`, `valueUtils.ts`, `variableTextUtils.ts`, `calculationResultFormatter.ts`

---

## 5. 나머지 유틸들

### XML 태그 맵 (`XML_TAG_MAP`)

`magicDamage`, `physicalDamage`, `trueDamage` 등 XML 태그를
Tailwind 색상 클래스를 가진 `<span>` 태그로 매핑합니다.

필요 시 여기서 **색상/강조 스타일을 추가/수정**하면 됩니다.  
관련 코드: `xmlTagConverter.ts`

## 6. 실제 데이터 예시 – 크산테 W (`KSanteW`)

이 섹션은 **26.19 / DDragon 16.19.1 / CDragon 16.19** 저장 자료의 예시입니다.
실제 생성 버전은 `public/data/version.json`에서 선택합니다. 아래 숫자는 패치가 바뀔 때 자동으로 갱신되지 않습니다.

### 6-1. Tooltip 본문 예시

- **원본 tooltip (발췌)**  
  `"크산테가 무기를 치켜들며 {{ mindurationtooltip }}~{{ maxduration.1 }}초 동안 방어 태세에 돌입합니다. 이때 크산테는 저지 불가 상태가 되며 받는 피해가 {{ damagereduction*100 }}% 감소합니다. 이후 전방으로 돌진하며 <physicalDamage>{{ basedamage }}+최대 체력의 {{ totalmaxhealthdamage }}에 해당하는 물리 피해</physicalDamage>를 입힙니다. ... {{ rdamageincreasemin*100 }}~{{ rdamageincreasemax*100 }}%만큼 ... 피해량 감소 효과가 {{ rdamagereduction*100 }}%까지 증가하며 ..."`

- **대표 변수 처리 흐름**
  - `{{ mindurationtooltip }}`, `{{ maxduration.1 }}`  
    - CDragon `DataValues`에서 지속 시간 관련 값을 읽어와,  
      레벨/상황에 따라 최소/최대 지속 시간을 숫자로 치환합니다.
    - `maxduration.1` 처럼 **`.1`이 붙은 표현식**은
      - 먼저 `maxduration` 변수로 치환을 수행한 뒤
      - 최종 결과 문자열 안의 숫자들을 `toFixed(1)`로 포맷하여 소수점 첫째 자리까지 **항상 명시**합니다  
        (예: `0.5` → `"0.5"`, `1` → `"1.0"`).
  - `{{ damagereduction*100 }}`  
    - `damagereduction` DataValue(예: `0.3`)에 `*100` 포뮬라를 적용 → `"30"`  
    - tooltip에서는 `"30%"`로 노출됩니다.
  - `{{ basedamage }}`  
    - `mSpellCalculations`의 `BaseDamage` 계산식에서
      - 기본 피해량(DataValues `FlatDamage`)
      - 현재 저장된 기본 피해는 `45/75/105/135/165`입니다.
      방어력/마저 계수는 아래의 최대 체력 비례 피해 안에 표시됩니다.
  - `{{ totalmaxhealthdamage }}`  
    - 최대 체력 비례 피해 비율을 DataValues/계산식에서 읽어와  
      현재는 `최대 체력의 (8% + (추가 방어력 100당 2%) + (추가 마법 저항력 100당 2%))`로 표현됩니다.
  - `{{ rdamageincreasemin*100 }}`, `{{ rdamageincreasemax*100 }}`  
    - 총공세(R 상태)에서 추가로 들어가는 피해 비율을  
      현재 저장 결과는 `10 ~ 80%`의 추가 고정 피해입니다. 이는 충전 시간에 따른 범위이며 챔피언 레벨 표 대상이 아닙니다.

이 모든 변수 치환은 `replaceVariables`가

1. `parseExpression`으로 수식을 파싱하고
2. `replaceData` / `replaceCalculateData`를 통해 DataValues와 mSpellCalculations를 조회한 뒤
3. `formatNumber` / `valueToTooltipString`으로 숫자를 문자열로 변환하는 흐름에 따라 이루어집니다.

### 6-2. Leveltip 예시 (소모값 포함)

- **원본 leveltip (발췌)**  
  - `label: ["피해량", "재사용 대기시간", "소모값 @AbilityResourceName@"]`
  - `effect: ["{{ basedamage }} -> {{ basedamageNL }}", "{{ cooldown }} -> {{ cooldownNL }}", "{{ cost }} -> {{ costNL }}"]`
- **DDragon 스킬 데이터 (발췌)**  
  - `cost = [40, 45, 50, 55, 60]`
  - `costBurn = "40/45/50/55/60"`
  - `costType = " {{ cost }}"`, `resource = "{{ abilityresourcename }} {{ cost }}"`

`buildRankValues`는 위 leveltip 정보를 이용해 다음과 같이 처리합니다.

1. 세 번째 label/effect 쌍에서 `effectPattern = "{{ cost }} -> {{ costNL }}"`에서 `cost`를 추출합니다.
2. `replaceVariable`의 스킬 비용 폴백이 `spell.costBurn`(`"40/45/50/55/60"`)을 읽습니다.
   - `"40/45/50/55/60"` → 레벨별 소모값 문자열 그대로 유지
3. label에 포함된 `@AbilityResourceName@`는 `getAbilityResourceName(spell, lang)`을 통해  
   실제 자원 이름(예: `"마나"`, `"기력"`, 특수 자원 문자열 등)으로 치환됩니다.
4. 최종 항목은 `{ label: "소모값 마나", values: "40/45/50/55/60" }`로 저장합니다.

동일한 규칙으로 첫 번째/두 번째 라인도

- `{{ basedamage }} -> {{ basedamageNL }}`  
  → 피해량 레벨별 증가값
- `{{ cooldown }} -> {{ cooldownNL }}`  
  → 재사용 대기시간 레벨별 변화

를 각각 해석하여 `rankValues` 목록에 저장합니다.

## 7. 킬각 시뮬레이션 계산식 생성

툴팁 문자열과 킬각 계산은 같은 CDragon 원본을 사용하지만 목적이 다릅니다.
문자열 파서는 사람이 읽을 설명을 만들고, `ability-simulation.ts`는 브라우저에서
평가할 수 있는 선형 계산식 또는 제한된 공식 트리를 정적 데이터로 내보냅니다.

- 원본 툴팁이 실제로 참조한 피해 계산 키를 우선합니다. 그중 `Damage`·`TotalDamage` 같은 대표 이름이 먼저이며, 이후 정해진 우선순위·이름 정렬로 후보를 보충합니다.
- 후보를 감싼 `physicalDamage`, `magicDamage`, `trueDamage` 태그로 피해 유형을 정합니다.
- 기본값과 계수는 스킬 랭크 및 챔피언 레벨 축을 보존합니다. 시뮬레이션의 레벨 행렬은 현재 1~18레벨이며, 툴팁 표의 1~20레벨 값과 별개입니다.
- 수정 계산, 조건 계산, 다른 계산식 참조, 합과 안전한 곱은 재귀적으로 펼칩니다.
- 최대·현재·잃은 체력 비례 피해는 툴팁 문맥으로 종류가 확정될 때만 대상 체력에 적용합니다.
- 선형으로 접히면 `complete`와 `primary`를 저장합니다. 접히지 않으면 공식 트리를 다시 시도해 `expression`으로 저장합니다.
- 공식 트리는 값·스탯·버프 중첩·합·곱을 지원하므로 능력치끼리의 곱과 중첩식도 표현할 수 있습니다. `requiresBuffStacks`로 중첩 입력 필요 여부를 표시하며 평가기에서 입력이 없으면 0으로 계산합니다.
- 미니언·몬스터 전용 이름은 일반 피해 후보에서 제외합니다. 모르는 계산 파트를 임의로 근사하지 않으며 두 경로 모두 실패하면 `unsupported`, 피해 후보 자체가 없으면 `unavailable`입니다.

`GameCalculationConditional`은 기본 계산식을 선택하며 실제 전투 상태를 판정하지 않습니다. `complete`도 전체 스킬의 충전·재시전·모든 적중 횟수를 검증했다는 뜻은 아닙니다. 새로운 CDragon 계산 파트는 먼저 회귀 테스트를 추가하고, 선형식 또는 공식 트리의 의미와 대상 조건을 확인한 뒤 지원 범위에 포함합니다.

관련 코드: `dev/scripts/data-pipeline/ability-simulation.ts`, `dev/scripts/data-pipeline/ability-simulation-formula.ts`, `dev/scripts/data-pipeline/ability-simulation-expression.ts`, `src/domain/game/abilitySimulationExpr.ts`.
