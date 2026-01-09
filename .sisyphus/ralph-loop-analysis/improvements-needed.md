# 개선 필요 사항

## 에이전트 능력 한계 발견

### 1. Asyncio Cancellation Handling 미숙
- 에이전트가 작성한 코드에서 cancellation handling 누락
- `asyncio.gather`의 동작 방식에 대한 이해 부족
- Cleanup 코드가 실행되도록 보장하는 패턴 미적용

**영향받는 작업**: cancel-async-tasks

### 2. Shell 따옴표 규칙 혼동
- 작은따옴표(`'`)와 큰따옴표(`"`)의 차이 이해 부족
- 명령 치환 `$(...)` 사용 시 큰따옴표 필요성 미인지

**영향받는 작업**: openssl-selfsigned-cert

### 3. Interactive Terminal State 처리 부재
- `shell_execute`와 `shell_interact`의 사용 시나리오 구분 부족
- Background 프로세스가 실패할 때 복구 전략 없음
- 에러 로그 확인 습관 부족

**영향받는 작업**: qemu-startup

## 시스템 수준 개선 불가

**현재 한계**:
- headless.ts는 단순 이벤트 로깅만 수행
- 에이전트의 추론 과정에 직접 개입 불가
- 모델의 capability가 핵심 요소

**가능한 접근**:
1. ✅ 더 많은 반복 실행으로 패턴 학습 (k 값 증가)
2. ✅ 실패한 작업을 다시 시도하여 일관성 테스트
3. ⚠️ 시스템 프롬프트 개선 (효과 제한적)
4. ❌ 코드 자동 수정 (scope 벗어남)

## 다음 실험 계획

### Iteration 2
- **k=2**, **n=6** (더 높은 pass rate 요구, 낮은 동시성)
- 실패한 3개 작업 집중 분석
- 성공률 향상 여부 확인

### Iteration 3 (필요시)
- **k=3**, **n=3** (목표 설정대로)
- 최종 검증
