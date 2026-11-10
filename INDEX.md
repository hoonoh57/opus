# INDEX — opus 파일 목록

| 경로 | 역할 | 상태 |
|---|---|---|
| `AGENTS.md` | 헌법: 작업 철학, 절대 규칙, 기각된 작업 방식, 지식 누적 규칙 (공개 표준) | 유지 |
| `CLAUDE.md` | Claude Code 호환 진입점 (`@AGENTS.md`) | 유지 |
| `HANDOFF.md` | 프로젝트 상태: 목적, 확정 전제, 검증 방식, 현황, 다음 할 일 | 유지 |
| `INDEX.md` | 이 파일 | 유지 |
| `.gitignore` | 비밀정보, 산출물 커밋 차단 | 완료 |
| `.claude/skills/repo-sync/SKILL.md` | 저장소 반영 절차, 인코딩 함정, 반영 오류 장부 | 유지 (오류마다 누적) |
| `.claude/skills/design-first/SKILL.md` | 설계 절차, 자체 공격 점검표, 착수 판단, 가동 후 진단 | 유지 (결함마다 누적) |
| `docs/00_LAWS.md` | 4층 구조와 불변식 I1~I12 (시스템 설계 최상위 법칙) | 완료 |
| `docs/01_ORDER_FSM.md` | 주문 상태기계 v2.1 | 결함 수정 완료, TLC 검증 전 |
| `docs/02_SESSION_TOKEN_FSM.md` | 세션·토큰 상태기계 v1.1 | 결함 수정 완료, TLC 검증 전 |
| `docs/03_SUBSCRIPTION_MODE_FSM.md` | 구독·입장 게이트·모드 상태기계 v1 (모드 합성 규칙의 유일한 출처) | 작성됨, TLC 검증 전 |
| `docs/04_ENVIRONMENT_PREMORTEM.md` | 환경 모델 EV01~EV23, 사전 부검표 PM01~PM19, 추가 수용 시나리오 V01~V05 | 작성됨 |
| `docs/05_CONFIG_MEASURE.md` | 설정값 유일 목록(출처 등급 W/D/M/P), 측정 도구 안전 규칙 MT1~MT8, 실험 M01~M12 | 작성됨, 실측 전 |
| `measure/` | 측정 도구 (TypeScript/Node, 커널 아님). M01, M03, M04, M12 구현 | 작성됨, 실행 전 |
| `docs/06_OBSERVE_REPLAY.md` | 관측·재생 v1: 제어면 기록, 재현성 규칙 RP1~RP5, 로그 규칙 LG1~LG7, 실행 시점 검사, 진단 요약, 가짜 브로커 재생 | 작성됨 |
| `spec/Order.tla` | 주문 상태기계 TLA+ 명세 | 예정 |
| `spec/Order.cfg` | TLC 실행 설정 | 예정 |
| `spec/SessionToken.tla` | 세션·토큰 상태기계 TLA+ 명세 | 예정 |
| `spec/SubMode.tla` | 구독·게이트·모드 상태기계 TLA+ 명세 | 예정 |
