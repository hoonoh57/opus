# INDEX — opus 파일 목록

| 경로 | 역할 | 상태 |
|---|---|---|
| `HANDOFF.md` | 세션 인수인계, 작업 철학, 확정 전제, 다음 할 일 | 유지 |
| `INDEX.md` | 이 파일. 전체 파일과 역할 | 유지 |
| `.gitignore` | 비밀정보, 산출물 커밋 차단 | 완료 |
| `docs/00_LAWS.md` | 4층 구조와 불변식 I1~I12 (최상위 법칙) | 완료 |
| `docs/01_ORDER_FSM.md` | 주문 상태기계 v2: 전이표, 저널, 고아 버퍼, 매칭 규칙 O1~O7, 수용 시나리오 | 작성됨, 결함 수정·TLC 검증 전 |
| `docs/02_SESSION_TOKEN_FSM.md` | 세션·토큰 상태기계 | 작성됨, 결함 수정·TLC 검증 전 |
| `docs/03_SUBSCRIPTION_MODE_FSM.md` | 구독·유량 게이트·모드 상태기계 | 예정 |
| `docs/04_ENVIRONMENT_PREMORTEM.md` | 환경 모델, 사전 부검표 | 예정 |
| `docs/05_CONFIG_MEASURE.md` | 설정값 실측 계획 | 예정 |
| `docs/06_OBSERVE_REPLAY.md` | 관측 자료(저널·로그) 형식과 사고 재현용 재생 장치 | 예정 |
| `spec/Order.tla` | 주문 상태기계 TLA+ 명세 | 예정 |
| `spec/Order.cfg` | TLC 실행 설정 | 예정 |
| `spec/SessionToken.tla` | 세션·토큰 상태기계 TLA+ 명세 | 예정 |

## 문서 우선순위

1. `HANDOFF.md` 1-1장 작업 철학 (작업 방식의 최상위 방침)
2. `docs/00_LAWS.md` (시스템 설계의 최상위 법칙)
3. 상태기계 문서(01~03)
4. 나머지 문서
