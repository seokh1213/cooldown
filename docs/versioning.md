# 데이터 버전 규칙

League of Legends가 2025년부터 공식 패치 표기를 연도 기반으로 바꾸면서 같은
릴리스가 서로 다른 버전 문자열을 사용한다. 이 프로젝트는 세 값을 합치지 않고
역할별로 보존한다.

| 이름 | 현재 예시 | 용도 |
| --- | --- | --- |
| `patchVersion` | `26.17` | Riot 공식 패치, `public/data/{patchVersion}` 경로와 캐시 키 |
| `sources.ddragon` | `16.17.1` | Data Dragon API와 이미지 CDN |
| `sources.cdragon` | `16.17` | CommunityDragon 원본 데이터 경로 |

따라서 `26.17`과 `16.17`이 함께 보이는 것은 서로 다른 패치가 섞인 것이 아니다.
공식 패치 26.17을 Data Dragon은 16.17.1, CommunityDragon은 16.17 경로로
제공하는 상태다.

## 계약

- 공개 정적 JSON은 `schemaVersion`, `patchVersion`, `locale`, `sources`를 갖는다.
- 의미가 불분명한 최상위 `version`, `lang` 필드는 새 계약에서 사용하지 않는다.
- 함수 인자와 변수도 가능한 한 `patchVersion`, `ddragonVersion`,
  `cdragonVersion`, `locale`로 이름을 구분한다.
- 앱은 `public/data/version.json`을 유일한 런타임 버전 진입점으로 사용한다.
- 저장소는 요청한 패치/언어와 응답 메타데이터가 다르면 데이터를 거부한다.
- 생성기는 선택한 DDragon 릴리스에서 CDragon 버전을 한 번만 계산하고 모든
  CDragon 요청에 같은 `sources.cdragon`을 사용한다. 이전 패치나 `latest`로
  폴백하지 않으며 exact snapshot이 준비되지 않았으면 새 배포를 중단한다.
- 툴팁 검증 보고서의 DDragon fallback은 같은 릴리스의 설명 문자열 보완을
  뜻하며, 이전 CDragon 버전으로의 폴백을 뜻하지 않는다.

`schemaVersion`은 파일 형식의 버전이며 게임 패치 버전과 무관하다. 계약을 깨는
변경에서는 이 값만 올리고, 과거 형식을 런타임에서 호환하지 않는다.
