// Descensus Astrorum 客户端后端 · Node 18+ / Express / SQLite
const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = process.env.PORT || 3000;
const ADMIN_DEPT = { 'DA-1978': '驾驶部', 'DA-0409': '后勤部', 'DA-0042': '研究部' };
const DEPTS = ['研究部', '驾驶部', '后勤部'];
const ADMINS = Object.keys(ADMIN_DEPT);
let ROSTER = {}; try { ROSTER = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'roster.json'), 'utf8')); } catch (e) {}
const presetDept = id => ADMIN_DEPT[id] || (ROSTER[id] && DEPTS.includes(ROSTER[id].dept) ? ROSTER[id].dept : '');
const T_ = (kind, key, n, name, cond) => ({ kind, key, n, name, cond });
const TITLES = [
  T_('post', 'p5', 5, '分享生活', '累计发帖 5 条'), T_('post', 'p10', 10, '隔太空喊话', '累计发帖 10 条'),
  T_('post', 'p15', 15, '给我好好上班', '累计发帖 15 条'), T_('post', 'p20', 20, '带薪摸鱼', '累计发帖 20 条'),
  T_('radio', 'r5', 5, '爱听', '累计电台投稿 5 次'), T_('radio', 'r10', 10, '听听你的', '累计电台投稿 10 次'),
  T_('radio', 'r15', 15, '广播全是你', '累计电台投稿 15 次'), T_('radio', 'r20', 20, '点歌王', '累计电台投稿 20 次'),
  T_('sing', 'k5', 5, 'K歌大王', '累计电台 K歌投稿 5 次'), T_('sing', 'k10', 10, '麦霸', '累计电台 K歌投稿 10 次'),
  T_('fav', 'f20', 20, '收藏家', '累计收藏 20 条帖子'),
  T_('cmt', 'c5', 5, '你好世界', '累计评论 5 条'), T_('cmt', 'c10', 10, '社交的手腕', '累计评论 10 条'),
  T_('cmt', 'c15', 15, '人性的秘密', '累计评论 15 条'), T_('cmt', 'c20', 20, '五星评价', '累计评论 20 条'),
  T_('cmt', 'c30', 30, '评论学家', '累计评论 30 条'), T_('cmt', 'c40', 40, '社交神', '累计评论 40 条'),
  T_('secret', 'm1', 0, '月之暗面', ''), T_('secret', 'm2', 0, '1:4:9', ''), T_('secret', 'o4', 0, '罗摩占陀罗', ''), T_('secret', 'o5', 0, '航线：F_W_S', '据说是一位伟大的船长曾经规划过的航线'),
  T_('orbit', 'o1', 0, '模拟器高手', '航线规划培训 · 达成精确航线'), T_('orbit', 'o2', 0, '完成培训', '航线规划培训 · 完成任务'), T_('orbit', 'o3', 0, '我们要去哪?', '航线规划培训 · 偏离原定计划'),
  T_('ofail', 'of10', 10, '飞船爆破手', '航线模拟失败 10 次'), T_('ofail', 'of20', 20, '舰桥流放者', '航线模拟失败 20 次'), T_('ofail', 'of30', 30, '驾驶部公敌', '航线模拟失败 30 次')
];

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
create table if not exists reports(post_id integer, user_id text, reason text, created_at integer, primary key(post_id, user_id));
create table if not exists favs(post_id integer, user_id text, created_at integer, primary key(post_id, user_id));
create table if not exists notifs(id integer primary key autoincrement, user_id text, kind text, actor text, post_id integer, text text, created_at integer, read integer default 0);
create table if not exists ads(id integer primary key autoincrement, text text, image text, link text, created_at integer);
create table if not exists radio(id integer primary key autoincrement, author text, anon integer, type text, text text, image text, link text, platform text, media_id text, title text, artist text, cover text, duration integer, day text, created_at integer);
`);
const addCol = (t, c, def) => { if (!db.prepare(`pragma table_info(${t})`).all().some(r => r.name === c)) db.exec(`alter table ${t} add column ${c} ${def}`); };
addCol('users', 'dept', "text default ''");
addCol('ads', 'once', 'integer default 0');
addCol('users', 'orbit_fails', 'integer default 0');
addCol('users', 'position', "text default ''");
addCol('users', 'gender', "text default ''");
addCol('users', 'birthday', "text default ''");
addCol('users', 'badge', "text default 'base'");
addCol('users', 'titles', "text default '[]'");
addCol('users', 'idcard', "text default ''");
addCol('users', 'age', "text default ''");
addCol('posts', 'images', "text default ''");
addCol('comments', 'reply_to', "text default ''");
addCol('announcements', 'body', "text default ''");
addCol('announcements', 'author', "text default ''");
db.exec(`update users set position = case when id in (${ADMINS.map(a => `'${a}'`).join(',')}) then '部长' else '员工' end where position is null or position = ''`);
ADMINS.forEach(id => db.prepare('insert or ignore into allowed_ids values(?)').run(id));
Object.keys(ROSTER).forEach(id => db.prepare('insert or ignore into allowed_ids values(?)').run(id));
db.exec('create table if not exists meta(k text primary key, v text)');
if (!db.prepare("select 1 from meta where k = 'cleanup_v1'").get()) {
  // 一次性清理：只保留两个管理员账号
  const keep = ADMINS.map(a => `'${a}'`).join(',');
  db.transaction(() => {
    db.exec(`delete from likes where user_id not in (${keep}) or post_id in (select id from posts where author not in (${keep}))`);
    db.exec(`delete from comments where author not in (${keep}) or post_id in (select id from posts where author not in (${keep}))`);
    db.exec(`delete from reports where user_id not in (${keep}) or post_id in (select id from posts where author not in (${keep}))`);
    db.exec(`delete from posts where author not in (${keep})`);
    db.exec(`delete from sessions where user_id not in (${keep})`);
    db.exec(`delete from users where id not in (${keep})`);
    db.exec(`delete from allowed_ids where id not in (${keep})`);
    db.prepare("insert into meta values('cleanup_v1', ?)").run(String(Date.now()));
  })();
}
ADMINS.forEach(id => db.prepare("update users set dept = ?, position = '部长' where id = ?").run(ADMIN_DEPT[id], id));
const allowed = id => !!db.prepare('select 1 from allowed_ids where id = ?').get(id);
if (!db.prepare('select count(*) n from announcements').get().n) {
  db.prepare('insert into announcements(title, date, body, author) values(?, ?, ?, ?)').run('社区频道开放 · 观测记录同步中', '2026.09.29', '', '地面控制');
}

db.exec('create table if not exists errors(id integer primary key autoincrement, t integer, src text, where_ text, user_id text, msg text, stack text)');
function logError(src, where, err, uid) {
  try {
    db.prepare('insert into errors(t, src, where_, user_id, msg, stack) values(?, ?, ?, ?, ?, ?)').run(Date.now(), src, String(where || '').slice(0, 200), uid || '', String((err && err.message) || err || '').slice(0, 500), String((err && err.stack) || '').slice(0, 2000));
    db.prepare('delete from errors where id <= (select max(id) - 500 from errors)').run();
  } catch (e) {}
}
// 每天北京时间 4 点后自动备份，保留 14 天
const BK_DIR = path.join(os.homedir(), 'da-backups');
let lastDaily = '';
async function dailyBackup() {
  const bj = new Date(Date.now() + 8 * 3600e3), day = bj.toISOString().slice(0, 10).replace(/-/g, '');
  if (bj.getUTCHours() < 4 || lastDaily === day) return;
  const file = path.join(BK_DIR, 'daily-' + day + '.db');
  if (fs.existsSync(file)) { lastDaily = day; return; }
  try {
    fs.mkdirSync(BK_DIR, { recursive: true }); await db.backup(file); lastDaily = day;
    try { fs.cpSync(MEDIA, path.join(BK_DIR, 'media'), { recursive: true, force: false, errorOnExist: false }); } catch (e) {}
    fs.readdirSync(BK_DIR).filter(f => /^daily-\d{8}\.db$/.test(f)).sort().reverse().slice(14).forEach(f => fs.unlinkSync(path.join(BK_DIR, f)));
    console.log('daily backup -> ' + file);
  } catch (e) { logError('backup', 'dailyBackup', e); }
}
setInterval(dailyBackup, 10 * 60e3); setTimeout(dailyBackup, 30e3);
// 频率限制：每人每分钟最多 5 次（管理员不限）
const hits = new Map();
const limit = (kind, max = 5, win = 60e3) => (req, res, next) => {
  const who = req.user ? req.user.id : req.ip;
  if (req.user && isAdmin(req.user.id)) return next();
  const k = kind + ':' + who, now = Date.now(), a = (hits.get(k) || []).filter(t => now - t < win);
  if (a.length >= max) return bad(res, '操作太频繁，请 ' + Math.ceil((win - (now - a[0])) / 1000) + ' 秒后再试', 429);
  a.push(now); hits.set(k, a); next();
};
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some(t => now - t < 120e3)) hits.delete(k); }, 10 * 60e3);

const ID_RE = /^[A-Z0-9_-]{3,20}$/;
const MAX_IMG = 2_000_000;
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 64);
// ---- 图片单独存放在 media/ 文件夹，数据库只存地址 ----
const MEDIA = path.join(__dirname, 'media'); fs.mkdirSync(MEDIA, { recursive: true });
const DATA_RE = /^data:image\/(jpeg|png|webp|gif);base64,/, MEDIA_RE = /^\/media\/[0-9a-f]{40}\.(jpg|png|webp|gif)$/;
function saveImg(v) {
  if (typeof v !== 'string' || !DATA_RE.test(v)) return v || '';
  const m = v.match(/^data:image\/(jpeg|png|webp|gif);base64,(.+)$/); if (!m) return '';
  const buf = Buffer.from(m[2], 'base64'), ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const name = crypto.createHash('sha1').update(buf).digest('hex') + '.' + ext, f = path.join(MEDIA, name);
  if (!fs.existsSync(f)) fs.writeFileSync(f, buf);
  return '/media/' + name;
}
const isImg = s => typeof s === 'string' && (MEDIA_RE.test(s) || (DATA_RE.test(s) && s.length < MAX_IMG));
function convertBody(o, depth) {
  if (depth > 4 || !o || typeof o !== 'object') return;
  for (const k of Object.keys(o)) { const x = o[k]; if (typeof x === 'string' && DATA_RE.test(x) && x.length < MAX_IMG) o[k] = saveImg(x); else if (x && typeof x === 'object') convertBody(x, depth + 1); }
}
if (!db.prepare("select 1 from meta where k = 'img_v1'").get()) {
  const cv = x => saveImg(x), arr = s => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  db.transaction(() => {
    db.prepare('select id, avatar, idcard from users').all().forEach(u => db.prepare('update users set avatar = ?, idcard = ? where id = ?').run(cv(u.avatar), cv(u.idcard), u.id));
    db.prepare('select id, image, images from posts').all().forEach(p => db.prepare('update posts set image = ?, images = ? where id = ?').run(cv(p.image), JSON.stringify(arr(p.images).map(cv)), p.id));
    db.prepare('select id, image from radio').all().forEach(r => db.prepare('update radio set image = ? where id = ?').run(cv(r.image), r.id));
    db.prepare('select id, image from ads').all().forEach(a => db.prepare('update ads set image = ? where id = ?').run(cv(a.image), a.id));
    db.prepare("insert into meta values('img_v1', ?)").run(String(Date.now()));
  })();
  try { db.exec('vacuum'); } catch (e) {}
  console.log('图片已迁移到 media/');
}
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const isAdmin = id => ADMINS.includes(id);
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '.');
const deptLabel = d => d ? (d.endsWith('部') ? d : d + '部') : '';
const owned = u => { try { return JSON.parse(u.titles || '[]'); } catch (e) { return []; } };
const wall = u => { const o = owned(u); return [{ key: 'base', name: deptLabel(u.dept) + (u.position || '员工'), cond: '注册即获得', owned: true }, ...TITLES.map(t => ({ key: t.key, name: t.name, cond: t.cond, owned: o.includes(t.key) }))]; };
const pub = u => {
  const w = wall(u), b = w.find(t => t.owned && t.key === u.badge) || w[0];
  return { id: u.id, name: u.name, avatar: u.avatar || '', createdAt: u.created_at, dept: u.dept || '', position: u.position || '员工', gender: u.gender || '', birthday: (u.birthday || '').slice(-5), age: u.age || '', isAdmin: isAdmin(u.id), badge: b.key, badgeName: b.name, titles: w };
};
const getUser = id => db.prepare('select * from users where id = ?').get(id);
const getPost = id => db.prepare('select * from posts where id = ?').get(id);
const postCount = id => db.prepare('select count(*) n from posts where author = ?').get(id).n;

const app = express();
app.use(express.json({ limit: '12mb' }));
app.use((req, res, next) => { try { convertBody(req.body, 0); } catch (e) {} next(); });
app.use('/moon', express.static(path.join(__dirname, 'moon'), { maxAge: '1h' }));
app.use('/orbit', express.static(path.join(__dirname, 'orbit'), { maxAge: '1h' }));
app.use('/fonts', express.static(path.join(__dirname, 'fonts'), { immutable: true, maxAge: '365d', index: false }));
app.use('/media', express.static(MEDIA, { immutable: true, maxAge: '365d', index: false, dotfiles: 'deny' }));
const INDEX = [path.join(__dirname, 'public', 'index.html'), path.join(__dirname, 'index.html')].find(f => fs.existsSync(f));
app.get(['/', '/index.html'], (req, res) => INDEX ? res.sendFile(INDEX) : res.status(404).send('index.html not found'));
const STATIC = { '/manifest.webmanifest': 'application/manifest+json', '/sw.js': 'text/javascript', '/icon-192.png': 'image/png', '/icon-512.png': 'image/png', '/apple-touch-icon.png': 'image/png' };
Object.entries(STATIC).forEach(([u, type]) => app.get(u, (req, res) => {
  const f = path.join(__dirname, u.slice(1)); if (!fs.existsSync(f)) return res.status(404).end();
  res.type(type); if (u === '/sw.js') res.set('Cache-Control', 'no-cache'); res.sendFile(f);
}));
const api = express.Router();

function auth(req, res, next) {
  const t = (req.get('authorization') || '').replace(/^Bearer /, '');
  const s = t && db.prepare('select user_id from sessions where token = ?').get(t);
  const u = s && getUser(s.user_id);
  if (!u) return bad(res, '未登录', 401);
  req.user = u; next();
}
const admin = (req, res, next) => isAdmin(req.user.id) ? next() : bad(res, '需要管理员权限', 403);
const self = u => ({ ...pub(u), idCard: u.idcard || '' });
function mentionIds(text) {
  const out = new Set(), re = /@([^\s@，。,.!！?？:：;；、）)]+)/g; let m;
  while ((m = re.exec(String(text || '')))) {
    const t = m[1], u = getUser(t.toUpperCase()) || db.prepare('select * from users where name = ?').get(t);
    if (u) out.add(u.id);
  }
  return [...out];
}
function notify(uid, kind, actor, postId, text) {
  if (!uid || uid === actor) return;
  db.prepare('insert into notifs(user_id, kind, actor, post_id, text, created_at, read) values(?, ?, ?, ?, ?, ?, 0)').run(uid, kind, actor, postId, String(text || '').slice(0, 200), Date.now());
}
function award(u, kind, n) {
  const have = owned(u), fresh = TITLES.filter(t => t.kind === kind && n >= t.n && !have.includes(t.key));
  if (fresh.length) db.prepare('update users set titles = ? where id = ?').run(JSON.stringify([...have, ...fresh.map(t => t.key)]), u.id);
  return fresh.map(t => ({ name: t.name, cond: t.cond }));
}
function issue(res, u) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('insert into sessions values(?, ?, ?)').run(token, u.id, Date.now());
  res.json({ token, user: self(u) });
}
function postImages(p) { try { const a = JSON.parse(p.images || '[]'); if (Array.isArray(a) && a.length) return a; } catch (e) {} return p.image ? [p.image] : []; }
function postOut(p, me) {
  const a = getUser(p.author);
  const likeCount = db.prepare('select count(*) n from likes where post_id = ?').get(p.id).n;
  const liked = !!db.prepare('select 1 from likes where post_id = ? and user_id = ?').get(p.id, me);
  const reported = !!db.prepare('select 1 from reports where post_id = ? and user_id = ?').get(p.id, me);
  const faved = !!db.prepare('select 1 from favs where post_id = ? and user_id = ?').get(p.id, me);
  const comments = db.prepare('select c.id, c.author, coalesce(u.name, c.author) name, c.text, c.created_at createdAt, c.reply_to replyTo, coalesce(r.name, c.reply_to) replyName from comments c left join users u on u.id = c.author left join users r on r.id = c.reply_to where c.post_id = ? order by c.id').all(p.id);
  return { id: p.id, author: p.author, authorName: a ? a.name : p.author, authorAvatar: a ? a.avatar || '' : '', authorBadge: a ? pub(a).badgeName : '', text: p.text, image: p.image || '', images: postImages(p), createdAt: p.created_at, likeCount, liked, reported, faved, comments };
}
const annList = () => db.prepare('select id, title, body, date, author from announcements order by id desc limit 20').all();
const str = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';

api.get('/health', (req, res) => res.json({ app: 'descensus-astrorum', ok: true, now: Date.now() }));
api.post('/auth/check', (req, res) => {
  const id = String(req.body.id || '').toUpperCase();
  if (!ID_RE.test(id)) return bad(res, 'ID 需为 3–20 位字母、数字、- 或 _');
  const exists = !!getUser(id);
  if (!exists && !allowed(id)) return bad(res, '该 ID 未在授权名单中', 403);
  res.json({ exists, fixedDept: presetDept(id), fixedPos: isAdmin(id) ? '部长' : '员工' });
});
api.post('/auth/login', (req, res) => {
  const u = getUser(String(req.body.id || '').toUpperCase());
  if (!u || !crypto.timingSafeEqual(hashPw(req.body.password, u.salt), Buffer.from(u.hash, 'hex'))) return bad(res, '密码错误', 401);
  issue(res, u);
});
api.post('/auth/register', (req, res) => {
  const id = String(req.body.id || '').toUpperCase(), pw = String(req.body.password || ''), dept = presetDept(id) || str(req.body.dept, 16);
  if (!ID_RE.test(id)) return bad(res, 'ID 格式错误');
  if (!DEPTS.includes(dept)) return bad(res, '请选择部门');
  if (pw.length < 6) return bad(res, '密码至少 6 位');
  if (getUser(id)) return bad(res, '该 ID 已注册', 409);
  if (!allowed(id)) return bad(res, '该 ID 未在授权名单中', 403);
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare("insert into users(id, salt, hash, name, title, avatar, created_at, dept, position, gender, birthday, badge, titles) values(?, ?, ?, ?, '', '', ?, ?, ?, '', '', 'base', '[]')")
    .run(id, salt, hashPw(pw, salt).toString('hex'), (ROSTER[id] && ROSTER[id].name) || id, Date.now(), dept, isAdmin(id) ? '部长' : '员工');
  issue(res, getUser(id));
});
api.get('/me', auth, (req, res) => res.json({ user: self(req.user) }));
api.patch('/me', auth, (req, res) => {
  const u = req.user, b = req.body;
  const f = { name: str(b.name, 24) || u.name, avatar: u.avatar, idcard: u.idcard || '', gender: u.gender, birthday: u.birthday, age: u.age || '', badge: u.badge, dept: u.dept, position: u.position };
  if (typeof b.avatar === 'string') { if (b.avatar && !isImg(b.avatar)) return bad(res, '图片格式或大小不支持'); f.avatar = b.avatar; }
  if (typeof b.idCard === 'string') { if (b.idCard && !isImg(b.idCard)) return bad(res, '图片格式或大小不支持'); f.idcard = b.idCard; }
  if (['男', '女', '保密', ''].includes(b.gender)) f.gender = b.gender;
  if (b.birthday === '' || /^\d{2}-\d{2}$/.test(b.birthday || '')) f.birthday = b.birthday;
  if (b.age === '') f.age = '';
  else if (b.age != null && Number.isInteger(+b.age) && +b.age >= 0 && +b.age <= 150) f.age = String(+b.age);
  if (typeof b.badge === 'string' && wall(u).some(t => t.owned && t.key === b.badge)) f.badge = b.badge;
  if (isAdmin(u.id)) { f.dept = DEPTS.includes(b.dept) ? b.dept : f.dept; f.position = str(b.position, 16) || f.position; }
  db.prepare('update users set name = @name, avatar = @avatar, idcard = @idcard, gender = @gender, birthday = @birthday, age = @age, badge = @badge, dept = @dept, position = @position where id = @id').run({ ...f, id: u.id });
  res.json({ user: self(getUser(u.id)) });
});

api.get('/users/:id', auth, (req, res) => {
  const u = getUser(req.params.id); if (!u) return bad(res, '用户不存在', 404);
  const p = db.prepare('select * from posts where author = ? order by id desc limit 1').get(u.id);
  res.json({ user: pub(u), postCount: postCount(u.id), latest: p ? postOut(p, req.user.id) : null });
});
api.get('/users/:id/posts', auth, (req, res) => {
  const u = getUser(req.params.id); if (!u) return bad(res, '用户不存在', 404);
  res.json({ user: pub(u), posts: db.prepare('select * from posts where author = ? order by id desc').all(u.id).map(p => postOut(p, req.user.id)) });
});

api.get('/pulse', auth, (req, res) => res.json({
  now: Date.now(),
  post: db.prepare('select coalesce(max(id), 0) n from posts').get().n,
  unread: db.prepare('select count(*) n from notifs where user_id = ? and read = 0').get(req.user.id).n,
  ann: db.prepare('select coalesce(max(id), 0) n from announcements').get().n
}));
api.get('/announcements', (req, res) => res.json({ items: annList() }));
api.post('/announcements', auth, admin, (req, res) => {
  const title = str(req.body.title, 60), body = str(req.body.body, 1000);
  if (!title) return bad(res, '请输入公告标题');
  db.prepare('insert into announcements(title, date, body, author) values(?, ?, ?, ?)').run(title, today(), body, req.user.name);
  res.json({ items: annList() });
});
api.delete('/announcements/:id', auth, admin, (req, res) => {
  db.prepare('delete from announcements where id = ?').run(+req.params.id);
  res.json({ items: annList() });
});

api.get('/posts', auth, (req, res) => {
  const lim = Math.min(200, Math.max(1, +req.query.limit || 20)), before = +req.query.before || 0, after = +req.query.after || 0;
  const rows = after ? db.prepare('select * from posts where id > ? order by id desc limit 200').all(after)
    : db.prepare('select * from posts where (? = 0 or id < ?) order by id desc limit ?').all(before, before, lim);
  res.json({ posts: rows.map(p => postOut(p, req.user.id)), more: !after && rows.length === lim });
});
api.get('/posts/:id', auth, (req, res) => { const p = getPost(+req.params.id); if (!p) return bad(res, '帖子不存在', 404); res.json({ post: postOut(p, req.user.id) }); });
api.post('/posts', auth, limit('post'), (req, res) => {
  const u = req.user, text = str(req.body.text, 500);
  const images = (Array.isArray(req.body.images) ? req.body.images : (req.body.image ? [req.body.image] : [])).filter(Boolean);
  if (images.length > 4) return bad(res, '最多 4 张图片');
  if (!text && !images.length) return bad(res, '内容为空');
  if (images.some(x => !isImg(x))) return bad(res, '图片格式或大小不支持');
  const r = db.prepare('insert into posts(author, text, image, images, created_at) values(?, ?, ?, ?, ?)').run(u.id, text, images[0] || '', JSON.stringify(images), Date.now());
  const newTitles = award(u, 'post', postCount(u.id));
  mentionIds(text).forEach(id => notify(id, 'mention', u.id, r.lastInsertRowid, text));
  res.json({ post: postOut(getPost(r.lastInsertRowid), u.id), user: self(getUser(u.id)), newTitles });
});
api.delete('/posts/:id', auth, (req, res) => {
  const p = getPost(+req.params.id); if (!p) return bad(res, '帖子不存在', 404);
  if (p.author !== req.user.id && !isAdmin(req.user.id)) return bad(res, '无权删除', 403);
  ['likes', 'comments', 'reports', 'favs', 'notifs'].forEach(t => db.prepare(`delete from ${t} where post_id = ?`).run(p.id));
  db.prepare('delete from posts where id = ?').run(p.id);
  res.json({ ok: true });
});
api.post('/posts/:id/like', auth, (req, res) => {
  const p = getPost(+req.params.id); if (!p) return bad(res, '帖子不存在', 404);
  const del = db.prepare('delete from likes where post_id = ? and user_id = ?').run(p.id, req.user.id);
  if (!del.changes) db.prepare('insert into likes values(?, ?)').run(p.id, req.user.id);
  res.json({ post: postOut(p, req.user.id) });
});
api.delete('/posts/:id/comments/:cid', auth, (req, res) => {
  const p = getPost(+req.params.id); if (!p) return bad(res, '帖子不存在', 404);
  const c = db.prepare('select * from comments where id = ? and post_id = ?').get(+req.params.cid, p.id); if (!c) return bad(res, '评论不存在', 404);
  if (c.author !== req.user.id && p.author !== req.user.id && !isAdmin(req.user.id)) return bad(res, '无权删除', 403);
  db.prepare('delete from comments where id = ?').run(c.id);
  res.json({ post: postOut(p, req.user.id) });
});
api.post('/posts/:id/comments', auth, limit('cmt'), (req, res) => {
  const p = getPost(+req.params.id); if (!p) return bad(res, '帖子不存在', 404);
  const text = str(req.body.text, 200); if (!text) return bad(res, '留言为空');
  const rt = getUser(String(req.body.replyTo || '')) ? String(req.body.replyTo) : '';
  db.prepare('insert into comments(post_id, author, text, created_at, reply_to) values(?, ?, ?, ?, ?)').run(p.id, req.user.id, text, Date.now(), rt);
  notify(p.author, 'reply', req.user.id, p.id, text);
  if (rt && rt !== p.author) notify(rt, 'creply', req.user.id, p.id, text);
  mentionIds(text).filter(id => id !== p.author && id !== rt).forEach(id => notify(id, 'cmention', req.user.id, p.id, text));
  const cu = getUser(req.user.id), have = owned(cu), cn = db.prepare('select count(*) n from comments where author = ?').get(req.user.id).n;
  const fresh = TITLES.filter(t => t.kind === 'cmt' && cn >= t.n && !have.includes(t.key));
  if (fresh.length) db.prepare('update users set titles = ? where id = ?').run(JSON.stringify([...have, ...fresh.map(t => t.key)]), cu.id);
  res.json({ post: postOut(p, req.user.id), user: self(getUser(cu.id)), newTitles: fresh.map(t => ({ name: t.name, cond: t.cond })) });
});
api.post('/posts/:id/fav', auth, (req, res) => {
  const p = getPost(+req.params.id); if (!p) return bad(res, '帖子不存在', 404);
  const del = db.prepare('delete from favs where post_id = ? and user_id = ?').run(p.id, req.user.id);
  let newTitles = [];
  if (!del.changes) {
    db.prepare('insert into favs values(?, ?, ?)').run(p.id, req.user.id, Date.now());
    newTitles = award(req.user, 'fav', db.prepare('select count(*) n from favs where user_id = ?').get(req.user.id).n);
  }
  res.json({ post: postOut(p, req.user.id), user: self(getUser(req.user.id)), newTitles });
});
api.get('/favs', auth, (req, res) => {
  res.json({ posts: db.prepare('select p.* from favs f join posts p on p.id = f.post_id where f.user_id = ? order by f.created_at desc').all(req.user.id).map(p => postOut(p, req.user.id)) });
});
api.get('/notifs', auth, (req, res) => {
  const rows = db.prepare('select * from notifs where user_id = ? order by id desc limit 100').all(req.user.id);
  res.json({ items: rows.map(n => { const a = getUser(n.actor), p = getPost(n.post_id);
    return { id: n.id, kind: n.kind, actor: n.actor, actorName: a ? a.name : n.actor, actorAvatar: a ? a.avatar || '' : '', postId: n.post_id, postText: p ? (p.text || '（图片）').slice(0, 80) : '（帖子已删除）', postExists: !!p, text: n.text, createdAt: n.created_at, read: !!n.read }; }) });
});
api.post('/notifs/read', auth, (req, res) => { db.prepare('update notifs set read = 1 where user_id = ?').run(req.user.id); res.json({ ok: true }); });
api.post('/posts/:id/report', auth, (req, res) => {
  const p = getPost(+req.params.id); if (!p) return bad(res, '帖子不存在', 404);
  db.prepare('insert or replace into reports values(?, ?, ?, ?)').run(p.id, req.user.id, str(req.body.reason, 200), Date.now());
  res.json({ post: postOut(p, req.user.id) });
});

api.get('/admin/users', auth, admin, (req, res) => {
  res.json({ users: db.prepare('select * from users order by created_at').all().map(u => ({ ...pub(u), postCount: postCount(u.id) })) });
});
api.patch('/admin/users/:id', auth, admin, (req, res) => {
  const u = getUser(req.params.id); if (!u) return bad(res, '用户不存在', 404);
  const b = req.body;
  const f = {
    name: str(b.name, 24) || u.name,
    gender: ['男', '女', '保密', ''].includes(b.gender) ? b.gender : u.gender,
    birthday: (b.birthday === '' || /^\d{2}-\d{2}$/.test(b.birthday || '')) ? b.birthday : u.birthday,
    age: b.age === '' ? '' : (b.age != null && Number.isInteger(+b.age) && +b.age >= 0 && +b.age <= 150) ? String(+b.age) : (u.age || ''),
    dept: DEPTS.includes(b.dept) ? b.dept : u.dept,
    position: str(b.position, 16) || u.position,
    avatar: b.clearAvatar ? '' : u.avatar,
    idcard: b.clearIdCard ? '' : (u.idcard || ''),
    titles: Array.isArray(b.titles) ? JSON.stringify([...new Set(b.titles.filter(k => TITLES.some(t => t.key === k)))]) : u.titles,
    salt: u.salt, hash: u.hash, id: u.id
  };
  if (b.password) {
    if (String(b.password).length < 6) return bad(res, '新密码至少 6 位');
    f.salt = crypto.randomBytes(16).toString('hex'); f.hash = hashPw(b.password, f.salt).toString('hex');
    db.prepare('delete from sessions where user_id = ?').run(u.id);
  }
  db.prepare('update users set name = @name, gender = @gender, birthday = @birthday, age = @age, dept = @dept, position = @position, avatar = @avatar, idcard = @idcard, titles = @titles, salt = @salt, hash = @hash where id = @id').run(f);
  res.json({ user: pub(getUser(u.id)) });
});
api.delete('/admin/users/:id', auth, admin, (req, res) => {
  const u = getUser(req.params.id); if (!u) return bad(res, '用户不存在', 404);
  if (isAdmin(u.id)) return bad(res, '不能删除管理员账号', 403);
  db.transaction(() => {
    const mine = 'select id from posts where author = @id';
    db.prepare(`delete from likes where user_id = @id or post_id in (${mine})`).run({ id: u.id });
    db.prepare(`delete from comments where author = @id or post_id in (${mine})`).run({ id: u.id });
    db.prepare(`delete from reports where user_id = @id or post_id in (${mine})`).run({ id: u.id });
    db.prepare(`delete from favs where user_id = @id or post_id in (${mine})`).run({ id: u.id });
    db.prepare(`delete from notifs where user_id = @id or actor = @id or post_id in (${mine})`).run({ id: u.id });
    ['posts:author', 'radio:author', 'sessions:user_id', 'users:id'].forEach(x => { const [t, c] = x.split(':'); db.prepare(`delete from ${t} where ${c} = ?`).run(u.id); });
    if (req.query.revoke === '1') db.prepare('delete from allowed_ids where id = ?').run(u.id);
  })();
  res.json({ ok: true });
});
api.get('/admin/reports', auth, admin, (req, res) => {
  const rows = db.prepare('select post_id, count(*) n, max(created_at) last from reports group by post_id order by last desc').all();
  const q = db.prepare('select r.user_id uid, coalesce(u.name, r.user_id) name, r.reason, r.created_at createdAt from reports r left join users u on u.id = r.user_id where r.post_id = ? order by r.created_at desc');
  res.json({ items: rows.map(r => { const p = getPost(r.post_id); return p && { post: postOut(p, req.user.id), count: r.n, last: r.last, reports: q.all(r.post_id) }; }).filter(Boolean) });
});
api.delete('/admin/reports/:id', auth, admin, (req, res) => {
  db.prepare('delete from reports where post_id = ?').run(+req.params.id);
  res.json({ ok: true });
});

// ---- 电台 ----
const RADIO_TYPES = { say: '我想说', sing: 'K歌', song: '歌曲分享' };
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' };
const https_ = u => String(u || '').replace(/^http:\/\//, 'https://');
async function fetchJson(url, headers) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 6000);
  try { const r = await fetch(url, { headers: { ...UA, ...headers }, signal: ctl.signal }); return await r.json(); } finally { clearTimeout(to); }
}
const BILI_H = { Referer: 'https://www.bilibili.com/', Cookie: 'buvid3=' + crypto.randomUUID() + 'infoc' };
async function fetchText(url, headers) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 6000);
  try { const r = await fetch(url, { headers: { ...UA, ...headers }, signal: ctl.signal }); return await r.text(); } finally { clearTimeout(to); }
}
const cleanPic = u => https_(String(u || '').replace(/^\/\//, 'https://').replace(/@.*$/, ''));
async function neteaseMeta(id) {
  const out = {};
  try {
    const j = await fetchJson(`https://music.163.com/api/song/detail/?id=${id}&ids=%5B${id}%5D`, { Referer: 'https://music.163.com/' });
    const s = j && j.songs && j.songs[0];
    if (s) Object.assign(out, { title: s.name || '', artist: (s.artists || []).map(a => a.name).join(' / '), cover: https_(s.album && s.album.picUrl), duration: Math.round((s.duration || 0) / 1000) });
  } catch (e) {}
  return out;
}
async function biliMeta(bvid) {
  const out = {};
  try {
    const j = await fetchJson(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, BILI_H);
    const d = j && j.code === 0 && j.data;
    if (d) Object.assign(out, { title: d.title || '', artist: (d.owner && d.owner.name) || '', cover: cleanPic(d.pic), duration: d.duration || 0 });
  } catch (e) {}
  if (!out.duration) {
    try { const j = await fetchJson(`https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`, BILI_H); if (j && j.code === 0 && j.data && j.data[0]) out.duration = j.data[0].duration || 0; } catch (e) {}
  }
  if (!out.cover || !out.title || !out.duration) {
    try {
      const h = await fetchText(`https://www.bilibili.com/video/${bvid}/`, BILI_H);
      const pick = re => { const m = h.match(re); return m ? m[1] : ''; };
      if (!out.cover) out.cover = cleanPic(pick(/<meta[^>]+(?:property="og:image"|itemprop="image")[^>]+content="([^"]+)"/));
      if (!out.title) out.title = pick(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/).replace(/_哔哩哔哩.*$/, '');
      if (!out.artist) out.artist = pick(/<meta[^>]+name="author"[^>]+content="([^"]+)"/);
      if (!out.duration) out.duration = +pick(/"duration":(\d+)/) || 0;
    } catch (e) {}
  }
  return out;
}
async function resolveLink(raw) {
  let url = (String(raw || '').match(/https?:\/\/[^\s\u3000]+/) || [''])[0];
  if (!url) return null;
  if (/(b23\.tv|163cn\.tv)/.test(url)) {
    try { const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 6000); const r = await fetch(url, { headers: UA, redirect: 'follow', signal: ctl.signal }); clearTimeout(to); url = r.url || url; } catch (e) {}
  }
  let m;
  if (/music\.163\.com/.test(url) && ((m = url.match(/song\S*?[?&]id=(\d+)/)) || (m = url.match(/song\/(\d+)/))))
    return { platform: 'netease', mediaId: m[1], title: '', artist: '', cover: '', duration: 0, link: url, ...(await neteaseMeta(m[1])) };
  if (/bilibili\.com|b23\.tv/.test(url) && (m = url.match(/BV[0-9A-Za-z]{10}/)))
    return { platform: 'bili', mediaId: m[0], title: '', artist: '', cover: '', duration: 0, link: url, ...(await biliMeta(m[0])) };
  return null;
}
// 补全之前没取到的封面/时长
async function fillMeta(rows) {
  const miss = rows.filter(r => r.platform && (!r.duration || !r.cover)).slice(0, 5);
  await Promise.all(miss.map(async r => {
    const m = r.platform === 'bili' ? await biliMeta(r.media_id) : await neteaseMeta(r.media_id);
    const nr = { title: r.title || m.title || '', artist: r.artist || m.artist || '', cover: r.cover || m.cover || '', duration: r.duration || m.duration || 0 };
    if (nr.cover !== r.cover || nr.duration !== r.duration || nr.title !== r.title) {
      db.prepare('update radio set title = ?, artist = ?, cover = ?, duration = ? where id = ?').run(nr.title, nr.artist, nr.cover, nr.duration, r.id);
      Object.assign(r, nr);
    }
  }));
  return rows;
}
function radioOut(r, me) {
  const a = getUser(r.author), see = !r.anon || r.author === me || isAdmin(me);
  return { id: r.id, type: r.type, typeLabel: RADIO_TYPES[r.type] || '', anon: !!r.anon,
    author: see ? r.author : '', authorName: r.anon ? (see && a ? '匿名 · ' + a.name : '匿名投稿') : (a ? a.name : r.author), authorAvatar: r.anon ? '' : (a && a.avatar) || '', authorBadge: r.anon || !a ? '' : pub(a).badgeName,
    text: r.text || '', image: r.image || '', link: r.link || '', platform: r.platform || '', mediaId: r.media_id || '', title: r.title || '', artist: r.artist || '', cover: r.cover || '', duration: r.duration || 0,
    day: r.day, createdAt: r.created_at, mine: r.author === me };
}
api.get('/radio/today', auth, async (req, res) => { const rows = await fillMeta(db.prepare('select * from radio where day = ? order by id').all(today())); res.json({ day: today(), items: rows.map(r => radioOut(r, req.user.id)) }); });
api.get('/radio/past', auth, async (req, res) => { const rows = await fillMeta(db.prepare('select * from radio order by id desc limit 200').all()); res.json({ items: rows.map(r => radioOut(r, req.user.id)) }); });
api.post('/radio', auth, limit('radio'), async (req, res) => {
  const b = req.body, type = RADIO_TYPES[b.type] ? b.type : '', text = str(b.text, 500), image = b.image || '';
  if (!type) return bad(res, '请选择投稿类型');
  if (image && !isImg(image)) return bad(res, '图片格式或大小不支持');
  let media = null;
  if (type !== 'say') {
    media = await resolveLink(b.link);
    if (!media) return bad(res, '请粘贴有效的 bilibili 或网易云音乐链接');
  } else if (!text && !image) return bad(res, '请填写投稿内容');
  const m = media || {};
  const r = db.prepare('insert into radio(author, anon, type, text, image, link, platform, media_id, title, artist, cover, duration, day, created_at) values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, b.anon ? 1 : 0, type, text, image, m.link || '', m.platform || '', m.mediaId || '', m.title || '', m.artist || '', m.cover || '', m.duration || 0, today(), Date.now());
  const newTitles = [
    ...award(req.user, 'radio', db.prepare('select count(*) n from radio where author = ?').get(req.user.id).n),
    ...(type === 'sing' ? award(getUser(req.user.id), 'sing', db.prepare("select count(*) n from radio where author = ? and type = 'sing'").get(req.user.id).n) : [])
  ];
  res.json({ item: radioOut(db.prepare('select * from radio where id = ?').get(r.lastInsertRowid), req.user.id), user: self(getUser(req.user.id)), newTitles });
});
api.delete('/radio/:id', auth, (req, res) => {
  const r = db.prepare('select * from radio where id = ?').get(+req.params.id); if (!r) return bad(res, '投稿不存在', 404);
  if (r.author !== req.user.id && !isAdmin(req.user.id)) return bad(res, '无权删除', 403);
  db.prepare('delete from radio where id = ?').run(r.id);
  res.json({ ok: true });
});

// ---- 广告 ----
const adOut = a => ({ id: a.id, text: a.text || '', image: a.image || '', link: a.link || '', once: !!a.once, createdAt: a.created_at });
api.get('/ads', auth, (req, res) => res.json({ items: db.prepare('select * from ads order by id desc').all().map(adOut) }));
api.post('/ads', auth, admin, (req, res) => {
  const text = str(req.body.text, 300), image = req.body.image || '', link = /^https?:\/\//.test(req.body.link || '') ? str(req.body.link, 500) : '';
  if (!text && !image) return bad(res, '请填写广告内容');
  if (image && !isImg(image)) return bad(res, '图片格式或大小不支持');
  db.prepare('insert into ads(text, image, link, once, created_at) values(?, ?, ?, ?, ?)').run(text, image, link, req.body.once ? 1 : 0, Date.now());
  res.json({ items: db.prepare('select * from ads order by id desc').all().map(adOut) });
});
api.delete('/ads/:id', auth, admin, (req, res) => {
  db.prepare('delete from ads where id = ?').run(+req.params.id);
  res.json({ items: db.prepare('select * from ads order by id desc').all().map(adOut) });
});

// ---- 标识牌（由档案里的解谜 / 培训页面触发）----
api.post('/achv', auth, (req, res) => {
  if (req.body.key === 'ofail') {
    db.prepare('update users set orbit_fails = coalesce(orbit_fails, 0) + 1 where id = ?').run(req.user.id);
    const u = getUser(req.user.id), have = owned(u), n = u.orbit_fails || 0;
    const fresh = TITLES.filter(t => t.kind === 'ofail' && n >= t.n && !have.includes(t.key));
    if (fresh.length) db.prepare('update users set titles = ? where id = ?').run(JSON.stringify([...have, ...fresh.map(t => t.key)]), u.id);
    return res.json({ user: self(getUser(u.id)), newTitles: fresh.map(t => ({ name: t.name, cond: t.cond })) });
  }
  const t = TITLES.find(x => (x.kind === 'secret' || x.kind === 'orbit') && x.key === req.body.key); if (!t) return bad(res, '无效');
  const u = getUser(req.user.id), have = owned(u);
  if (have.includes(t.key)) return res.json({ user: self(u), newTitles: [] });
  db.prepare('update users set titles = ? where id = ?').run(JSON.stringify([...have, t.key]), u.id);
  res.json({ user: self(getUser(u.id)), newTitles: [{ name: t.name, cond: t.cond }] });
});

// ---- 错误日志 ----
api.post('/client-error', limit('cerr', 20), (req, res) => {
  const b = req.body || {};
  logError('client', str(b.where, 200), { message: str(b.msg, 500), stack: str(b.stack, 2000) }, str(b.user, 20));
  res.json({ ok: true });
});
api.get('/admin/errors', auth, admin, (req, res) => res.json({ items: db.prepare('select * from errors order by id desc limit 200').all().map(e => ({ id: e.id, t: e.t, src: e.src, where: e.where_, user: e.user_id, msg: e.msg, stack: e.stack })) }));
api.delete('/admin/errors', auth, admin, (req, res) => { db.prepare('delete from errors').run(); res.json({ items: [] }); });

app.use('/api', api);
app.use((err, req, res, next) => {
  logError('server', req.method + ' ' + req.originalUrl, err, req.user && req.user.id);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.type === 'entity.too.large' ? '内容过大' : '服务器内部错误' });
});
process.on('uncaughtException', e => { logError('crash', 'uncaughtException', e); console.error(e); });
process.on('unhandledRejection', e => { logError('crash', 'unhandledRejection', e); console.error(e); });
app.listen(PORT, () => console.log('DA server on :' + PORT));
