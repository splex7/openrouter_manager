# ClassKeys

수업용 OpenRouter 직접 키를 발급·통제하는 Cloudflare Workers + D1 애플리케이션입니다. 학생의 프롬프트와 응답은 이 앱을 거치지 않고 OpenRouter로 직접 전송됩니다.

현재 구현된 기반 기능은 다음과 같습니다.

- D1 기반 학생 67명, 조 18개, 현행 편성 시드
- 사전 발급 계정용 데이터 모델과 학생·관리자·Master 역할
- 1회성 비밀 토큰을 통한 첫 Master 계정 생성
- HttpOnly 세션 로그인과 비밀번호 변경
- 로그인 화면, 학생 명단, 조 생성·조원 편성 관리 대시보드
- OpenRouter 개인·조 키 발급, 암호화 저장, 조회·재발급·폐기

제품 요구사항과 직접 키 운영 원칙은 [PRD](docs/PRD.md)에 정리되어 있습니다. 과거 프록시 설계는 [legacy/proxy-PRD.md](legacy/proxy-PRD.md)에 보관합니다.

## 로컬 실행

```bash
npm install
npx wrangler d1 migrations apply classkeys --local
npx wrangler dev --local
```

## 운영 전 준비

배포 전 Worker secret으로 아래 값을 설정합니다. 비밀값은 저장소·D1·로그에 넣지 않습니다.

```bash
npx wrangler secret put SETUP_TOKEN
npx wrangler secret put OPENROUTER_MANAGEMENT_KEY
npx wrangler secret put CREDENTIAL_ENCRYPTION_KEY
```

`SETUP_TOKEN`은 첫 Master 계정을 만들 때 한 번만 사용하는 충분히 긴 난수입니다. 설정 뒤 `/?setup=1`에서 Master 아이디·비밀번호·설정 토큰을 입력해 첫 운영 계정을 만듭니다. `CREDENTIAL_ENCRYPTION_KEY`는 32바이트 Base64 난수이며, 발급 키의 암호문을 복호화할 때만 씁니다. 전용 Workspace를 쓰면 `OPENROUTER_WORKSPACE_ID`를 Worker 일반 변수로 등록합니다.
