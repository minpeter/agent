# Ralph Loop Iteration 1 - 상세 분석

**실행 시각**: 2026-01-09 20:09:45  
**커밋**: 30ed0b812ce6b4b2c6150b5be82a3f4bd7ac8959  
**벤치마크 설정**: k=1, n=11  
**모델**: Qwen/Qwen3-235B-A22B-Thinking-2507

## 전체 결과 요약

**성공률**: 70% (7/10)
- 성공: 7개 작업
- 실패: 3개 작업
- 에러: 1개 (AgentTimeoutError)

### 성공한 작업 (7개)
1. ✅ modernize-scientific-stack
2. ✅ pypi-server
3. ✅ multi-source-data-merger
4. ✅ configure-git-webserver
5. ✅ hf-model-inference
6. ✅ git-leak-recovery
7. ✅ nginx-request-logging

### 실패한 작업 (3개)
1. ❌ qemu-startup (AgentTimeoutError)
2. ❌ cancel-async-tasks (reward=0.0)
3. ❌ openssl-selfsigned-cert (reward=0.0)

---

## 실패 작업 상세 분석

### 1. cancel-async-tasks

**실패 테스트**: `test_tasks_cancel_above_max_concurrent`

**문제**:
```
assert stdout.count("Cleaned up.") == 2
AssertionError: assert 0 == 2
```

**시나리오**:
- 3개 작업, max_concurrent=2
- 500ms 후 SIGINT 전송
- 예상: 2개 작업 시작 → 2개 작업 cleanup 실행
- 실제: 2개 작업 시작 → 0개 cleanup 실행

**근본 원인**:
에이전트가 작성한 `run_tasks` 함수의 cancellation 처리 문제:

```python
async def run_tasks(tasks: List[Callable[[], Awaitable[None]]], max_concurrent: int) -> None:
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def worker(task):
        async with semaphore:
            await task()
    
    task_list = [asyncio.create_task(worker(t)) for t in tasks]
    await asyncio.gather(*task_list)
```

**문제점**:
1. `asyncio.gather`가 취소될 때, 모든 하위 작업을 즉시 취소
2. 취소된 작업의 `CancelledError`가 제대로 전파되지 않아 cleanup 코드 미실행
3. Semaphore context manager는 정상 작동하지만, 작업 내부의 cleanup은 실행 안 됨

**해결 방안**:
1. `asyncio.gather`에 `return_exceptions=True` 추가 (취소 예외를 수집)
2. 또는 `try/except CancelledError`로 명시적 처리
3. 각 worker가 cancellation을 gracefully handle하도록 수정

---

### 2. openssl-selfsigned-cert

**실패 테스트**:
1. `test_verification_file`
2. `test_python_verification_script`

#### 문제 1: verification.txt 생성 오류

**에이전트 실행 명령**:
```bash
echo 'Subject: $(openssl x509 -in /app/ssl/server.crt -subject -noout)' > /app/ssl/verification.txt
```

**실제 파일 내용**:
```
Subject: $(openssl x509 -in /app/ssl/server.crt -subject -noout)
Valid from: $(openssl x509 -in /app/ssl/server.crt -startdate -noout | cut -d= -f2)
...
```

**근본 원인**: 작은따옴표(`'`) 사용으로 변수 치환 비활성화
- 작은따옴표: 리터럴 문자열, `$(...)`가 실행되지 않음
- 큰따옴표 필요: `"$(command)"` 형식으로 명령 치환 활성화

**올바른 명령**:
```bash
echo "Subject: $(openssl x509 -in /app/ssl/server.crt -subject -noout)" > /app/ssl/verification.txt
```

#### 문제 2: check_cert.py CN 파싱 오류

**에이전트 작성 코드**:
```python
subject = subprocess.check_output([...]).strip()
cn = [part.split('=')[1] for part in subject.split('/') if 'CN=' in part][0]
```

**에러**: `list index out of range`

**근본 원인**:
- `subject` 출력 형식: `subject= /O=DevOps Team/CN=dev-internal.company.local`
- `subject.split('/')` 결과: `['subject= ', 'O=...', 'CN=...']`
- `'CN=' in 'subject= '`는 False이므로 빈 리스트
- `[0]` 접근 시 IndexError

**해결 방안**:
1. `subject` 문자열을 `=` 기준으로 먼저 split
2. 또는 정규표현식 사용: `re.search(r'CN=([^/]+)', subject)`

---

### 3. qemu-startup

**에러**: AgentTimeoutError (900초)

**문제**:
에이전트가 터미널 interactive state에 갇힘:
```
[ERROR] Cannot execute command - terminal is in interactive state
Current foreground process: sleep
```

**시퀀스**:
1. QEMU 시작 시도 (`qemu-system-x86_64 ...`)
2. QEMU 프로세스 실패 (Exit 1 또는 Stopped)
3. `until` 루프로 포트 대기 시작
4. 포트가 열리지 않아 무한 `sleep 0.5` 반복
5. 터미널이 foreground sleep 프로세스로 인해 block됨
6. 이후 모든 `shell_execute` 명령이 interactive state 에러로 실패
7. 900초 타임아웃

**근본 원인**:
1. 에이전트가 `shell_interact`를 사용해야 하는 상황에서 계속 `shell_execute`만 시도
2. QEMU 시작 실패의 근본 원인을 디버깅하지 않음 (stderr 로그 미확인)
3. 포트 대기 루프가 무한 루프로 빠짐

**QEMU 시작 실패 가능한 원인**:
- `-serial telnet::6665` 문법 오류 (호스트 지정 필요)
- Alpine ISO에 serial console 설정 누락
- 메모리 부족 (512M)
- KVM acceleration 불가 (컨테이너 환경)

**해결 방안**:
1. `shell_interact`로 Ctrl+C 전송하여 sleep 프로세스 종료
2. QEMU stderr 로그 (`/app/qemu.log`) 확인 후 디버깅
3. 포트 대기 루프에 타임아웃 추가
4. QEMU 명령 수정:
   ```bash
   qemu-system-x86_64 -m 1024 -cdrom /app/alpine.iso \
     -nographic \
     -serial telnet:127.0.0.1:6665,server,nowait \
     -append "console=ttyS0"
   ```

---

## 에이전트 행동 패턴 분석

### 강점
1. ✅ 대부분의 작업에서 합리적인 도구 선택
2. ✅ 파일 생성, 명령 실행 순서 논리적
3. ✅ 복잡한 작업 (Flask API, PyPI 서버 등) 성공적으로 완료

### 약점
1. ❌ **Interactive state 처리 부재**: `shell_interact` 사용법 미숙
2. ❌ **에러 디버깅 부족**: 실패 시 로그 확인 없이 반복 시도
3. ❌ **Edge case 간과**: asyncio cancellation, shell 따옴표 차이 등
4. ❌ **검증 미흡**: 작성한 코드의 실제 동작 테스트 없이 완료 보고

---

## CLI vs Headless 동작 차이 (추정)

**CLI 모드**:
- 사용자가 직접 interactive state에서 Ctrl+C 가능
- 에러 로그를 실시간으로 확인하고 수정 가능

**Headless 모드**:
- Interactive state에 갇히면 복구 불가 (timeout까지)
- 에러 로그가 파일에 저장되지만 에이전트가 읽지 않음

**개선 필요 사항**:
1. Headless에서도 `shell_interact` 자동 사용
2. 타임아웃 발생 시 자동 로그 수집 및 재시도
3. Background 프로세스 상태 모니터링

---

## 다음 단계 개선 계획

### 우선순위 1: cancel-async-tasks 수정
- [ ] `run_tasks` 함수에 cancellation handling 추가
- [ ] `asyncio.gather(return_exceptions=True)` 또는 try/except 추가
- [ ] Cleanup 코드가 반드시 실행되도록 보장

### 우선순위 2: openssl-selfsigned-cert 수정
- [ ] verification.txt 생성 시 큰따옴표 사용
- [ ] check_cert.py의 CN 파싱 로직 수정 (정규표현식 사용)
- [ ] 스크립트 실행 전 로컬 테스트

### 우선순위 3: qemu-startup 근본 원인 분석
- [ ] QEMU 로그 수집 및 분석
- [ ] QEMU 명령어 수정 (호스트, 메모리, append 옵션)
- [ ] Interactive state 탈출 로직 추가

---

## 실험 가능한 개선 사항

### 1. Tool Timeout 조정
- `shell_execute`에 더 짧은 timeout (60초)
- 실패 시 빠르게 다른 접근 시도

### 2. Reasoning Content 활용
- 모델의 thinking 과정에서 edge case 고려 여부 분석
- 불충분한 reasoning 시 추가 프롬프팅

### 3. 검증 단계 강화
- 작업 완료 후 간단한 smoke test 실행
- Verifier 통과 여부를 예측하는 self-check

---

## 통계

| 항목 | 값 |
|------|-----|
| 총 작업 수 | 10 |
| 성공 | 7 (70%) |
| 실패 (검증) | 2 (20%) |
| 실패 (타임아웃) | 1 (10%) |
| 평균 실행 시간 | ~169초 (성공 작업 기준) |
| 최장 실행 시간 | 900초 (qemu-startup 타임아웃) |
