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
| `measure/` | 측정 도구 (TypeScript/Node, 커널 아님). M01, M03, M04, M12, M13 구현 | M01·M03·M12·M13 실측 완료, M04 대기 |
| `start.cmd`, `stop.cmd` | 실험 콘솔 시작·종료 (사용자가 알아야 할 유일한 실행 방법) | 작성됨 |
| `measure/console/` | 실험 콘솔 (로컬 웹 UI, 127.0.0.1:3020). `steps.json`이 사용자 할 일의 유일한 출처. 포착 입력 탭: 붙여넣기 → 자동 정리 → 저장 위치·이름은 앱이 관리 | 작성됨 |
| `measure/results/ledger.jsonl` | 실험 결과 공유 장부 (콘솔이 실행마다 자동 커밋, AI가 읽음) | 누적 |
| `docs/07_STRATEGY_LAB.md` | 전략 실험실 v1: 당일·기간·구간 분석, 체결·비용 모델, 수익률 KPI와 버전업 규칙, 개선과제 축적 | 작성됨 |
| `lab/` | 전략 버전, 사례, 실행 기록, 개선과제, 결정 (커밋 대상) | 기준전략_V1 고정, 나머지 L02부터 |
| `lab/strategies/B0/v1.json` | 기준전략_V1 (frozen, 07 12장 형식) | 완료 |
| `lab/champion.json` | 현재 챔피언 (유일 출처) | B0/v1 |
| `lab/captures/` | 포착 종목 원본 `capture_YYYYMMDD.csv` (일자,시각,종목코드,종목명,포착가,MFE,조건식). MFE는 평가 전용 라벨(미래 데이터, 전략 수식에서 읽기 금지). 포착 입력 탭 저장 시 자동 커밋, 모든 사례의 유일한 입력 | 누적 |
| `measure/src/lab/` | 수식 엔진: formula.ts(전용 파서), indicators.ts(supertrend·jma는 kiwoom-desk 이식), engine.ts(체결 모델 FM1~FM5) | 작성됨, L03 검사 전 |
| `docs/06_OBSERVE_REPLAY.md` | 관측·재생 v1: 제어면 기록, 재현성 규칙 RP1~RP5, 로그 규칙 LG1~LG7, 실행 시점 검사, 진단 요약, 가짜 브로커 재생 | 작성됨 |
| `spec/Order.tla` | 주문 상태기계 TLA+ 명세 | 예정 |
| `spec/Order.cfg` | TLC 실행 설정 | 예정 |
| `spec/SessionToken.tla` | 세션·토큰 상태기계 TLA+ 명세 | 예정 |
| `spec/SubMode.tla` | 구독·게이트·모드 상태기계 TLA+ 명세 | 예정 |
