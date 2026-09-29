// Descensus Astrorum 客户端后端 · Node 18+ / Express / SQLite
const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');
db.exec(`
create table if not exists users(id text primary key, salt text, hash text, name text, title text, avatar text, created_at integer);
create table if not exists sessions(token text primary key, user_id text, created_at integer);
create table if not exists posts(id integer primary key autoincrement, author text, text text, image text, created_at integer);
create table if not exists likes(post_id integer, user_id text, primary key(post_id, user_id));
create table if not exists comments(id integer primary key autoincrement, post_id integer, author text, text text, created_at integer);
create table if not exists announcements(id integer primary key autoincrement, title text, date text);
create table if not exists allowed_ids(id text primary key);
`);
db.prepare('insert or ignore into allowed_ids values(?)').run('DA-6666');
const allowed = id => !!db.prepare('select 1 from allowed_ids where id = ?').get(id);
if (!db.prepare('select count(*) n from announcements').get().n) {
  const ins = db.prepare('insert into announcements(title, date) values(?, ?)');
  ins.run('社区频道开放 · 观测记录同步中', '2026.09.29');
}

const ID_RE = /^[A-Z0-9_-]{3,20}$/;
const MAX_IMG = 2_000_000;
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 64);
const pub = u => ({ id: u.id, name: u.name, title: u.title, avatar: u.avatar || '', createdAt: u.created_at });
const isImg = s => typeof s === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,/.test(s) && s.length < MAX_IMG;
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

const app = express();
app.use(express.json({ limit: '5mb' }));
const INDEX = [path.join(__dirname, 'public', 'index.html'), path.join(__dirname, 'index.html')].find(f => require('fs').existsSync(f));
app.get(['/', '/index.html'], (req, res) => INDEX ? res.sendFile(INDEX) : res.status(404).send('index.html not found'));
const api = express.Router();

function auth(req, res, next) {
  const t = (req.get('authorization') || '').replace(/^Bearer /, '');
  const s = t && db.prepare('select user_id from sessions where token = ?').get(t);
  const u = s && db.prepare('select * from users where id = ?').get(s.user_id);
  if (!u) return bad(res, '未登录', 401);
  req.user = u; next();
}
function issue(res, u) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('insert into sessions values(?, ?, ?)').run(token, u.id, Date.now());
  res.json({ token, user: pub(u) });
}
function postOut(p, me) {
  const a = db.prepare('select name, avatar from users where id = ?').get(p.author) || {};
  const likeCount = db.prepare('select count(*) n from likes where post_id = ?').get(p.id).n;
  const liked = !!db.prepare('select 1 from likes where post_id = ? and user_id = ?').get(p.id, me);
  const comments = db.prepare('select c.author, coalesce(u.name, c.author) name, c.text, c.created_at createdAt from comments c left join users u on u.id = c.author where c.post_id = ? order by c.id').all(p.id);
  return { id: p.id, author: p.author, authorName: a.name || p.author, authorAvatar: a.avatar || '', text: p.text, image: p.image || '', createdAt: p.created_at, likeCount, liked, comments };
}

api.get('/health', (req, res) => res.json({ app: 'descensus-astrorum', ok: true }));
api.post('/auth/check', (req, res) => {
  const id = String(req.body.id || '').toUpperCase();
  if (!ID_RE.test(id)) return bad(res, 'ID 需为 3–20 位字母、数字、- 或 _');
  const exists = !!db.prepare('select 1 from users where id = ?').get(id);
  if (!exists && !allowed(id)) return bad(res, '该 ID 未在授权名单中', 403);
  res.json({ exists });
});
api.post('/auth/login', (req, res) => {
  const u = db.prepare('select * from users where id = ?').get(String(req.body.id || '').toUpperCase());
  if (!u || !crypto.timingSafeEqual(hashPw(req.body.password, u.salt), Buffer.from(u.hash, 'hex'))) return bad(res, '密码错误', 401);
  issue(res, u);
});
api.post('/auth/register', (req, res) => {
  const id = String(req.body.id || '').toUpperCase(), pw = String(req.body.password || '');
  if (!ID_RE.test(id)) return bad(res, 'ID 格式错误');
  if (pw.length < 6) return bad(res, '密码至少 6 位');
  if (db.prepare('select 1 from users where id = ?').get(id)) return bad(res, '该 ID 已注册', 409);
  if (!allowed(id)) return bad(res, '该 ID 未在授权名单中', 403);
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('insert into users values(?, ?, ?, ?, ?, ?, ?)').run(id, salt, hashPw(pw, salt).toString('hex'), id, '观测员', '', Date.now());
  issue(res, db.prepare('select * from users where id = ?').get(id));
});
api.get('/me', auth, (req, res) => res.json({ user: pub(req.user) }));
api.patch('/me', auth, (req, res) => {
  const u = req.user, b = req.body;
  const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 24) : u.name;
  const title = typeof b.title === 'string' && b.title.trim() ? b.title.trim().slice(0, 24) : u.title;
  let avatar = u.avatar;
  if (typeof b.avatar === 'string') { if (b.avatar && !isImg(b.avatar)) return bad(res, '图片格式或大小不支持'); avatar = b.avatar; }
  db.prepare('update users set name = ?, title = ?, avatar = ? where id = ?').run(name, title, avatar, u.id);
  res.json({ user: pub(db.prepare('select * from users where id = ?').get(u.id)) });
});
api.get('/announcements', (req, res) => res.json({ items: db.prepare('select id, title, date from announcements order by id desc limit 10').all() }));
api.get('/posts', auth, (req, res) => {
  res.json({ posts: db.prepare('select * from posts order by id desc limit 100').all().map(p => postOut(p, req.user.id)) });
});
api.post('/posts', auth, (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 500), image = req.body.image || '';
  if (!text && !image) return bad(res, '内容为空');
  if (image && !isImg(image)) return bad(res, '图片格式或大小不支持');
  const r = db.prepare('insert into posts(author, text, image, created_at) values(?, ?, ?, ?)').run(req.user.id, text, image, Date.now());
  res.json({ post: postOut(db.prepare('select * from posts where id = ?').get(r.lastInsertRowid), req.user.id) });
});
api.post('/posts/:id/like', auth, (req, res) => {
  const p = db.prepare('select * from posts where id = ?').get(+req.params.id);
  if (!p) return bad(res, '帖子不存在', 404);
  const del = db.prepare('delete from likes where post_id = ? and user_id = ?').run(p.id, req.user.id);
  if (!del.changes) db.prepare('insert into likes values(?, ?)').run(p.id, req.user.id);
  res.json({ post: postOut(p, req.user.id) });
});
api.post('/posts/:id/comments', auth, (req, res) => {
  const p = db.prepare('select * from posts where id = ?').get(+req.params.id);
  if (!p) return bad(res, '帖子不存在', 404);
  const text = String(req.body.text || '').trim().slice(0, 200);
  if (!text) return bad(res, '留言为空');
  db.prepare('insert into comments(post_id, author, text, created_at) values(?, ?, ?, ?)').run(p.id, req.user.id, text, Date.now());
  res.json({ post: postOut(p, req.user.id) });
});

app.use('/api', api);
app.listen(PORT, () => console.log('DA server on :' + PORT));
