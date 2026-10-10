# Wukong에서 Colab 실험 실행

Wukong Kubernetes Job이 Colab CLI 인증·세션 유지·작업 실행·결과 다운로드를 맡는다. 로컬 컴퓨터가 꺼져도 실행은 계속된다. GPU 계산은 Colab VM에서 실행하며, Kubernetes Pod에는 GPU를 요구하지 않는다.

현행 포함 비교군은 6개다. 우선순위는 현행 기준값 → 판정 헤드·확신도 → 검색 hard negative → 답 포함 여부·근거 추출 → 생성 SFT → 양자화 대응이다. DPO와 후보 조합은 이 비교 후 별도 실험으로 둔다.

- `pack_snapshot.py`: 작업 트리의 코드·데이터·모델을 해시와 함께 고정한다. 실행 캐시와 인증 파일은 제외한다.
- `colab_controller.py`: 서버에서 T4를 생성하고 q4 그래프 호환성을 확인한 뒤 결과를 PVC에 저장하고 GPU를 반납한다.
- `colab_smoke.py`: 세 언어 12문항의 실행 시간과 실제 ONNX provider를 확인한다. 정확도 평가와 구분한다.
- `run.py`: 필요할 때 사용할 CPU 기준값 평가기다. Colab 연결 확인 단계에서는 대량 CPU 평가를 시작하지 않는다.
- `kubernetes.yaml`: 결과 페이지·저장 공간·Tailscale 전용 Ingress를 만든다.
- `colab-job.yaml`: Colab을 제어하는 Job이다. Google 인증은 별도 Secret에 두며 페이지 Pod에 마운트하지 않는다.

`__RUN__`을 스냅샷 실행 이름으로 치환하고 `linux/amd64` 이미지를 MicroK8s에 import한 뒤 적용한다. `colab-oauth` Secret에는 `client.json`과 `token.json` 키를 파일로 등록한다. 인증 값은 YAML·Git·로그에 넣지 않는다. 갱신된 인증과 세션 상태는 별도 PVC에 보관한다.

초기 Job은 연결·GPU 호환성 시험만 한다. 후보 모델 학습과 현행 대비 정확도 비교가 완료된 것으로 표시하지 않는다. 서버의 CUDA 추론 시간으로 브라우저 WebGPU 지연을 판단하지 않는다.
