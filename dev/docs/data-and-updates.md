# 데이터 버전과 PWA 갱신

코드와 보관 파일을 확인한 기준일은 2026-10-06이다. 게임 패치, 원본 판본,
앱 릴리스의 버전을 구분하여 같은 패치의 데이터 수정도 새 릴리스로 배포한다.

## 패치와 데이터 계약

| 필드 | 보관 중인 예시 | 용도 |
| --- | --- | --- |
| `patchVersion` | `26.19` | 공식 패치 표기, 데이터 경로와 캐시 키 |
| `sources.ddragon` | `16.19.1` | Data Dragon API와 이미지 CDN |
| `sources.cdragon` | `16.19` | CommunityDragon 원본 경로 |

Data Dragon의 major가 15 이상이면 공식 패치 major에 10을 더한다.
따라서 `15.1.1`은 `25.1`, `16.19.1`은 `26.19`이며, `14.24.1`은 `14.24`다.
CDragon 판본은 DDragon의 major와 minor를 유지한다. 이 변환은
[`staticDataRelease.ts`](../../src/domain/game/static-data/staticDataRelease.ts)에 모았다.

정규화된 챔피언·아이템·룬·소환사 주문·프로필 JSON은 `schemaVersion: 2`,
`patchVersion`, `locale`, `sources`를 갖는다. 지원 언어는 `ko_KR`, `en_US`, `zh_CN`이다.
게임 매니페스트 `public/data/version.json`에는 언어가 없고, 선택한 패치와 원본 판본을 기록한다.
PWA의 `release.json`과 패치 기록 JSON은 각각 별도 계약의 `schemaVersion: 1`을 사용한다.
형식 버전과 게임 패치는 독립적이다. 새 데이터 계약에는 모호한 `version`, `lang` 대신
역할이 드러나는 필드 이름을 쓰며, 기존 형식의 지원 여부는 해당 디코더에서 결정한다.

앱은 게임 데이터의 정체성을 `version.json`에서 읽고, 새 앱 릴리스는 `release.json`으로 확인한다.
저장소는 스키마·패치·언어·DDragon/CDragon 판본과 요청한 챔피언 ID를 검증한다.
같은 키의 동시 요청은 합치고, 실패한 요청은 재시도할 수 있도록 정리한다.
손상된 메모리·세션 캐시는 제거한 뒤 다시 받는다. HTTP 응답도 검증한 후 캐시에 저장한다.

## 생성과 보존

```bash
npm run generate-static-data
npm run llm:carry
npm run generate-thumbnails
```

생성기는 선택한 DDragon 릴리스에서 CDragon 판본을 한 번 계산한다.
필요한 원본은 그 판본에서만 받고, 이전 패치나 `latest`로 폴백하지 않는다.
필수 원본이 없거나 검증이 실패하면 새 정적 데이터를 발행하지 않는다.
툴팁의 DDragon fallback은 같은 릴리스의 설명 보완이다.
과거 설명을 찾는 연구 도구는 [과거 패치 소급](patch-fallback.md)에서 별도로 다룬다.
조사 결과는 `dev/data/ability-research/<조사 패치>/`에 두며 게임의 `public/data`와 분리한다.
전체 최신 결과, `partial/<챔피언 범위>/`의 부분 조사, 각각의 `history/<파일명 stem>/` 이력을 구분한다.
로더는 요청 패치와 파일 내부 패치가 같을 때만 전체 결과를 읽는다.

다운로드한 데이터는 임시 폴더에서 조립·검증한 뒤 패치 폴더를 교체하고,
`version.json`을 마지막에 교체한다. 동일 패치를 다시 만들 때도 이 순서를 따른다.
다운로드·검증·발행 실패에서는 기존 데이터와 매니페스트를 보존하거나 복원한다.
파일시스템 오류로 복원까지 실패하면 기존 파일의 백업을 임시 폴더에 남긴다.
성공한 뒤에만 이전 숫자 패치 폴더를 정리하며, 다른 데이터 디렉터리는 삭제하지 않는다.

기존 `llm/` 자료는 생성 중 보존한다. 패치가 바뀌면 `llm:carry`가 새 정적 데이터로
파생 자료를 다시 만든다. 소급 조사는 배포 데이터와 분리하여 `dev/data/ability-research/<patch>/`에 둔다.
폴더는 조사 기준 패치이고, 복구 본문·소실 문장의 과거 패치는 각 결과 안에 기록한다.
생성기와 `llm:source-pack`은 같은 조사 경로를 사용하며 파일 내부 `patchVersion`이 다르면 거부한다.
현재 패치의 조사 파일이 없으면 과거 조사를 대신 사용하지 않는다.

썸네일은 이미지 폴더와 `spriteSheets.ts`·`assetVersion.ts`를 임시 공간에 완성한 뒤 교체한다.
색인 발행이 실패하면 이미지도 복원한다. 이전 숫자 이미지 판본 폴더는 성공 후에 정리한다.
이미지와 색인은 같은 생성 결과로 배포해야 한다.

`version.json`의 선택적 `cdragonBuild`는 같은 패치의 CDragon 재출력을 감지하는 표식이다.
표식 조회 실패는 필수 원본 실패와 구분한다. 표식이 없거나 조회에 실패하면 CI는 다음 확인을
건너뛰지 않고 전체 생성을 실행한다.

## 앱 릴리스와 캐시

### 파일을 나누는 기준

```text
public/data/version.json                       # 현재 공식 패치와 원본 판본
public/data/<patch>/champions/<locale>/<ID>.json
public/data/<patch>/champion-profiles/<locale>/<ID>.json
public/data/<patch>/llm/                       # 해당 패치의 도우미 배포 자료
dev/data/ability-research/<patch>/                 # 조사 기준 패치별 소급 기록, 비배포
dev/data/patch-notes/                              # 패치별 원본·snapshot·검토 기록, 비배포
dev/artifacts/dist/data/releases/<dataVersion>/<patch>/      # 내용 해시로 고정한 배포 사본
```

공식 패치·DDragon/CDragon 원본 판본·앱 내용 해시는 역할이 다르다.
표시 패치를 임의로 최신 번호로 고쳐 붙이거나 과거 조사 파일을 새 패치 폴더에 복사하지 않는다.

챔피언 상세·프로필·내 챔피언별 상성은 필요한 언어·ID만 받는다.
전부 합치면 사용하지 않는 자료도 다운로드·파싱해야 하고 손상된 자료의 재요청 범위가 커진다.
`advisor-knowledge.json`은 도우미가 함께 쓰는 지식의 배포용 묶음이다.
편집용 `dev/data/knowledge/`와 기초 문서는 생성 입력이므로 번들이 있어도 유지한다.

빌드는 `public/data`를 기본 주소와 해시 릴리스 주소에 모두 복사하며 CI가 두 사본을 검증한다.
앱은 해시 주소를 읽는다. 두 사본의 디스크 용량을 사용자 다운로드 두 배로 해석하지 않는다.
기본 주소에는 개발·스크립트·기존 링크 소비자가 있어 배포 사본 제거는 별도 검토가 필요하다.

전체 데이터 내용이 릴리스 해시를 결정하므로 파일 하나의 변경도 새 주소를 만든다.
파일 분리 자체가 릴리스 사이의 무변경 자료 다운로드를 자동으로 절약하는 것은 아니다.
분리의 현재 이점은 미사용 자료를 받지 않고, 같은 릴리스의 손상 응답만 다시 요청하는 데 있다.
[자료 검토](../research/reviews/karpathy-antislop-2026-10-06/SOURCE-DUPLICATION.md)에 용량 비교를 기록한다.

### 릴리스 주소와 검증

빌드는 소스·정적 에셋의 `appVersion`, 데이터 경로와 내용의 `dataVersion`,
둘을 묶은 `releaseId`를 만든다. 세 값은 32자리 소문자 16진수 해시이며,
같은 게임 패치의 설명 수정도 데이터 내용이 바뀌면 새 `dataVersion`이 된다.
빌드가 해시한 데이터 스냅샷과 실제 발행한 바이트가 같도록 함께 보관한다.

앱 데이터는 `dev/data/releases/<dataVersion>/...` 주소에 고정한다.
`public/data` 원본 경로는 기존 링크를 위해 유지하고, 세션 캐시도 `releaseId`별로 분리한다.
판본별 데이터는 `CacheFirst`로 보관한다. 현재 설정은 최대 1,200개 응답, 60일이다.
손상된 응답은 해당 주소만 버리고 재시도하며, 다른 경로의 오프라인 데이터는 유지한다.

브라우저는 진입·탭 복귀·온라인 복귀와 60초 주기마다 `release.json`을 `no-store`로 확인한다.
오프라인이거나 숨겨진 탭에서는 확인을 진행하지 않는다. 릴리스 확인 요청의 제한은 5초이고,
다음 릴리스의 개별 데이터 요청 제한은 10초다.

새 워커를 활성화하기 전에 다음 릴리스의 매니페스트와 필요한 데이터를 검증·준비한다.
현재 탭에서 요청한 경로와 다른 열린 탭이 캐시해 둔 데이터 경로도 포함한다.
패치가 바뀌면 새 패치 경로로 준비한다. 챔피언·프로필·아이템·룬·소환사 주문 데이터는
스키마·언어·원본 판본·챔피언 ID를 검사한다. 다른 종류의 자료는 각 자료를 읽는 쪽에서 검증한다.

## 갱신 시점

자동 갱신이 켜져 있고 기존 서비스 워커가 제어하는 온라인 진입에서만,
앱은 본문을 가린 채 최대 3초 동안 새 릴리스를 준비한다. 준비가 끝나면 현재 URL로 갱신한다.
첫 방문·오프라인·자동 갱신을 끈 진입은 이 확인을 기다리지 않는다.

3초 안에 준비되지 않으면 기존 화면을 연다. 이후 준비된 업데이트와 이용 중 발견한 업데이트는
다음 진입까지 대기한다. 탭 복귀·온라인 복귀·주기 확인 자체는 현재 화면을 새로고침하지 않는다.
자동 갱신이 꺼져 있으면 안내에서 승인할 때 적용한다.
한 탭이 워커를 전환하면 다른 열린 탭도 새 워커에 맞춰 현재 URL로 갱신한다.

오프라인·설치 실패·데이터 준비 실패에서는 현재 앱과 캐시를 유지하고 다음 확인에서 재시도한다.
사용자 선택·설정과 다른 앱의 저장소를 초기화하지 않는다.
저장된 테마가 없으면 시스템 테마를 사용하며, 최초 배경색은 앱 JS·CSS 로딩 전부터 적용한다.
이전 세대 PWA도 기존 `sw.js` 주소에서 갱신한다.

## 배포와 검증

빌드 산출물 전체를 함께 배포한다. `release.json`이나 `sw.js`만 먼저 교체하면
새 워커와 데이터 준비가 실패할 수 있다. `npm run dev`는 HMR을 사용하며 새 PWA를 등록하지 않는다.
사용자 로컬 미리보기의 기본 포트는 4173, 브라우저 회귀 검사의 기본 포트는 4180이다.

CI는 UTC 매시 17분에 upstream을 확인한다. 예약 실행은 DDragon 판본이나 CDragon 빌드 표식이
바뀌었거나 확인할 수 없을 때 생성한다. `master` push와 수동 실행은 전체 흐름을 수행한다.
정적 데이터 생성, 패치 기록 생성, 도우미 자료 이월, 썸네일 생성, 검증·빌드·브라우저 검사 후
GitHub Pages 산출물을 배포한다. 패치 기록과 보관 정책은 [패치 변경 내역](patch-notes.md)을 따른다.

현재 검증 경계는 다음 파일에 있다.

- [`pwa-startup-gate.test.ts`](../tests/unit/app/pwa-startup-gate.test.ts): 3초 제한, 조기 해제, 갱신 직전 본문 유지.
- [`production-data-cache.test.ts`](../tests/unit/app/production-data-cache.test.ts): 잘못된 데이터 거부, CacheFirst 재시도, 기존 오프라인 데이터 보존.
- [`static-data-publication.test.ts`](../tests/unit/data-pipeline/static-data-publication.test.ts)와 [`thumbnail-publication.test.ts`](../tests/unit/data-pipeline/thumbnail-publication.test.ts): 다운로드·검증·발행 실패와 동일 판본 재생성의 보존·복원.
- [`pwa-updates.spec.ts`](../tests/e2e/app/pwa-updates.spec.ts): 실제 빌드 A/B/C 교체, 진입·이용 중 갱신, 수동 승인·복수 탭·오프라인·실패 재시도·최초 테마.
