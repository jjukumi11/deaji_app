import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';

const app = express();
const PORT = process.env.PORT || 8787;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN || "@daeji.hs.kr";

app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(morgan('tiny'));

const db = new Database('./data.sqlite');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  classId TEXT
);
CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  menu TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS timetable (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  classId TEXT NOT NULL,
  weekday TEXT NOT NULL,
  subjects TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  classId TEXT NOT NULL,
  subject TEXT,
  title TEXT NOT NULL,
  due TEXT NOT NULL,
  desc TEXT,
  done INTEGER DEFAULT 0,
  ownerUserId INTEGER,
  FOREIGN KEY(ownerUserId) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  classId TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tag TEXT,
  date TEXT NOT NULL
);
`);

function sign(user) {
  const payload = { id: user.id, role: user.role, classId: user.classId, name: user.name };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
}
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
function only(role) {
  return (req,res,next) => {
    if (req.user?.role === role || req.user?.role === 'admin') return next();
    return res.status(403).json({ error: 'Forbidden' });
  }
}
function checkDomain(email){
  return typeof email === 'string' && email.toLowerCase().endsWith(ALLOWED_DOMAIN.toLowerCase());
}

// Auth
app.post('/auth/register', (req,res) => {
  const { email, password, name, classId, role } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'Missing fields' });
  if (!checkDomain(email)) return res.status(403).json({ error: `Only ${ALLOWED_DOMAIN} emails can register` });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const info = db.prepare('INSERT INTO users (email,passwordHash,name,classId,role) VALUES (?,?,?,?,?)').run(email, hash, name, classId || null, role || 'student');
    const user = db.prepare('SELECT id,email,name,role,classId FROM users WHERE id=?').get(info.lastInsertRowid);
    return res.json({ token: sign(user), user });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
    return res.status(500).json({ error: 'Register failed' });
  }
});
app.post('/auth/login', (req,res) => {
  const { email, password } = req.body;
  if (!checkDomain(email)) return res.status(403).json({ error: 'Access restricted to Daeji HS accounts' });
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  return res.json({ token: sign(user), user: { id:user.id, email:user.email, name:user.name, role:user.role, classId:user.classId } });
});

// Meals
app.get('/meals/:date', auth, (req,res) => {
  const rows = db.prepare('SELECT * FROM meals WHERE date=?').all(req.params.date);
  return res.json(rows.map(r=>({ id:r.id, date:r.date, menu: JSON.parse(r.menu) })));
});
app.post('/meals', auth, only('teacher'), (req,res)=>{
  const { date, menu } = req.body;
  if (!date || !Array.isArray(menu)) return res.status(400).json({ error:'Invalid body' });
  const info = db.prepare('INSERT INTO meals (date,menu) VALUES (?,?)').run(date, JSON.stringify(menu));
  return res.json({ id: info.lastInsertRowid });
});

// Timetable
app.get('/timetable/:classId', auth, (req,res)=>{
  const rows = db.prepare('SELECT * FROM timetable WHERE classId=?').all(req.params.classId);
  return res.json(rows.map(r=>({ id:r.id, classId:r.classId, weekday:r.weekday, subjects: JSON.parse(r.subjects) })));
});
app.post('/timetable', auth, only('teacher'), (req,res)=>{
  const { classId, weekday, subjects } = req.body;
  if (!classId || !weekday || !Array.isArray(subjects)) return res.status(400).json({ error:'Invalid body' });
  const info = db.prepare('INSERT INTO timetable (classId,weekday,subjects) VALUES (?,?,?)').run(classId, weekday, JSON.stringify(subjects));
  return res.json({ id: info.lastInsertRowid });
});

// Assignments
app.get('/assignments', auth, (req,res)=>{
  const classId = req.user.classId;
  const rows = db.prepare('SELECT * FROM assignments WHERE classId=? ORDER BY due ASC').all(classId);
  return res.json(rows.map(r=>({ ...r, done: !!r.done })));
});
app.post('/assignments', auth, (req,res)=>{
  const { subject, title, due, desc } = req.body;
  const classId = req.user.classId;
  if (!title || !due) return res.status(400).json({ error: 'Invalid body' });
  const info = db.prepare('INSERT INTO assignments (classId,subject,title,due,desc,done,ownerUserId) VALUES (?,?,?,?,?,?,?)')
    .run(classId, subject||null, title, due, desc||null, 0, req.user.id);
  return res.json({ id: info.lastInsertRowid });
});
app.patch('/assignments/:id/toggle', auth, (req,res)=>{
  const a = db.prepare('SELECT * FROM assignments WHERE id=?').get(req.params.id);
  if (!a || a.classId !== req.user.classId) return res.status(404).json({ error:'Not found' });
  const newDone = a.done ? 0 : 1;
  db.prepare('UPDATE assignments SET done=? WHERE id=?').run(newDone, a.id);
  return res.json({ ok:true, done: !!newDone });
});
app.delete('/assignments/:id', auth, (req,res)=>{
  const a = db.prepare('SELECT * FROM assignments WHERE id=?').get(req.params.id);
  if (!a || a.classId !== req.user.classId) return res.status(404).json({ error:'Not found' });
  db.prepare('DELETE FROM assignments WHERE id=?').run(a.id);
  return res.json({ ok:true });
});

// News
app.get('/news', auth, (req,res)=>{
  const rows = db.prepare('SELECT * FROM news WHERE classId=? ORDER BY date DESC').all(req.user.classId);
  return res.json(rows);
});
app.post('/news', auth, only('teacher'), (req,res)=>{
  const { classId, title, body, tag, date } = req.body;
  if (!classId || !title || !body || !date) return res.status(400).json({ error:'Invalid body' });
  const info = db.prepare('INSERT INTO news (classId,title,body,tag,date) VALUES (?,?,?,?,?)').run(classId,title,body,tag||null,date);
  return res.json({ id: info.lastInsertRowid });
});

app.get('/', (req,res)=> res.json({ ok:true, name:'daeji-school-server'}));
app.listen(PORT, ()=> console.log(`server listening on :${PORT}`));
