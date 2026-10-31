# BoB Web

첨부 랜딩 시안을 기반으로 만든 한국어 반응형 랜딩페이지와 브라우저 로컬 웹앱입니다.

## 실행

Node.js 22 이상에서 `npm run dev` 실행 후 http://127.0.0.1:4173 으로 접속하세요. 앱 런타임에는 패키지 설치가 필요 없습니다.

`npm run build`는 정적 배포용 `dist/`를 생성합니다. 웹 서버의 document root를 dist로 지정하면 됩니다. 해시 라우팅이므로 별도 SPA rewrite는 필요하지 않습니다.

개발 검증: `npm install`, `npm run lint`, `npm run typecheck`, `npm test`.

## 기능

- 랜딩: 첨부 HTML의 브랜드 이미지, 설명, 사용 흐름
- 물건 수동 등록 및 AI 링크/이미지 분석, 이유·예상 사용량 기록
- 가격별 3/7/14일 시뮬레이션, 하루 한 번 질문, 결과와 Buy/Bye/보류
- 구매 후 사용 점검, 목표와 참은 금액, 가계부, 리포트, 할인 비교
- 브라우저 로컬 저장, JSON 백업·복원, 저장 실패 안내

## 데이터와 연동

모든 소비 기록은 localStorage의 bob.web.v1에 저장합니다. 브라우저나 기기를 바꾸면 공유되지 않습니다. 백업은 웹앱 전용 형식이며 모바일 백업과 직접 호환되지 않습니다.
AI 분석만 설정된 BE로 전송합니다. 기본 주소는 기존 앱의 BE이며 설정에서 변경할 수 있습니다. API 응답 오류나 CORS 차단 시 직접 입력으로 계속할 수 있습니다. 브라우저 알림 예약과 모바일 푸시 동등성은 아직 구현하지 않았습니다.

## 검증 한계

로컬 브라우저에서 주요 화면과 상호작용을 확인했습니다. 린트·타입 검사와 단위 테스트를 통과했습니다. 구매 후 실제 사용 일수는 일별 사용 로그가 아니라 사용 점검의 빈도 선택을 환산한 값입니다.

## 실제 백엔드 연결
기본 서버는 https://bob-be.vercel.app 입니다. npm run dev는 /api/v1 요청을 해당 서버로 전달합니다. Vercel 배포는 vercel.json의 동일 출처 rewrite를 사용하므로 백엔드 CORS 허용 없이 호출할 수 있습니다. 다른 정적 호스팅에서는 /api/v1 프록시를 별도로 설정해야 합니다. 사용자 지정 AI 주소는 직접 호출하므로 해당 서버의 CORS 허용이 필요합니다. 토큰은 메모리에만 보관하며 401이면 한 번 재발급합니다.
배포 서버 게스트 인증(201)과 item-drafts AI 분석(200)을 확인했습니다. 직접 브라우저 호출의 CORS 거부도 확인하여 프록시 경로를 적용했습니다.

## 배너 3D 모델
mascot-brown.glb는 제공된 GLB를 scripts/prepare_mascot.py로 변환한 4.7MB 단색 모델입니다. 색은 #5A3A28, CSS 불투명도는 45%입니다. model-viewer 4.0.0 런타임과 Apache 2.0 라이선스를 함께 로컬 배포합니다. 원본 재변환: `python scripts/prepare_mascot.py 원본.glb mascot-brown.glb`. WebGL을 지원하는 브라우저가 필요합니다.

## 배포

프로덕션 주소: https://bob-web-chi.vercel.app

Vercel 프로젝트: `mas-f1f6/bob-web`. `vercel.json`의 `framework: null`은 브라우저용 app.js가 Node 서버 진입점으로 오인되는 것을 막습니다. `dist`의 정적 파일과 `/api/v1` 백엔드 프록시를 배포합니다.

다시 배포: `npx --yes vercel@latest deploy --prod --yes --scope mas-f1f6`. `.vercelignore`는 배포에 필요한 파일만 허용합니다. `.vercel`과 `.env*`는 커밋하지 않습니다. GitHub `2026-InThon-Team12/BOB_WEB`의 `main`에 push하면 Vercel 프로덕션으로 자동 배포됩니다.

로컬 주소와 배포 주소의 브라우저 저장소는 분리되어 있습니다. 기존 기록을 옮기려면 로컬 설정에서 백업을 다운로드한 뒤 배포 사이트 설정에서 복원하세요.
