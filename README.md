# ZOJ Editor Frontend

`editor.zoj.kr`의 독립 문제 제작 UI입니다. React·TypeScript·Vite를 사용하고,
ZOJ의 인디고 색상과 카드/폼/표 스타일에 맞춰 구성했습니다.

백엔드: https://github.com/ZERONE-Online-Judge/editor-backend-v1

## 개발

```sh
npm ci
npm run dev
```

http://127.0.0.1:5190 에서 열립니다. `/api` 요청은 `VITE_API_PROXY` 또는
기본 http://127.0.0.1:8011 로 프록시합니다. ZOJ 전송은 Editor 서버를 통해
권한을 확인하므로 브라우저에 연동 키나 ZOJ 로그인 토큰을 넣지 않습니다.
백엔드의 `deploy/dev.sh`로 API·워커·프런트엔드를 함께 실행할 수 있습니다.
ZOJ와 이메일·비밀번호·로그인 세션을 공유합니다. 독립 개발 모드의 인증번호는 백엔드의
`data/preview/development-mail`에 저장됩니다.

## 화면

- 로그인 폼 중심의 공통 이메일 인증·비밀번호·찾기·재발송·FAQ
- 내 문제/공유 문제 목록, 개인 폴더·하위 폴더·일괄 이동·끌어 놓기
- ZIP 가져오기, 새 문제, 휴지통 복원
- 문제 작업 공간: 지문, 파일, checker, validator, interactor, 테스트, 풀이
- 실제 검증 결과: 기대 판정 비교, 사례별 입출력과 CPU/메모리, 실행 기록
- 스트레스 테스트: 유효한 반례 찾기와 테스트 등록
- 공유 리비전, 변경 비교, 명시적 충돌 해결, 협업 권한과 이슈
- 공개 자료, Editor 또는 ZOJ 형식의 검증된 패키지 다운로드
- 같은 이메일의 ZOJ 대회 권한 조회·직접 등록·서버에 보관한 전송 기록
- 대회 문제 모음과 문제 순서 편집
- 모바일 메뉴, 저장하지 않은 변경 이탈 확인, 수식 미리보기

화면의 실행 결과는 서버에서 가져옵니다. 시뮬레이션 판정을 보여주지
않습니다. 테스트/컴파일은 별도 격리 워커에서 실행합니다.

## 검증

```sh
npm test
npm run lint
npm run build
npm audit
```

## 별도 서버 배포

Dockerfile과 `deploy/nginx.conf.template`을 제공합니다. 백엔드 저장소의
`deploy/compose.yaml`에서 프런트엔드와 API를 함께 실행합니다.
호스트 포트·SMTP·TLS·DB 설정은 백엔드 배포 문서를 따릅니다.
`VITE_API_PROXY`는 개발용이며 운영은 동일 도메인의 `/api`를 사용합니다.

## 브랜치

각 기능 브랜치는 앞 브랜치를 기반으로 쌓았습니다.
`integration/editor-v1`에 전체 구현이 있습니다. 운영 `main` 푸시는 빌드와
테스트를 통과한 뒤 전용 Editor 러너에서 배포합니다. 기능 브랜치와 PR은
GitHub 호스팅 러너에서 검증하며 운영 서버에서 실행하지 않습니다.

- `feature/interface-foundation`: 독립 도구·디자인 토큰·공통 UI
- `feature/email-login`: 인증번호 로그인·프로필·서비스 탐색
- `feature/problem-workspace`: 목록·편집·작업 사본·협업·충돌 해결
- `feature/verification-interface`: 실행 기록·반례·패키지 UI
- `feature/service-deployment`: 별도 서버 이미지·CI·문서

커밋 메시지는 `AGENTS.md`에 지정된 모든 규칙을 따릅니다.
Polygon 공개 명세의 대응 범위와 차이는 백엔드의
`docs/polygon-reference.md`에 기록했습니다.

- `feature/project-folders`: 개인 폴더·하위 폴더·선택 이동 UI
- `feature/zoj-publishing`: ZOJ 패키지·대회 등록·전송 기록 UI
- `feature/self-hosted-deployment`: 전용 서버 러너·검증 후 자동 배포

- `feature/shared-login`: ZOJ 공통 로그인과 내 정보 비밀번호 설정
