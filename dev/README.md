# 개발 자료

앱 실행 코드는 `../src`, 공개 배포 파일은 `../public`에 있다.
이 폴더에는 개발·문서·원본 데이터·검증 자료를 모은다.

```text
dev/
├── config/       # 빌드·검사 도구 설정
├── scripts/      # 데이터 생성, 검수, 평가, CI
├── tests/        # unit·data·e2e·fixtures
├── data/         # 사람이 관리하는 원본과 보정값
├── research/     # 조사·평가 입력과 검토 기록
├── docs/         # 설계·운영 문서와 이미지
├── assets/       # 제작에 사용하는 원본 이미지
├── hooks/        # Git pre-push 검증
└── artifacts/    # 빌드·미리보기·테스트 결과, Git 제외
```

[전체 폴더 기준과 읽는 순서](docs/project-structure.md)에서 시작한다.
지식 원본을 편집할 때는 [작성 지침](data/knowledge/README.md)을 읽는다.

모든 npm 명령은 저장소 루트에서 실행한다.
