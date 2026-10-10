# 종료한 EmbeddingGemma 2 검색 실험

2026-10-08 사용자의 결정으로 Gemma 실험을 종료했다. 채택 모델은 기존 Qwen이며 웨이트·배포 인덱스·제품 코드를 바꾸지 않았다. `llm:train:gemma`와 `llm:test:embeddinggemma` npm 명령은 제거했다.

Gemma 모델·어댑터·optimizer/RNG 체크포인트와 실험 캐시는 삭제했다. 저장소의 선택 어댑터 사본도 제거했다. 이전 보고서의 보존 목록과 재현 명령은 당시 기록이다. 로컬 백업으로 같은 학습 상태를 재개하거나 같은 벡터를 재생하는 절차는 이제 사용할 수 없다.

질문 은행 `retrieval-v2`, 데이터 분할 검사, 공통 검색·임계값 평가, Colab 백업·복구 검사는 유지한다. 이 폴더의 코드는 실험 방법과 비교 절차를 남기기 위한 연구 기록이며 자동 학습을 시작하지 않는다. 가벼운 검사는 아래처럼 계속 실행된다.

```sh
python3 -m unittest discover -s dev/scripts/advisor/gemma-retrieval -p 'test_*.py'
```

Torch·ONNX를 쓰는 수치 진단 테스트는 `dev/scripts/advisor/tuning/test_gemma_*.py`에 있으며 기존 `infrastructure`·`quality` 검사에서 실행된다.

[최종 정리와 선택 후속 과제](../../../research/llm-evals/workflow/reports/gemma-retirement-20261008/README.md), [원인 분석](../../../research/llm-evals/workflow/reports/gemma-diagnosis-20261008/README.md), [학습 결과](../../../research/llm-evals/workflow/reports/gemma-tuning-20261008/README.md)를 참고한다. 삭제 전 소스와 선택 어댑터는 Git 커밋 `9c5c07a84`의 이력에 있다. 저장소 이력은 다시 쓰지 않았다.
