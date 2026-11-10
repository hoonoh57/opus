# measure — 설정값 실측 도구 (docs/05)

커널이 아니다. docs/05 3장 MT1~MT8을 구조로 지킨다. 결과는 실험마다 한 줄이며, 사용자는 그 줄만 채팅에 붙인다.

## 준비 (1회)

    cd E:\opus-git\measure
    node --version            (v20 이상)
    npm install
    Copy-Item env.example.txt .env
    notepad .env              (모의 키 입력. .env는 커밋되지 않는다)

## 실행 전 확인

- 같은 앱키를 쓰는 프로그램(kiwoom-desk 등)을 모두 종료한다 (MT5).
- 측정 도구는 동시에 1개만 실행된다 (잠금 파일).

## 실험 (순서대로, 실험 사이 1분 이상)

    npm run -s m01 -- --env mock
    npm run -s m03 -- --env mock
    npm run -s m12
    npm run -s m04 -- --env mock

- M04는 평일 08:00~15:40(KST)에는 실행을 거부한다. 기본 30초마다 1회/s씩 올리고 최대 10회/s, 첫 거절에서 멈춘다. 옵션: `--tr quote|chart`, `--step 30`, `--max 10`.
- 실전 계좌는 M01만 허용하며 `--env real --confirm REAL`이 필요하다.

## 기록

- `lab-data/measure/<날짜>/<실험>-<환경>-<시각>.jsonl` (커밋되지 않음). 토큰·앱키는 기록하지 않고, 계좌번호는 뒤 4자리만 남긴다.
- 출력 줄의 `\uXXXX`는 한글 메시지를 ASCII로 바꾼 것이다 (PowerShell 5.1 콘솔 깨짐 방지).
