# 대지고등학교 생활앱 서버
## 로컬 실행
```bash
cp .env.sample .env   # JWT_SECRET 수정 권장
npm install
npm run init          # 샘플 데이터
npm start             # http://localhost:8787
```
## 엔드포인트
- POST /auth/register, /auth/login
- GET /timetable/:classId, POST /timetable (교사)
- GET /meals/:date, POST /meals (교사)
- GET /assignments, POST /assignments, PATCH /assignments/:id/toggle, DELETE /assignments/:id
- GET /news, POST /news (교사)
