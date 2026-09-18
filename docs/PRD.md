# ClassKeys PRD — Direct OpenRouter Key Edition

## 1. 문서 정보

| 항목 | 내용 |
| --- | --- |
| 상태 | Draft — 직접 키 구조 |
| 제품명 | ClassKeys |
| 목적 | 수업 구성원과 조에 OpenRouter API 키, 예산, 모델 정책을 발급·관리한다. |
| 인프라 | Cloudflare Workers, D1, Cron, OpenRouter Workspace. OCI와 추론 프록시는 사용하지 않는다. |

이전 프록시 설계는 [legacy/proxy-PRD.md](../legacy/proxy-PRD.md)에 보관한다.

## 2. 제품 원칙

1. 학생은 **OpenRouter 키를 직접** 사용한다. ClassKeys는 추론 요청·프롬프트·응답을 경유하거나 저장하지 않는다.
2. ClassKeys는 학생·조·키 해시·정책·사용량·감사 이력의 정본을 D1에 보관한다.
3. 모든 OpenRouter 키의 하드캡과 일/주/월 경계는 UTC 기준이다.
4. 학생 또는 조에 키가 재발급되어도, 같은 UTC 기간의 사용액은 해당 학생 또는 조에 계속 귀속된다.
5. OpenRouter Workspace가 수업 전체의 모델 제한과 lifetime 상위 예산을 강제한다.
6. 평문 키는 발급 화면에서 한 번만 표시한다. 이후 ClassKeys는 키의 해시와 앞부분 일부만 보관·표시한다.

## 3. 사용자와 권한

| 역할 | 권한 |
| --- | --- |
| 일반 사용자 | 본인 개인 키와 본인 조의 키/사용량/히트맵 조회, 본인 키 재발급 요청 |
| 관리자 | 학생·조·조원 편성, 키 발급·폐기·재발급, 주체별 정책, 사용량·감사 조회 |
| Master | 관리자 계정 관리, 수업 전체 캡, OpenRouter Workspace 연결, 모델 정책, 비상 운영 |

사용자는 사전 발급한 ID·임시 비밀번호로 로그인한다. 로그인 계정은 학번에 연결하며, 최초 로그인 시 비밀번호 변경을 요구한다. 비밀번호는 단방향 해시로만 저장한다.

## 4. 핵심 도메인

### 학생과 조

- 학생: 학번(고유), 이름, 반, 지도교수, 상태, 로그인 계정
- 조: 이름, 반, 지도교수, 상태
- 조원 편성: 학생·조·유효 시작/종료 시각
- 학생과 조는 삭제 대신 비활성화한다. 과거 편성과 사용량은 보존한다.

`data/members.tsv`의 67명은 첫 D1 migration에서 시드한다. 이 파일은 정적 자산으로 제공하지 않으며, 이후 데이터 정본은 D1이다.

### 주체와 키

| 주체 | 키 | 비용 귀속 |
| --- | --- | --- |
| 학생 | 개인 OpenRouter 키 | 해당 학생 |
| 조 | 조 범위 OpenRouter 키 | 해당 조 |

개인 키 사용액은 학생 정책에, 조 키 사용액은 조 정책에만 차감한다. 조원 변경 뒤에도 과거 비용은 당시 조에 남는다.

**조 키 배포 방식은 구현 전 확정한다.** 기본 권장은 조원마다 서로 다른 조 범위 키를 발급해 같은 조 정책에 연결하는 방식이다. 하나의 공유 조 키는 키 유출 시 조 전체 키를 교체해야 하고, 사용자를 구분할 수 없다.

## 5. 기능 요구사항

### FR-1. 학생·조 관리

- 관리자는 학생 추가, 수정, 비활성화, TSV/CSV 일괄 가져오기를 할 수 있다.
- 관리자는 조 생성, 이름 변경, 비활성화와 조원 추가·제거·이동을 할 수 있다.
- 변경 전 검증 결과와 변경 후 감사 이력을 제공한다.

### FR-2. OpenRouter 키 수명주기

- 관리자는 개인 또는 조 범위 OpenRouter 키를 일괄 발급할 수 있다.
- 키 이름에는 학기·주체·학번 또는 조 식별자를 포함한다.
- 평문 키는 생성 응답에서 한 번만 화면에 표시하고 CSV로 즉시 내보낼 수 있다.
- 관리자는 키를 즉시 disable 또는 delete할 수 있다.
- 재발급 시 기존 키를 먼저 disable하고, 최신 사용량을 D1에 동기화한 뒤 새 키를 발급한다.
- 학생은 본인에게 허용된 키의 상태·만료일·마지막 사용·사용량만 볼 수 있다.

### FR-3. 학생·조 정책과 재발급 한도 승계

정책은 학생 또는 조에 부여하며, USD 한도와 일별·주별·월별 reset을 포함한다.

재발급 시에는 다음 규칙을 적용한다.

1. 현재 UTC 기간의 해당 학생 또는 조 총 사용액을 계산한다.
2. `남은 한도 = 정책 한도 - 현재 기간 사용액`을 계산한다. 음수면 0으로 처리한다.
3. 새 OpenRouter 키에는 남은 한도를 limit으로 설정한다.
4. 기존 키는 새 키가 발급되기 전에 disable한다.
5. 다음 UTC 기간 시작 뒤 Cloudflare Cron이 활성 키의 limit을 원래 정책 한도로 복구한다.

OpenRouter 키의 일/주/월 하드캡은 ClassKeys가 설정한 limit으로 직접 강제한다. D1은 키의 사용량 스냅샷, 정책 기간, 재발급 전후의 승계 계산을 기록한다.

### FR-4. 수업 전체 예산

- Master는 OpenRouter 잔액보다 작거나 같은 수업 전체 lifetime USD 캡을 지정한다.
- 수업용 OpenRouter Workspace의 `lifetime` budget에 같은 값을 설정한다.
- Workspace budget이 수업의 모든 개인·조 키 사용액을 합산해 상위 차단선으로 동작한다.
- 학생·조 키의 한도 합계는 전체 캡보다 커질 수 있으나, 실제 수업 지출은 Workspace budget을 넘을 수 없도록 한다.
- 경고 임계값을 설정하고, 캡 근접·도달 상태를 관리자 화면에 표시한다.

OpenRouter Workspace lifetime budget은 Enterprise 플랜 기능이다. 또한 OpenRouter는 이미 provider로 전달된 in-flight 요청 때문에 예산을 소폭 초과할 수 있다고 명시한다. 따라서 “한 푼도 초과 불가”가 계약상 절대 조건이면 직접 키 방식만으로 충족할 수 없다.

### FR-5. 모델·provider 정책

- Master 또는 관리자는 허용 모델 allowlist를 설정한다.
- 고성능 프론티어 모델은 기본 비허용으로 둔다.
- 필요할 때 provider allowlist를 추가한다.
- 수업 Workspace 기본 Guardrail에 동일한 모델/provider 제한을 적용한다.
- 관리자 화면은 모델 목록, 가격, 지원 상태를 갱신하고 더 이상 사용 불가한 정책 항목을 표시한다.

### FR-6. 사용량 동기화와 히트맵

- Cloudflare Cron은 OpenRouter Management API의 키 사용량과 Activity API를 주기적으로 동기화한다.
- D1에는 키별 사용량 스냅샷, 주체별 UTC 일 단위 비용·요청 수·토큰 집계를 저장한다.
- 동기화 지연 또는 실패 시 마지막 성공 시각과 데이터 상태를 표시한다.
- 히트맵은 일별·주별·월별 집계를 전환할 수 있다.
- 지표는 실제 비용(USD), 요청 수, 총 토큰 수를 지원한다.
- 관리자·Master는 전체, 반, 조, 학생, 모델, provider로 필터링한다.
- 학생은 본인 개인과 현재 소속 조의 사용량만 조회한다.
- 각 셀은 비용 강도를 색으로 표현하고, 선택 시 비용·요청 수·토큰 수·주요 모델을 보여 준다.

### FR-7. 감사와 보안

- 키 발급, 재발급, disable, delete, 학생·조·정책·권한 변경을 감사 이력에 남긴다.
- D1과 Worker 로그에는 평문 OpenRouter 키, 프롬프트, 응답, Authorization 헤더를 저장하지 않는다.
- OpenRouter 관리 키는 Worker Secret으로만 저장하고, 학생에게 절대 노출하지 않는다.
- 운영 화면은 HTTPS만 허용한다.

## 6. 아키텍처

```text
학생 IDE ── 개인/조 OpenRouter 키 ──> OpenRouter Workspace

학생/관리자 브라우저 ──> Cloudflare Worker + Static Assets ──> D1
                                      └─> OpenRouter Management API
Cloudflare Cron ───────────────────────> OpenRouter 사용량 동기화
```

| 구성요소 | 책임 |
| --- | --- |
| Workers Static Assets | 학생·관리자 웹 화면 제공 |
| Cloudflare Worker | 로그인, 역할 인가, 명단·조·정책·키 관리 API |
| D1 | 명단, 편성 이력, 계정, 키 해시, 정책, 사용량 집계, 감사 이력 |
| Cron Trigger | UTC 경계의 키 limit 복구, OpenRouter 사용량 동기화, 경고 평가 |
| Worker Secret | OpenRouter 관리 키 |
| OpenRouter Workspace | 실제 추론, 키별 limit, 모델/provider Guardrail, lifetime budget |

ClassKeys는 OpenRouter 추론 경로에 없으므로, 학생 프롬프트와 응답이 Cloudflare Worker를 통과하지 않는다.

## 7. 수용 기준

- 관리자가 TSV 명단을 시드한 뒤 학생과 조를 생성·편성·비활성화할 수 있다.
- 학생은 자신의 개인 키와 자신에게 허용된 조 키 이외의 키·사용량을 볼 수 없다.
- 개인 또는 조 키가 limit에 도달하면 OpenRouter가 후속 요청을 거절한다.
- 학생이 이번 UTC 주에 `$1`를 쓴 뒤 `$5` 정책으로 재발급되면 새 키 limit은 `$4`다.
- 다음 UTC 주 시작 뒤 활성 키 limit은 정책값 `$5`로 복구된다.
- 허용되지 않은 모델 요청은 Workspace Guardrail에서 차단된다.
- 수업 전체 lifetime budget 근접·도달 상황이 대시보드와 히트맵에 반영된다.
- 일반 사용자는 다른 학생·조·관리자 설정에 접근할 수 없다.
- ClassKeys 데이터 저장소와 로그에 프롬프트·응답·평문 키가 남지 않는다.

## 8. 구현 순서

1. Cloudflare Worker/D1 프로젝트와 migration, `members.tsv` 시드 구성
2. 로그인·역할·학생·조·편성 API와 화면 구현
3. OpenRouter Workspace 연결, 키 일괄 발급·폐기·재발급 구현
4. UTC 사용량 동기화와 재발급 잔여 한도 계산 구현
5. Cron 기반 period reset·경고 구현
6. 사용량 히트맵과 운영 대시보드 구현
7. staging 배포, OpenRouter 실제 키 테스트, 운영 배포

## 9. 외부 준비 사항

- OpenRouter Organization 및 수업 전용 Workspace
- Workspace lifetime budget 사용 가능 여부(Enterprise 플랜)
- OpenRouter Management API key
- Cloudflare 계정과 Worker/D1 권한
- 수업 전체 lifetime cap, 학생/조의 일·주·월 정책, 허용 모델 목록

## 10. 참고 자료

- [OpenRouter API key limits](https://openrouter.ai/docs/api/api-reference/api-keys/create-a-new-api-key)
- [OpenRouter Management API keys](https://openrouter.ai/docs/guides/overview/auth/management-api-keys)
- [OpenRouter Activity API](https://openrouter.ai/docs/api/api-reference/analytics/get-user-activity)
- [OpenRouter Workspace budgets](https://openrouter.ai/docs/guides/features/workspaces/workspace-budgets)
- [OpenRouter Guardrails](https://openrouter.ai/docs/guides/features/guardrails/overview)
