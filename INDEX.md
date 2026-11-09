# INDEX — opus 파일 목록

| 경로 | 역할 | 상태 |
|---|---|---|
| `HANDOFF.md` | 세션 인수인계, 확정 전제, 다음 할 일 | 유지 |
| `INDEX.md` | 이 파일. 전체 파일과 역할 | 유지 |
| `.gitignore` | 비밀정보, 산출물 커밋 차단 | 완료 |
| `docs/00_LAWS.md` | 4층 구조와 불변식 I1~I12 (최상위 법칙) | 완료 |
| `docs/01_ORDER_FSM.md` | 주문 상태기계 v2: 전이표, 저널, 고아 버퍼, 매칭 규칙 O1~O7, 수용 시나리오 | 완료, TLC 검증 전 |
| `docs/02_SESSION_TOKEN_FSM.md` | 세션·토큰 상태기계 | 완료, TLC 검증 전 |
| `docs/03_SUBSCRIPTION_MODE_FSM.md` | 구독·모드 상태기계 | 예정 |
| `docs/04_ENVIRONMENT_PREMORTEM.md` | 환경 모델, 사전 부검표 | 예정 |
| `docs/05_CONFIG_MEASURE.md` | 설정값 실측 계획 | 예정 |
| `spec/Order.tla` | 주문 상태기계 TLA+ 명세 | 예정 |
| `spec/Order.cfg` | TLC 실행 설정 | 예정 |
| `spec/SessionToken.tla` | 세션·토큰 상태기계 TLA+ 명세 | 예정 |

## 문서 우선순위

문서끼리 충돌하면 `00_LAWS.md`가 우선한다. 그다음은 상태기계 문서(01~03), 그다음이 나머지다.
