## 스킬 툴팁 파서 개요

이 모듈은 **Data Dragon 스킬 데이터(`ChampionSpell`)**와  
**Community Dragon 스킬 데이터(`CommunityDragonSpellData`)**를 조합해서
최종적으로 **HTML 툴팁 문자열**을 만들어 주는 레이어입니다.

- **입력**
  - Riot Data Dragon의 `ChampionSpell` (기본 툴팁/레벨별 수치)
  - Community Dragon의 `DataValues`, `mSpellCalculations`, `effectBurn` 등 (정확한 수식/계수 정보)
  - 원본 툴팁 텍스트(tooltip/description), 언어 코드(`ko_KR`, `en_US` 등)
- **출력**
  - HTML로 변환된 툴팁: 색상/강조가 들어간 텍스트 + `{{ 변수 }}`가 모두 실제 수치로 치환된 상태

외부에서는 보통 다음 경로를 사용합니다.

```ts
import {
  parseSpellTooltip,
  parseSpellDescription,
  formatLeveltipStats,
} from "@/lib/spellTooltipParser";
```

내부 구현은 `src/lib/spellTooltipParser/` 디렉터리 아래로 모듈화되어 있습니다.

---

## 주요 진입점

- **`parseSpellTooltip(text, spell, communityDragonData?, lang?)`**
  - 실제 스킬 **툴팁(tooltip)**에 사용되는 파서
  - XML 태그 → HTML 변환, `{{ 변수 }}` 치환, HTML 정리까지 전체 파이프라인 수행

- **`parseSpellDescription(text, spell, lang?)`**
  - 간단한 **description 필드** 전용
  - XML 태그 변환 + 변수 치환까지만 수행 (sanitize나 `<br />` 변환은 안 함)

- **`formatLeveltipStats(spell, communityDragonData?, lang?)`**
  - 인게임에서 스킬 툴팁 하단에 나오는 **레벨별 상승 수치**(Leveltip) 부분만 따로 포맷팅
  - 예: `피해량: [50/75/100/125/150]`

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

이 단계는 **변수 치환 전에 먼저** 수행됩니다.  
이유는 XML 태그 내부의 `{{ 변수 }}`도 그대로 유지하면서, HTML 구조만 바꾸기 위함입니다.

관련 코드: `xmlTagConverter.ts`

---

### 2. `{{ 변수 }}` 치환 (`replaceVariables` / `replaceVariable`)

`parseSpellTooltip`의 핵심 단계입니다.

```ts
result = replaceVariables(result, spell, communityDragonData, lang);
```

#### 2-1. 사전 정리 (문자/패턴 정제)

`replaceVariables`는 치환 전에 텍스트를 한 번 정제합니다.

- **연산자 주변 공백 보정**
  - `"{{ calc_damage_1_max }}+Max Health"` → `"{{ calc_damage_1_max }} + Max Health"`
  - `"50~100"` → `"50 ~ 100"`
- **중첩된 변수 패턴 제거**
  - `{{ something {{ inner }} something }}` 같은 구조는 복잡해서 **통째로 제거**
  - 주로 게임 모드별 추가 툴팁 등, 여기서 처리하지 않는 패턴
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

1. **`effectBurn` 기반 `eN` 변수** (`replaceEffectBurn`)
2. **Community Dragon `DataValues`** (`replaceData`)
3. **Community Dragon `mSpellCalculations`** (`replaceCalculateData`)

못 찾으면 `null`을 반환하고, 최종적으로 그 변수는 **빈 문자열로 제거**됩니다.

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
   - DataValues는 **0번 인덱스 버퍼**를 두고 1~maxRank까지 값이 들어있기 때문에 slice(1…) 후 사용
   - 모든 레벨 값이 같으면 스칼라, 다르면 벡터로 유지
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
  - `mPrecision` 해석값 (0 이상이면 유효, 표시 자릿수 힌트)

### 3) GameCalculation 특수 케이스

`GameCalculation` 안에서 **특정 패턴**은 별도로 처리합니다.

- **브레이크포인트 단순 범위 (`ByCharLevelBreakpointsCalculationPart` + `mSimpleTooltipCalculationDisplay === 6`)**
  - 예: `(12 ~ 8)` 같은 형태
  - 1레벨 값 + 각 브레이크포인트의 `mAdditionalBonusAtThisLevel`를 누적해서 최종값 계산

- **챔피언 레벨당 선형 증가 퍼센트 (`ByCharLevelBreakpointsCalculationPart` + `mDisplayAsPercent === true`)**
  - 예: 1레벨 40% ~ 16레벨 100% → `(40% ~ 100%)`
  - `mLevel1Value`, `mInitialBonusPerLevel`, 첫 브레이크포인트의 `mLevel`로 마지막 레벨 값 계산

- **선형 보간 퍼센트 범위 (`ByCharLevelInterpolationCalculationPart` + `mDisplayAsPercent === true`)**
  - 예: `mStartValue=0.8`, `mEndValue=0.95` → 나중에 ×100을 거쳐 `(80% ~ 95%)`

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
  - 1레벨 값 + 브레이크포인트 누적 → base에 더함

- **`ProductOfSubPartsCalculationPart`**
  - `mPart1 × mPart2` 형태의 곱
  - 내부 서브 파트는 현재
    - `NamedDataValueCalculationPart`
    - `NumberCalculationPart`
    - `EffectValueCalculationPart`
    만 지원, 나머지는 로그만 남기고 0 처리

### 5) multiplier, 퍼센트, 정밀도 반영

1. **multiplier (`mMultiplier`)**
   - `DataValue` 또는 `Number`를 가져와 base와 모든 stat ratio에 곱함
2. **퍼센트 처리 (`mDisplayAsPercent`)**
   - `isPercent === true`인 경우 base를 ×100
   - `precision`이 있으면 단순 *100만 하고, 실제 반올림/표시는 포맷터에 위임
3. **정밀도(`mPrecision`) 해석**
   - 0 이상인 경우만 유효
   - 내부적으로 +1 해서 실제 표시 자릿수로 사용 (예: `mPrecision=1` → 소수 둘째 자리까지)

### 6) 최종 문자열 조립

1. **baseStr 만들기**
   - 0이면 생략
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

관련 코드: `spellCalculationHandler.ts`, `valueUtils.ts`, `formatters.ts`, `types.ts`

---

## 3. Leveltip 수치 포맷팅 (`formatLeveltipStats`)

인게임 툴팁 하단의 **레벨별 증가 수치**를 표시하는 로직입니다.

- 입력: `ChampionSpell.leveltip.label` / `leveltip.effect`
  - label: `"피해량"`, `"둔화율"` 등
  - effect: `"{{ e1 }}"`, `"{{ armorshredpercent*100 }}"` 등
- 출력 예:
  - `"피해량: [50/75/100/125/150]<br />쿨다운: [10/9/8/7/6]"`

동작 순서:

1. label/effect 페어를 순회하면서 effect에서 **첫 번째 `{{ ... }}` 변수**를 추출
2. **우선 Community Dragon `DataValues` 기반**으로 해석
   - `parseExpression` → `replaceData`
   - label이 `%`, `"percent"`, `"퍼센트"`, `"둔화"` 등을 포함하면 퍼센트로 판단하고 `%` 자동 붙임
3. 실패 시 **Data Dragon 기반 폴백**
   - `eN` → `spell.effectBurn[N]`
   - `"cost"` 포함 → `spell.costBurn`
   - `"cooldown"` 포함 → `spell.cooldownBurn`
   - `"ammorechargetime"` 등 → CDragon `mAmmoRechargeTime` DataValues 지원
4. 값 문자열을 `formatLevelValues`로 정리
   - `"0"`/빈 값 제거, 레벨 수만큼 자르기, 슬래시 조인
5. label의 `@AbilityResourceName@`를 실제 자원 이름으로 치환
6. 최종적으로 `"Label: [value]"` 포맷으로 쌓아서 `<br />`로 합침

관련 코드: `leveltipFormatter.ts`

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

### `formatLevelValues`

- Community Dragon 배열에서 **0번 인덱스(버퍼)**는 자동으로 건너뜀 (옵션)
- 최대 레벨까지만 사용 (`spell.maxrank`)
- 모든 값이 같으면 한 개만 출력, 다르면 `"1/2/3"` 형식으로 출력

관련 코드: `formatters.ts`, `valueUtils.ts`, `variableReplacer.ts`

---

## 5. 나머지 유틸들

### XML 태그 맵 (`XML_TAG_MAP`)

`magicDamage`, `physicalDamage`, `trueDamage` 등 XML 태그를
Tailwind 색상 클래스를 가진 `<span>` 태그로 매핑합니다.

필요 시 여기서 **색상/강조 스타일을 추가/수정**하면 됩니다.  
관련 코드: `xmlTagConverter.ts`

### 중복 퍼센트 패턴 제거 (`removeDuplicatePercentPatterns`)

`textCleaner.ts`에 정의된 유틸로,

- `"50/60/70%"` 바로 뒤에 `"0.5/0.6/0.7"` 같은 **동일 의미의 소수 표현**이 또 나올 때
- 소수 표현만 제거하는 기능입니다.

현재 메인 파이프라인에서는 **사용되지 않고 있으므로**,  
필요하다면 `replaceVariables` 이후 단계에서 호출하는 것을 고려할 수 있습니다.

---

## 6. 실제 데이터 예시 – 크산테 W (`KSanteW`)

이 섹션의 예시는 `public/data/version.json` 및  
`public/data/15.24.1` 디렉터리에 저장된 **크산테 W 스킬 데이터**를 기준으로 합니다.  
작성 시점 기준 버전은 **DDragon 15.24.1 / CDragon 15.23**입니다.

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
      - 방어력/마저 계수(`StatByCoefficientCalculationPart`)를 조합해  
      최종 `"기본 피해 + (방어 계수/마법 저항력 계수)"` 형태 문자열로 치환됩니다.
  - `{{ totalmaxhealthdamage }}`  
    - 최대 체력 비례 피해 비율을 DataValues/계산식에서 읽어와  
      `"최대 체력의 12%에 해당하는 피해"` 같은 형태의 숫자 + `%`로 표현됩니다.
  - `{{ rdamageincreasemin*100 }}`, `{{ rdamageincreasemax*100 }}`  
    - 총공세(R 상태)에서 추가로 들어가는 피해 비율을  
      최소~최대 범위(`0.3 ~ 0.5` 등)에 대해 각각 `*100` 적용 후  
      `"30~50"` → `"30~50%"` 형태로 치환합니다.

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

`formatLeveltipStats`는 위 leveltip 정보를 이용해 다음과 같이 처리합니다.

1. 세 번째 label/effect 쌍에서 `effectPattern = "{{ cost }} -> {{ costNL }}"`에서 `cost`를 추출합니다.
2. `spell.costBurn`(`"40/45/50/55/60"`)을 `formatLevelValues`로 포맷합니다.
   - `"40/45/50/55/60"` → 레벨별 소모값 문자열 그대로 유지
3. label에 포함된 `@AbilityResourceName@`는 `getAbilityResourceName(spell, lang)`을 통해  
   실제 자원 이름(예: `"마나"`, `"기력"`, 특수 자원 문자열 등)으로 치환됩니다.
4. 최종 레벨팁 라인은 다음과 같은 형식이 됩니다.
   - `"소모값 마나: [40/45/50/55/60]"`

동일한 규칙으로 첫 번째/두 번째 라인도

- `{{ basedamage }} -> {{ basedamageNL }}`  
  → 피해량 레벨별 증가값
- `{{ cooldown }} -> {{ cooldownNL }}`  
  → 재사용 대기시간 레벨별 변화

를 각각 포맷하여 `"피해량: [...]"`, `"재사용 대기시간: [...]"` 형식으로 출력합니다.

