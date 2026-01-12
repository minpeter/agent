# Ralph Loop Iteration 2 - K-Pass 분석

**실행 시각**: 2026-01-09 20:29:29  
**커밋**: 60c3d7d  
**벤치마크 설정**: **k=2**, **n=8**  
**모델**: Qwen/Qwen3-235B-A22B-Thinking-2507

## 전체 결과 요약

**성공률**: 55% (11/20)
- 20 trials (10개 작업 × 2회)
- 성공: 11
- 실패: 9
- 에러 (AgentTimeoutError): 3

**비교**:
- Iter1 (k=1): 70% 성공률
- **Iter2 (k=2): 55% 성공률** ⚠️ 일관성 하락

---

## K-Pass 2 분석

### ✅ K-Pass 2 달성 (3/10 작업 = 30%)

| # | 작업 | Run 1 | Run 2 | 비고 |
|---|------|-------|-------|------|
| 1 | **modernize-scientific-stack** | ✅ YFyQvb3 | ✅ dfqgJYy | 안정적 |
| 2 | **multi-source-data-merger** | ✅ XEihdhQ | ✅ 95S8bWa | 안정적 |
| 3 | **hf-model-inference** | ✅ 2EfQ3vU | ✅ SRiBs2d | 안정적 |

**특징**: 이 3개 작업은 Iter1에서도 성공했으며, **고도로 일관된 성능**을 보임

---

### ❌ K-Pass 2 실패 (7/10 작업 = 70%)

#### 1) 불안정한 작업 (1/2 성공, non-deterministic)

| 작업 | Run 1 | Run 2 | 패턴 |
|------|-------|-------|------|
| **configure-git-webserver** | ✅ Wvjw56L | ❌ 2LS5iyr | 첫 성공, 두 번째 실패 |
| **git-leak-recovery** | ✅ YosGqVT | ❌ Q6o8mwB | 첫 성공, 두 번째 실패 |
| **pypi-server** | ✅ z4QAP8o | ❌ y92Kft2 | 첫 성공, 두 번째 실패 |
| **nginx-request-logging** | ❌ gbkXVqT | ✅ 5gVAc8v | 첫 실패, 두 번째 성공 |
| **cancel-async-tasks** | ❌ FppcYGa | ✅ AVH8wkM | 첫 실패, 두 번째 성공 |

**발견사항**:
- 5개 작업이 **1/2 성공** → 50% 일관성
- **Non-deterministic behavior**: 같은 작업이 다른 결과 생성
- 원인 추정:
  - 모델의 확률적 생성 (temperature > 0)
  - 타이밍 이슈 (경쟁 조건, 타임아웃)
  - 환경 차이 (Docker 컨테이너 상태)

#### 2) 일관되게 실패하는 작업 (0/2 성공)

| 작업 | Run 1 | Run 2 | 실패 유형 |
|------|-------|-------|-----------|
| **openssl-selfsigned-cert** | ❌ CnswbHt (reward=0) | ❌ heB3t3q (timeout) | 검증 실패 + 타임아웃 |
| **qemu-startup** | ❌ LqcfBUi (timeout) | ❌ pBBYjDj (timeout) | 일관된 타임아웃 |

**openssl-selfsigned-cert**:
- Run 1: verifier 검증 실패 (Iter1과 동일한 문제)
- Run 2: **타임아웃 발생** ⚠️ 새로운 문제
  - Iter1에서는 84초 만에 완료
  - Iter2 Run 2에서는 900초 타임아웃
  - **추정 원인**: 에이전트가 수정을 시도하다가 무한 루프에 빠짐

**qemu-startup**:
- Run 1, Run 2 모두 900초 타임아웃
- **일관성 있는 실패** → 근본적인 접근 방식 문제
- 터미널 interactive state에 갇히는 패턴 반복

---

## 심각한 문제: 일관성 저하

### Iter1 → Iter2 비교

| 작업 | Iter1 (k=1) | Iter2 (k=2) | K-Pass 2 |
|------|-------------|-------------|----------|
| modernize-scientific-stack | ✅ | ✅✅ | ✅ |
| multi-source-data-merger | ✅ | ✅✅ | ✅ |
| hf-model-inference | ✅ | ✅✅ | ✅ |
| configure-git-webserver | ✅ | ✅❌ | ❌ |
| git-leak-recovery | ✅ | ✅❌ | ❌ |
| pypi-server | ✅ | ✅❌ | ❌ |
| nginx-request-logging | ✅ | ❌✅ | ❌ |
| cancel-async-tasks | ❌ | ❌✅ | ❌ |
| openssl-selfsigned-cert | ❌ | ❌❌ | ❌ |
| qemu-startup | ❌ (timeout) | ❌❌ (timeout×2) | ❌ |

**발견**:
- Iter1에서 성공한 7개 작업 중 **4개가 Iter2에서 실패**
- **일관성 문제**: 첫 성공이 두 번째 성공을 보장하지 않음

---

## 타임아웃 패턴 분석

### Iter1 타임아웃 (1개)
- qemu-startup__H9dqRKF (900초)

### Iter2 타임아웃 (3개)
- qemu-startup__LqcfBUi (900초)
- qemu-startup__pBBYjDj (900초)
- openssl-selfsigned-cert__heB3t3q (900초) ⚠️ 새로운 타임아웃

**타임아웃 증가 이유 (추정)**:
1. **동시성 증가** (n=8): 더 많은 컨테이너가 동시 실행 → 리소스 경쟁
2. **에이전트의 재시도 로직**: 실패 시 무한 재시도 → 타임아웃까지 계속
3. **컨테이너 간섭**: 포트 충돌, 파일 시스템 경쟁

---

## Non-Determinism의 근본 원인

### 1. 모델의 확률적 생성
- Temperature > 0 → 같은 프롬프트에 다른 출력
- Sampling randomness → 도구 호출 순서나 인자 변화

### 2. 환경 요인
- Docker 컨테이너 초기화 시간 차이
- 네트워크 latency 변동
- 파일 시스템 캐시 상태

### 3. 에이전트 행동 패턴
- 에러 발생 시 재시도 전략 차이
- 타이밍에 민감한 작업 (background 프로세스 대기)
- Interactive state 진입 여부

---

## K-Pass 3 달성 가능성 예측

### 현재 K-Pass 2 달성률: 30% (3/10)

**K-Pass 3 예측**:
- 3개의 안정적 작업: **높은 확률** (80-90%)
- 5개의 불안정 작업: **낮은 확률** (25-40%)
  - 3번 모두 성공 필요 → 0.5^3 = 12.5% (이론적)
- 2개의 일관 실패 작업: **매우 낮은 확률** (<5%)

**종합 예측**: K-Pass 3 달성률 **10-20%** (1-2개 작업)

---

## 실험 가능한 개선 방안

### 1. 동시성 감소
- **n=3** (현재 8)으로 줄여 컨테이너 간 간섭 최소화
- 타임아웃 발생률 감소 예상

### 2. Temperature 감소
- 모델의 randomness 줄이기
- 더 일관된 출력 생성
- 하지만 **temperature는 Harbor 레벨에서 설정 불가** (모델 provider 설정)

### 3. 타임아웃 증가
- 900초 → 1800초로 증가
- 에이전트에게 더 많은 재시도 기회
- 하지만 **잘못된 방향으로 계속 시도하는 문제는 해결 안 됨**

### 4. 작업별 맞춤 프롬프팅 (실험적)
- 실패한 작업에 대한 specific hint 제공
- 하지만 **일반화 불가** (다른 작업에는 적용 불가)

---

## 다음 단계

### 옵션 A: K=3 강행 (권장하지 않음)
- 현재 상태로 k=3 실행
- 예상 결과: **0-2개 작업만 통과**
- 시간 낭비 가능성 높음

### 옵션 B: 개선 후 재시도 (권장)
1. **동시성 감소**: n=3으로 설정
2. **K=2 재실행**: 일관성 개선 여부 확인
3. 결과에 따라 K=3 진행 여부 결정

### 옵션 C: 실패 작업 집중 분석
1. pypi-server, configure-git-webserver, git-leak-recovery 실패 원인 심층 분석
2. 로그 비교 (성공 vs 실패)
3. 패턴 발견 시 코드 개선

---

## 통계 요약

| 메트릭 | Iter1 (k=1) | Iter2 (k=2) | 변화 |
|--------|-------------|-------------|------|
| 총 trials | 10 | 20 | +100% |
| 성공률 | 70% | 55% | **-15%p** ⚠️ |
| 타임아웃 | 1 (10%) | 3 (15%) | +5%p |
| K-Pass 달성 | N/A | 3/10 (30%) | - |
| 일관 실패 작업 | 3 | 2 | -1 |

**결론**: K-Pass 요구사항 증가 시 **성능 저하 및 불안정성 증가**
