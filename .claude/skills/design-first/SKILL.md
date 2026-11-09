---
name: repo-sync
description: opus 저장소에 파일을 반영하는 검증된 절차, 금지 방법, PowerShell 안전 틀(opus-safe), 인코딩·인용부호·백업·로그 함정, 반영 오류 장부. 파일 교체본을 줄 때, 스크립트를 출력하려 할 때, 인코딩이나 커밋 문제가 생겼을 때 반드시 사용한다.
---

# repo-sync

## 1. 검증된 절차: GitHub 웹 편집기 (기본 방법)

1. 기존 파일 교체: 파일 열기 → 연필 아이콘 → 편집창 클릭 → Ctrl+A → Delete → 교체본 붙여넣기 → Commit changes.
2. 새 파일: Add file → Create new file → 경로 입력. `/`가 있으면 폴더가 자동 생성된다(`.claude/...` 포함).
3. 삭제: 파일 열기 → 오른쪽 위 ⋯ → Delete file → Commit changes.
4. AI 출력 형식: 파일마다 "경로 + 전체 교체본". 바깥 코드블록은 백틱 4개.
5. 한 번에 2개 파일 이하. 사용자가 승인한 구조 개편만 예외.
6. 사용자가 "덮어썼다"고 하면 다시 읽어 검증하지 않는다.
7. 커밋 직후 raw 주소는 캐시 때문에 몇 분간 옛 내용을 보여줄 수 있다.
8. GitHub 웹 커밋 이력이 곧 백업이다. 잘못되면 History에서 이전 버전을 복사해 되돌린다.

## 2. 절대 금지

| 방법 | 이유 (오류 장부 번호) |
|---|---|
| "찾아서 끼워 넣기" 부분 수정 지시 | 위치를 찾지 못함 (E01) |
| PowerShell `-replace`, 정규식, 줄 단위 치환으로 문서 수정 | 줄바꿈·인코딩 차이로 한글 전체가 깨져 복원 불가 (E05) |
| 큰따옴표 문자열이나 큰따옴표 here-string에 문서 내용 담기 | `$`, 백틱, 따옴표가 해석되어 형식이 깨지고 일부만 반영됨 (E06) |
| 백업 없이 수정 | 성공한 로직을 훼손하고 복원에 실패해 프로젝트 폐기 (E07) |
| 진행 로그를 전부 출력 | 실패 원인이 긴 로그에 묻혀 전달 불가 (E08) |
| opus-safe 틀이 아닌 스크립트 | 위 원칙을 세션 후반에 잊고 회귀함 (E09) |
| Claude Code 에이전트, API 종량제 | 한도 소진, 요금 예측 불가 |

## 3. PowerShell 안전 틀 opus-safe v1 (상태: 시험 대기)

`AGENTS.md` 5장에서 스크립트 자동 반영은 아직 기각 상태다. 이 틀은 사용자가 시험을 승인하면 파일 1개로 시험하고, 성공하면 5장 장부에 기록한 뒤 "검증됨"으로 바꾼다.

### 3-1. 규칙

- AI는 이 틀을 글자 그대로 복사하고 `$Commit`과 `$Files` 부분만 채운다. 다른 줄은 고치지 않는다.
- 사용자는 첫 줄이 `# opus-safe v1`이 아니면 실행하지 않는다.
- 문서 내용은 작은따옴표 here-string(`@'` ... `'@`)에만 넣는다.
- AI는 넘기기 전에 확인한다: 문서 내용 중 줄 맨 앞이 `'@`인 줄이 없다. 있으면 그 파일은 웹 편집기로 반영한다.
- 항상 파일 전체를 쓴다. 부분 치환 코드는 넣지 않는다.
- 콘솔 출력은 성공 시 `OK` 한 줄, 실패 시 `FAIL` 한 줄과 복원 명령 한 줄뿐이다. 사용자는 그 줄만 채팅에 붙인다.
- 권장 환경: PowerShell 7(`pwsh`) + Windows Terminal. 5.1에서도 동작하도록 만들었지만 이 환경에서는 미검증.

### 3-2. 틀

```powershell
# opus-safe v1
$ErrorActionPreference = 'Stop'
$U8 = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding  = $U8
[Console]::OutputEncoding = $U8
$OutputEncoding = $U8
$Repo = 'C:\opus'

function G {
  $ErrorActionPreference = 'Continue'
  $o = (& git @args 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    if ($o.Length -gt 300) { $o = $o.Substring($o.Length - 300) }
    throw ("git " + ($args -join ' ') + " 실패: " + $o)
  }
  return $o
}

$Commit = '여기에 커밋 메시지'
$Files = [ordered]@{}
$Files['경로/파일명.md'] = @'
여기에 파일 전체 내용
'@

$Base = $null
try {
  Set-Location $Repo
  if (G status --porcelain) { throw '커밋되지 않은 변경이 있음. 실행 중단(원본 보호)' }
  G pull --ff-only -q | Out-Null
  $Base = G rev-parse --short HEAD
  foreach ($p in $Files.Keys) {
    if ($p -match '(^|[\\/])(\.git|\.env)' -or $p -match '\.\.') { throw "금지 경로: $p" }
    $full = Join-Path $Repo $p
    $dir = Split-Path $full -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $text = $Files[$p] -replace "`r`n", "`n"
    if (-not $text.EndsWith("`n")) { $text += "`n" }
    [System.IO.File]::WriteAllText($full, $text, $U8)
    $back = [System.IO.File]::ReadAllText($full, $U8)
    if ($back -ne $text) { throw "쓰기 검증 실패: $p" }
    if ($back.IndexOf([char]0xFFFD) -ge 0) { throw "깨진 문자 발견: $p" }
  }
  G add -A | Out-Null
  G commit -q -m $Commit | Out-Null
  G push -q | Out-Null
  Write-Host ("OK " + $Base + " -> " + (G rev-parse --short HEAD) + " 파일 " + $Files.Count + "개")
}
catch {
  Write-Host ("FAIL " + $_.Exception.Message)
  if ($Base) { Write-Host ("복원: cd " + $Repo + "; git reset --hard " + $Base) }
}
```

### 3-3. 틀이 막는 것

| 장치 | 막는 오류 |
|---|---|
| 콘솔 입출력 UTF-8 설정 | E02 콘솔 출력 깨짐 |
| 다시 읽어 비교, 깨진 문자(U+FFFD) 검사 | E03 문서 인코딩 |
| 전체 쓰기, LF 통일, UTF-8(BOM 없음) | E05 부분 교체 붕괴 |
| 작은따옴표 here-string | E06 인용부호 |
| 미커밋 변경 시 거부, 시작 커밋 = 백업, 복원 명령 출력 | E07 백업 망각 |
| `-q`, 결과 한 줄, git 오류는 마지막 300자만 | E08 긴 로그 |
| 첫 줄 표식, AI는 빈칸만 채움 | E09 원칙 망각 |
| git 오류는 종료 코드로만 판정 | E10 PowerShell 5.1이 git의 정상 stderr 출력을 오류로 오인 |

## 4. 알려진 함정 (일반 지식, 이 환경에서는 미검증)

| 함정 | 증상 | 피하는 법 |
|---|---|---|
| PowerShell 5.1의 `>`, `Out-File`, `Set-Content` | UTF-16·CP949로 저장되어 한글이 깨짐 | `[IO.File]::WriteAllText(경로, 내용, UTF8 BOM 없음)` |
| PowerShell 5.1이 BOM 없는 UTF-8 `.ps1`을 ANSI로 읽음 | 스크립트 파일 안의 한글이 깨짐 | `.ps1` 파일 대신 붙여넣기 또는 PowerShell 7 사용 |
| here-string 끝 표시 | `'@`가 줄 맨 앞이 아니면 문법 오류 | 끝 표시는 줄 맨 앞 |
| Python `open()` 인코딩 미지정 | Windows 기본값 CP949로 깨짐 | `encoding="utf-8"` 항상 명시 |
| Git `core.autocrlf` | 모든 줄이 변경된 것으로 표시됨 | `.gitattributes`에 `* text=auto eol=lf` |
| 채팅 코드블록 중첩 | 문서 안의 ``` 때문에 바깥 블록이 끊김 | 바깥 블록은 백틱 4개 |

## 5. 오류 장부

형식: 번호 / 증상 / 원인 / 대책 / 상태. "사용자 경험"은 과거 세션에서 실제로 발생한 오류다.

| 번호 | 증상 | 원인 | 대책 | 상태 |
|---|---|---|---|---|
| E01 | 부분 수정 위치를 사용자가 찾지 못함 | "찾아서 끼워 넣기" 지시 | 전체 교체본 | 해결 (2026-11-09) |
| E02 | PowerShell 콘솔 출력이 깨져 성공·실패를 확인할 수 없음 | 콘솔 인코딩 미설정 | 틀 첫머리 UTF-8 설정 | 사용자 경험, 틀 시험 대기 |
| E03 | 작성된 문서의 한글 인코딩 깨짐 | 저장 인코딩 미지정 | UTF-8(BOM 없음) 쓰기 + 재독 검사 | 사용자 경험, 틀 시험 대기 |
| E04 | 사용자가 덮어썼다는데 AI가 검증 읽기 제안 | 토큰 낭비 규칙 없음 | 1장 6번 | 해결 (2026-11-09) |
| E05 | 부분 교체로 한글 전체가 깨지고 문서 복원 불가 | 줄바꿈 기호 등 언어 간 차이로 일괄 치환 | 부분 치환 금지, 전체 쓰기, LF 통일 | 사용자 경험, 틀 시험 대기 |
| E06 | 인용부호가 맞지 않아 형식이 깨지고 일부만 반영, 에러-수정 여러 번 반복 | 큰따옴표 문자열 사용, 내용 속 특수문자 | 작은따옴표 here-string, `'@` 사전 점검 | 사용자 경험, 틀 시험 대기 |
| E07 | 백업 없이 수정해 성공한 로직 훼손, 복원 실패로 프로젝트 폐기 | 긴 대화에서 백업 원칙 망각 | 미커밋 변경 시 실행 거부, 시작 커밋 기록, 복원 명령 출력 | 사용자 경험, 틀 시험 대기 |
| E08 | 긴 로그 때문에 실패 원인 전달 불가 | 모든 진행 상황 출력 | OK·FAIL 한 줄 출력 | 사용자 경험, 틀 시험 대기 |
| E09 | 진행이 길어지면 원칙을 잊고 같은 삽질로 회귀 | 원칙이 AI 기억에만 있음 | 원칙을 틀에 내장, 첫 줄 표식으로 사용자가 거름 | 사용자 경험, 틀 시험 대기 |
| E10 | (예방) git 정상 출력이 오류로 처리됨 | PowerShell 5.1의 stderr 처리 | 종료 코드로 판정 | 미검증 |
