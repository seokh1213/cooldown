# Ollama System One 판정 모델 비교 (2026-10-01)

현재 도우미의 `PlanDeps.judge` 자리에 Ollama `/v1/systemone`을 넣어 같은 앱 경로로 측정했다. 앱 배포 코드는 바꾸지 않았다.

## 설정

- 별도 포트 `127.0.0.1:11435`의 Ollama 0.35.0. 설치된 Ollama.app 0.34.4는 바꾸지 않았다.
- Nimble `nimble:9b-q4_K_M`(5.6GB), Tev1 `tev1:0.8b`(812MB), 앱의 오프라인 판정기(0.83MB).
- `eval-b3.ts`: 갈래 374문항(세 언어), 흐름 60문항. 앱의 `understand`·`planAnswer`를 거친 결과를 잰다.
- `eval-a.ts`: 98개 대화, 총 270턴. 앞 턴의 앱 답을 상태에 넣고 최종 답의 갈래·챔피언·시점·주제를 채점한다.
- 두 평가 모두 Node 환경이라 검색 벡터는 끈다. 따라서 이 결과는 **판정기 비교**이고 문서 검색 대체 성능을 말하지 않는다.

## 결과

| 판정기 | 갈래·내 챔피언 | 흐름 판정기만 | 앱 흐름 | 대화 최종 답 |
|---|---:|---:|---:|---:|
| 오프라인 | 317/374 | 38/60 | 58/60 | 216/270 |
| Tev1 0.8B | 270/374 | 33/60 | 58/60 | 165/270 |
| Nimble 9B Q4 | 329/374 | 49/60 | 59/60 | 228/270 |

갈래 문항의 언어별 정답은 Nimble 한국어 103/124·영어 110/125·중국어 116/125, 오프라인은 각각 110/124·102/125·105/125였다. Nimble은 오프라인이 틀린 36문항을 고쳤지만 맞힌 24문항을 틀렸다. 갈래 오답 자체는 Nimble 43건, 오프라인 45건이고 차이는 주로 내 챔피언 선택에서 났다(2건 대 12건).

저장된 현행 0.8B 브라우저 판정기의 `a-results-app.json`은 240/270이다. 이 기록은 전날 실행한 것이므로 이번 실행과 엄밀한 동시 측정은 아니지만, 동일한 270턴 평가의 비교 기준이다.

오프라인 판정기는 룰베이스가 아니다. 같은 프로젝트 학습 자료의 정답 라벨로 다항 로지스틱 회귀를 학습하고, 문장의 글자 1~3개 묶음·낱말을 해시 특징으로 쓴다([학습 코드](../../../scripts/advisor/offline-classifier/train.py)). 별도의 챔피언 이름 인식·확실한 문형 규칙은 판정기 앞뒤에서 세 방식 모두에 공통으로 적용된다. 현행 0.8B는 Cooldown의 갈래·주제·대화 흐름 자료로 판정 LoRA와 헤드를 학습했다([실험 기록](../kev-agent/README.md)). Nimble·Tev1은 이 자료로 추가 학습하지 않은 범용 모델이다. 전용 학습이 현행 모델 우위의 유력한 원인이지만, 이 실험만으로 원인별 기여도를 분리할 수는 없다.

## 판단

Tev1 0.8B는 오프라인 판정기보다 낮아 교체할 이유가 없다. Nimble은 오프라인 대비 최종 답 12턴을 더 맞히지만, 현행 0.8B 기록보다 12턴 낮고 크기는 5.6GB다. 브라우저에 직접 싣기에는 비용이 크다.

현재 0.8B는 글 생성보다 **판정과 이름 없는 질문의 벡터 검색**에 쓰인다. 후자의 기존 실험은 355문항에서 벡터·낱말 결합 299개, 낱말만 212개 정답이었다([검색 평가](../vector-search/README.md)). 판정기만 남기고 0.8B를 제거하면 이 검색 이득을 잃는다. 실제 사용자 질문에서 검색이 얼마나 자주 필요한지 계측 자료는 없다. 다음 제품 실험은 오프라인 판정기를 기본으로 유지하면서, 더 작은 검색 모델이나 검색 자료 개선이 299/355에 접근하는지 따로 재는 것이다.

## 재현

Ollama 0.35 이상에서 해당 모델을 받은 뒤 실행한다. `JUDGE_MODEL`을 생략하면 기존 Jev 호환 실험의 `jeff-latest`를 쓴다.

```bash
JUDGE_MODEL=nimble:9b-q4_K_M npx tsx dev/scripts/advisor/kev-agent/eval-b3.ts --judges nimble=http://127.0.0.1:11434 --out dev/research/llm-evals/systemone/route-nimble.json
JUDGE_MODEL=nimble:9b-q4_K_M JUDGE_URL=http://127.0.0.1:11434 npx tsx dev/scripts/advisor/kev-agent/eval-a.ts --out dev/research/llm-evals/systemone/dialog-nimble.json
```

문항별 결과는 이 폴더의 `route-*.json`·`dialog-*.json`에 있다. 이번 실험에는 기본 Nimble Q8 판본 대신 Q4 판본을 썼다. 모델 정보: [Nimble](https://ollama.com/library/nimble:9b-q4_K_M), [Tev1](https://ollama.com/library/tev1).
