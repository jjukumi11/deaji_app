# Daeji School Server (with DB Init)

## 사용법
1. Render에서 PostgreSQL 생성
2. Render Web Service 생성 → Language: Node, Build Command: `npm install`, Start Command: `npm start`
3. Environment Variables 설정:
   - DATABASE_URL = (Render PostgreSQL External URL)
4. 배포 후 브라우저에서 `/init` 접속 → DB 및 샘플 계정 자동 생성
5. 테스트 로그인 계정:
   - 이메일: student@daeji.hs.kr
   - 비밀번호: student1234
