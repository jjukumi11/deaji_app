import express from "express";
import bodyParser from "body-parser";
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const app = express();
app.use(bodyParser.json());

// DB 초기화 함수
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'student'
    );
  `);

  // 샘플 계정 삽입
  const existing = await pool.query("SELECT * FROM users WHERE email=$1", ["student@daeji.hs.kr"]);
  if (existing.rows.length === 0) {
    await pool.query(
      "INSERT INTO users (email, password, role) VALUES ($1, $2, $3)",
      ["student@daeji.hs.kr", "student1234", "student"]
    );
  }
}

// 초기화 엔드포인트
app.get("/init", async (req, res) => {
  try {
    await initDb();
    res.send("✅ DB 초기화 완료!");
  } catch (err) {
    console.error(err);
    res.status(500).send("DB 초기화 실패");
  }
});

// 로그인 API (간단 버전)
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const result = await pool.query("SELECT * FROM users WHERE email=$1 AND password=$2", [email, password]);
  if (result.rows.length > 0) {
    res.json({ success: true, message: "로그인 성공" });
  } else {
    res.status(401).json({ success: false, message: "로그인 실패" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
