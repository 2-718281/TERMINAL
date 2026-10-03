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
const DISPATCH_NAME = { 'DA-0409': '弘泽', 'DA-0042': '萨沙·瓦格纳', 'DA-1978': 'Kharon' };
const dispLabel = id => { if (!DISPATCH_NAME[id]) return ''; const u = db.prepare('select dept from users where id = ?').get(id); return ((u && u.dept) || ADMIN_DEPT[id] || '') + '部长 · ' + DISPATCH_NAME[id]; };
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
addCol('users', 'stats', "text default ''");
addCol('users', 'skills', "text default ''");
addCol('users', 'sane', 'integer default 1');
addCol('users', 'hp', 'integer');
addCol('users', 'er', 'integer default 0');
addCol('users', 'personal', "text default '[]'");
addCol('users', 'gained', "text default '[]'");
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
const statsOf = u => { try { const s = JSON.parse(u.stats || 'null'); return s && typeof s === 'object' ? s : null; } catch (e) { return null; } };
const skillsOf = u => { try { const s = JSON.parse(u.skills || 'null'); return Array.isArray(s) && s.length === 3 ? s : null; } catch (e) { return null; } };
const listOf = (u, k) => { try { const a = JSON.parse((u && u[k]) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const self = u => ({ ...pub(u), idCard: u.idcard || '', personal: listOf(u, 'personal'), gained: listOf(u, 'gained'), stats: statsOf(u), skills: skillsOf(u), sane: u.sane !== 0, hp: u.hp == null ? null : u.hp });
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

// ---- Field ops (先锋舰匹配房间, in-memory) ----
const STAT_KEYS = [['力量', 'str'], ['体质', 'con'], ['体型', 'siz'], ['意志', 'pow'], ['敏捷', 'dex'], ['幸运', 'luck']];
const hasStats = s => !!s && STAT_KEYS.every(([, k]) => Number.isInteger(+s[k]) && +s[k] > 0);
const carryOf = s => s && Number.isFinite(+s.str) ? Math.max(0, Math.floor(+s.str / 20)) : 0;
const FIELD = { 1: { members: {}, started: false }, 2: { members: {}, started: false } };
const FIELD_BOTS = [];
function fieldBots(id) {
  const r = FIELD[id]; if (!r || r.started) return;
  FIELD_BOTS.forEach(b => { if (!r.members[b.id] && Object.keys(r.members).length < 8) r.members[b.id] = { ready: true, seen: Date.now(), items: b.items.slice(), itemsDone: true, bot: { ...JSON.parse(JSON.stringify(b)), sane: true } }; });
}
function fieldRoom(id) {
  const r = FIELD[id]; if (!r) return null; const now = Date.now();
  Object.keys(r.members).forEach(x => { if (!r.started && !r.members[x].bot && now - r.members[x].seen > 20000) delete r.members[x]; });
  if (!Object.keys(r.members).length) r.started = false;
  return r;
}
const SKILL_LABELS = { pilot: ['飞船操控', '导航规划', '机动规避'], scan: ['物质采样', '环境解析', '异常识别'], res: ['信息重构', '物质解析', '秘文解意'], fix: ['机械修理', '零件制作', '防御维系'], med: ['医学治疗', '生理急救', '神经调谐'] };
const rollLevel = (r, v) => r <= 5 ? '大成功' : r >= 95 ? '大失败' : r <= Math.floor(v / 5) ? '极难成功' : r <= Math.floor(v / 2) ? '困难成功' : r <= v ? '常规成功' : '失败';
const MAD_TABLE = ['昏迷/昏睡', '产生回忆场景的幻觉/认为自己处于过去', '失去听力/视力/痛感', '失去对他人的信任，拒绝任何帮助', '失去空间感', '窃窃私语，发出奇怪的音节', '身体某处剧烈幻痛/失去肢体的幻觉', '对随身物品极度依赖和保护欲', '失去语言表达与书写能力', '失去记忆'];
const hpMaxOf = s => s ? Math.floor(((+s.siz || 0) + (+s.con || 0)) / 10) : 0;
function mGet(r, x) { const m = r.members[x]; if (!m) return null; if (m.bot) return { name: m.bot.name, stats: m.bot.stats, hp: m.bot.hp == null ? null : m.bot.hp, er: +m.bot.er || 0, sane: m.bot.sane !== false }; const u = getUser(x); return u ? { name: u.name, stats: statsOf(u), hp: u.hp == null ? null : u.hp, er: +u.er || 0, sane: u.sane !== 0 } : null; }
const hpNow = i => { const mx = hpMaxOf(i && i.stats); return !i || i.hp == null ? mx : Math.min(+i.hp, mx); };
function mSet(r, x, k, v) { const m = r.members[x]; if (!m) return; if (m.bot) { m.bot[k] = v; return; } const col = { hp: 'hp', er: 'er', sane: 'sane', stats: 'stats' }[k]; if (col) db.prepare('update users set ' + col + ' = ? where id = ?').run(k === 'stats' ? JSON.stringify(v) : k === 'sane' ? (v ? 1 : 0) : v, x); }
function memberInfo(r, x) { const m = r.members[x] || {}, b = m.bot, u = b ? null : getUser(x); return { name: b ? b.name : u ? u.name : x, stats: b ? b.stats : u ? statsOf(u) : null, skills: b ? b.skills : u ? skillsOf(u) : null }; }
function gameLog(r, text, kind, lv) { const g = r.game; g.seq++; g.log.push({ id: g.seq, t: Date.now(), kind, text, lv: lv || '' }); if (g.log.length > 300) g.log.shift(); }
function gameTurnLog(r) { const g = r.game, x = g.order[g.turn]; gameLog(r, '第 ' + g.round + ' 轮 · 【' + (x ? memberInfo(r, x).name : '—') + '】的回合', 'turn'); }
function gameStart(r) {
  const ids = Object.keys(r.members).map(x => ({ x, dex: +((memberInfo(r, x).stats || {}).dex) || 0, k: Math.random() })).sort((a, c) => c.dex - a.dex || a.k - c.k).map(o => o.x);
  const hp = {}; ids.forEach(x => { const s = memberInfo(r, x).stats || {}; hp[x] = Math.floor(((+s.siz || 0) + (+s.con || 0)) / 10); });
  r.game = { order: ids, turn: 0, round: 1, state: 'act', pending: null, log: [], seq: 0, hp, mad: {}, pendMad: {}, hurt: {}, hit: {} };
  gameLog(r, '行动顺序：' + ids.map(x => memberInfo(r, x).name).join(' → '), 'sys'); gameTurnLog(r);
}
function gameOut(r) { const g = r.game; if (!g) return null; return { round: g.round, turnId: g.order[g.turn] || '', order: g.order.map(x => { const i = memberInfo(r, x); return { id: x, name: i.name, dex: +((i.stats || {}).dex) || 0 }; }), state: g.state, pending: g.pending, dropped: g.dropped || [], log: g.log.slice(-150) }; }
function fieldOut(id, full) {
  const r = fieldRoom(id);
  const now = Date.now();
  return { id: +id, max: 8, started: r.started, dispatcher: r.gm && (r.started || now - r.gm.t < 30000) ? dispLabel(r.gm.id) || r.gm.id : '', members: Object.keys(r.members).map(x => {
    const m = r.members[x], b = m.bot, u = b ? null : getUser(x);
    const mi = mGet(r, x) || {}, gg = r.game || {};
    const o = { id: x, hp: hpNow(mi), hpMax: hpMaxOf(mi.stats), mad: (gg.mad || {})[x] || null, hit: (gg.hit || {})[x] || 0, loot: (gg.loot || {})[x] || [], name: b ? b.name : u ? u.name : x, avatar: u ? u.avatar || '' : '', ready: !!m.ready, itemsDone: !!m.itemsDone, items: m.items || [], temps: m.temps || [], lootCarry: m.lootCarry || [], bot: !!b, dispName: dispLabel(x), sane: b ? b.sane !== false : !!u && u.sane !== 0 };
    if (full) { o.realName = b ? '测试账号' : (ROSTER[x] && ROSTER[x].name) || ''; o.stats = b ? b.stats : u ? statsOf(u) : null; o.skills = b ? b.skills : u ? skillsOf(u) : null; o.dept = b ? b.dept : u ? u.dept || '' : ''; o.er = mi.er || 0; o.pendMad = !!(gg.pendMad || {})[x]; }
    return o;
  }), game: gameOut(r) };
}
api.post('/field/stats', auth, (req, res) => {
  const u = req.user; if (hasStats(statsOf(u))) return bad(res, '属性已登记，如需修改请联系调度', 409);
  const st = {}, b = (req.body && req.body.stats) || {};
  for (const [label, k] of STAT_KEYS) { const v = +b[k]; if (!Number.isInteger(v) || v < 1 || v > 100) return bad(res, label + ' 需为 1–100 的整数'); st[k] = v; }
  const sum = Object.values(st).reduce((a, c) => a + c, 0); if (!isAdmin(u.id) && sum !== 360) return bad(res, '六项属性总和须为 360（当前 ' + sum + '）');
  const personal = (Array.isArray(req.body.personal) ? req.body.personal : []).map(x => str(x, 30)).filter(Boolean).slice(0, Math.floor(st.str / 20));
  db.prepare('update users set stats = ?, personal = ? where id = ?').run(JSON.stringify(st), JSON.stringify(personal), u.id);
  res.json({ user: self(getUser(u.id)) });
});
const SKILL_CATS = ['pilot', 'scan', 'res', 'fix', 'med'], SKILL_SLOTS = [['主专长', 180], ['副专长 I', 150], ['副专长 II', 150]];
api.post('/field/skills', auth, (req, res) => {
  const u = req.user; if (skillsOf(u)) return bad(res, '技能已登记，如需修改请联系调度', 409);
  const raw = req.body && req.body.skills; if (!Array.isArray(raw) || raw.length !== 3) return bad(res, '需登记三组专长');
  const seen = new Set(), out = [];
  for (let i = 0; i < 3; i++) {
    const [title, cap] = SKILL_SLOTS[i], g = raw[i] || {};
    if (!SKILL_CATS.includes(g.cat)) return bad(res, '请为' + title + '选择技能类别');
    if (seen.has(g.cat)) return bad(res, '三组专长不能重复'); seen.add(g.cat);
    const v = (Array.isArray(g.v) ? g.v : []).map(x => +x);
    if (v.length !== 3 || v.some(x => !Number.isInteger(x) || x < 0 || x > 100)) return bad(res, title + ' 各项需为 0–100 的整数');
    const sum = v.reduce((a, b) => a + b, 0); if (!isAdmin(u.id) && sum > cap) return bad(res, title + ' 总和不能超过 ' + cap + '（当前 ' + sum + '）');
    out.push({ cat: g.cat, v });
  }
  db.prepare('update users set skills = ? where id = ?').run(JSON.stringify(out), u.id);
  res.json({ user: self(getUser(u.id)) });
});
api.get('/field/mine', auth, (req, res) => {
  const me = req.user.id; let member = 0, started = false, gmRoom = 0;
  Object.keys(FIELD).forEach(id => { const r = fieldRoom(id); if (r.members[me]) { member = +id; started = r.started; } if (r.started && r.gm && r.gm.id === me) gmRoom = +id; });
  res.json({ member, started, gmRoom });
});
api.get('/field/rooms', auth, (req, res) => res.json({ max: 8, rooms: Object.keys(FIELD).map(id => { const r = fieldRoom(id); return { id: +id, n: Object.keys(r.members).length, started: r.started }; }) }));
api.get('/field/rooms/:id', auth, (req, res) => {
  const r = fieldRoom(req.params.id); if (!r) return bad(res, '无效舰船', 404);
  if (r.members[req.user.id]) r.members[req.user.id].seen = Date.now();
  if (isAdmin(req.user.id) && req.query.gm) r.gm = { id: req.user.id, t: Date.now() };
  res.json({ room: fieldOut(req.params.id, isAdmin(req.user.id)) });
});
api.post('/field/rooms/:id/join', auth, (req, res) => {
  const id = req.params.id, r = fieldRoom(id), me = req.user.id; if (!r) return bad(res, '无效舰船', 404);
  if (!hasStats(statsOf(req.user))) return bad(res, '请先登记属性', 403);
  if (!skillsOf(req.user)) return bad(res, '请先登记技能', 403);
  if (Object.keys(FIELD).some(x => x !== id && FIELD[x].started && FIELD[x].members[me])) return bad(res, '你正在外勤任务中', 409);
  if (!r.members[me]) {
    if (r.started) return bad(res, '该舰已启航', 409);
    if (Object.keys(r.members).length >= 8) return bad(res, '该舰已满员', 409);
    Object.keys(FIELD).forEach(x => { if (x !== id) delete FIELD[x].members[me]; });
    r.members[me] = { ready: false, seen: Date.now(), items: [], itemsDone: false };
  }
  r.members[me].seen = Date.now();
  res.json({ room: fieldOut(id) });
});
api.post('/field/rooms/:id/leave', auth, (req, res) => { const r = fieldRoom(req.params.id); if (r && !r.started) { delete r.members[req.user.id]; fieldRoom(req.params.id); } res.json({ ok: true }); });
api.post('/field/rooms/:id/items', auth, (req, res) => {
  const r = fieldRoom(req.params.id), m = r && r.members[req.user.id]; if (!m) return bad(res, '你不在该舰上', 403);
  if (r.started) return bad(res, '该舰已启航', 409);
  const cap = carryOf(statsOf(req.user)), list = (Array.isArray(req.body.items) ? req.body.items : []).map(x => typeof x === 'string' ? { name: str(x, 30), temp: true } : { name: str((x || {}).name, 30), temp: !!(x || {}).temp }).filter(x => x.name);
  if (list.length > cap) return bad(res, '最多携带 ' + cap + ' 件');
  const bag = [...listOf(req.user, 'personal'), ...listOf(req.user, 'gained')];
  for (const x of list) if (!x.temp) { const i = bag.indexOf(x.name); if (i < 0) return bad(res, '背包中没有【' + x.name + '】'); bag.splice(i, 1); }
  m.items = list.map(x => x.name); m.temps = list.filter(x => x.temp).map(x => x.name); m.itemsDone = true; m.ready = false; m.seen = Date.now();
  res.json({ room: fieldOut(req.params.id) });
});
api.post('/field/rooms/:id/ready', auth, (req, res) => {
  const r = fieldRoom(req.params.id), m = r && r.members[req.user.id]; if (!m) return bad(res, '你不在该舰上', 403);
  if (r.started) return bad(res, '该舰已启航', 409);
  if (req.body.ready && !m.itemsDone) return bad(res, '请先完成随身物品登记', 409);
  m.ready = !!req.body.ready; m.seen = Date.now(); res.json({ room: fieldOut(req.params.id) });
});
api.post('/field/rooms/:id/confirm', auth, admin, (req, res) => {
  const r = fieldRoom(req.params.id); if (!r) return bad(res, '无效舰船', 404);
  const ms = Object.values(r.members); if (!ms.length || ms.some(x => !x.ready)) return bad(res, '全员准备后才能确认', 409);
  r.started = true; r.gm = { id: req.user.id, t: Date.now() }; gameStart(r); res.json({ room: fieldOut(req.params.id, true) });
});
api.post('/field/rooms/:id/edit', auth, admin, (req, res) => {
  const r = fieldRoom(req.params.id), b = req.body || {}, m = r && r.members[b.uid]; if (!m) return bad(res, '该成员不在舰上', 404);
  const st = {}; for (const [label, k] of STAT_KEYS) { const v = +((b.stats || {})[k]); if (!Number.isInteger(v) || v < 1 || v > 100) return bad(res, label + ' 需为 1–100 的整数'); st[k] = v; }
  if (!Array.isArray(b.skills) || b.skills.length !== 3) return bad(res, '需登记三组专长');
  const seen = new Set(), sk = [];
  for (let i = 0; i < 3; i++) { const g = b.skills[i] || {}, title = SKILL_SLOTS[i][0];
    if (!SKILL_CATS.includes(g.cat)) return bad(res, '请为' + title + '选择技能类别');
    if (seen.has(g.cat)) return bad(res, '三组专长不能重复'); seen.add(g.cat);
    const v = (Array.isArray(g.v) ? g.v : []).map(x => +x); if (v.length !== 3 || v.some(x => !Number.isInteger(x) || x < 0 || x > 100)) return bad(res, title + ' 各项需为 0–100 的整数');
    sk.push({ cat: g.cat, v }); }
  const items = (Array.isArray(b.items) ? b.items : []).map(x => str(x, 30)).filter(Boolean).slice(0, 10), sane = b.sane !== false;
  if (m.bot) { m.bot.stats = st; m.bot.skills = sk; m.bot.sane = sane; }
  else { if (!getUser(b.uid)) return bad(res, '用户不存在', 404); db.prepare('update users set stats = ?, skills = ?, sane = ? where id = ?').run(JSON.stringify(st), JSON.stringify(sk), sane ? 1 : 0, b.uid); }
  m.items = items; m.itemsDone = true;
  res.json({ room: fieldOut(req.params.id, true) });
});
api.post('/field/rooms/:id/act', auth, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game, me = req.user.id, b = req.body || {}; if (!g) return bad(res, '游戏未开始', 409);
  if (!r.members[me]) return bad(res, '你不在该舰上', 403);
  if (g.order[g.turn] !== me) return bad(res, '还没轮到你', 409);
  if (g.state !== 'act') return bad(res, '已有待处理的申请', 409);
  const target = str(b.target, 24), info = memberInfo(r, me), item = str(b.item, 30);
  if (item && ![...(r.members[me].items || []), ...((g.loot || {})[me] || [])].includes(item)) return bad(res, '物品不在背包中');
  if (b.kind === 'skill') { const L = SKILL_LABELS[b.cat], i = +b.idx; if (!L || !(i >= 0 && i < 3)) return bad(res, '无效技能'); const grp = (info.skills || []).find(x => x.cat === b.cat); g.pending = { uid: me, name: info.name, kind: 'skill', label: L[i], val: grp ? +grp.v[i] : 1, target, item }; }
  else if (b.kind === 'free') { if (!target && !item) return bad(res, '请填写目标或选择物品'); g.pending = { uid: me, name: info.name, kind: 'free', target, item }; }
  else return bad(res, '无效行动');
  g.state = 'pending'; res.json({ room: fieldOut(req.params.id) });
});
api.post('/field/rooms/:id/say', auth, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game, b = req.body || {}; if (!g) return bad(res, '游戏未开始', 409);
  const text = str(b.text, 300); if (!text) return bad(res, '内容为空');
  const asGm = !!b.gm && isAdmin(req.user.id); if (!asGm && !r.members[req.user.id]) return bad(res, '你不在该舰上', 403);
  if (asGm) gameLog(r, '【' + (dispLabel(req.user.id) || '调度') + '】：' + text, 'gm'); else gameLog(r, '【' + memberInfo(r, req.user.id).name + '】：' + text, 'rp', g.order[g.turn] !== req.user.id ? 'off' : '');
  res.json({ room: fieldOut(req.params.id, isAdmin(req.user.id)) });
});
api.post('/field/rooms/:id/move', auth, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game, me = req.user.id, m = r && r.members[me]; if (!g) return bad(res, '游戏未开始', 409); if (!m) return bad(res, '你不在该舰上', 403);
  const L = (g.loot = g.loot || {})[me] = g.loot[me] || [], i = +(req.body || {}).idx, item = L[i]; if (!item) return bad(res, '物品不存在');
  if ((m.items || []).length >= carryOf(statsOf(req.user))) return bad(res, '随身背包已满');
  L.splice(i, 1); m.items = [...(m.items || []), item]; m.lootCarry = [...(m.lootCarry || []), item];
  res.json({ room: fieldOut(req.params.id) });
});
api.post('/field/rooms/:id/cancel', auth, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game; if (!g) return bad(res, '游戏未开始', 409);
  if (g.state === 'pending' && g.pending && g.pending.uid === req.user.id) { g.pending = null; g.state = 'act'; }
  res.json({ room: fieldOut(req.params.id) });
});
api.post('/field/rooms/:id/judge', auth, admin, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game; if (!g) return bad(res, '游戏未开始', 409);
  if (g.state !== 'pending' || !g.pending) return bad(res, '没有待处理的申请', 409);
  const p = g.pending, on = p.target ? '对【' + p.target + '】' : '';
  if (!(req.body || {}).ok) { gameLog(r, '调度驳回了【' + p.name + '】的行动申请', 'deny'); g.pending = null; g.state = 'act'; }
  else if (p.kind === 'skill') { if (p.text) gameLog(r, '【' + p.name + '】：' + p.text, 'free'); const bb = req.body || {}, bo = Math.max(0, Math.min(2, +bb.bonus || 0)), pe = Math.max(0, Math.min(2, +bb.penalty || 0)), need = ['常规', '困难', '极难'].includes(bb.need) ? bb.need : '常规';
    const net = bo - pe, u = crypto.randomInt(0, 10), ts = Array.from({ length: 1 + Math.abs(net) }, () => crypto.randomInt(0, 10)), vals = ts.map(t => (t * 10 + u) || 100), roll = net > 0 ? Math.min(...vals) : net < 0 ? Math.max(...vals) : vals[0], lv = rollLevel(roll, p.val);
    const expr = net === 0 ? 'D100=' + roll : (net > 0 ? 'b' : 'p') + Math.abs(net) + '=D100=' + vals[0] + ', [' + (net > 0 ? '奖励骰' : '惩罚骰') + ':' + ts.slice(1).join(',') + '] = ' + roll;
    const RK = { '大失败': 0, '失败': 1, '常规成功': 2, '困难成功': 3, '极难成功': 4, '大成功': 5 }, met = RK[lv] >= { '常规': 2, '困难': 3, '极难': 4 }[need];
    gameLog(r, '【' + p.name + '】' + on + (p.item ? '借助【' + p.item + '】' : '') + '进行【' + p.label + '】检定 · 需要等级=' + need + '\n' + expr + '/' + p.val + ' ' + lv + (need !== '常规' ? (met ? '（达成）' : '（未达成）') : ''), 'roll', met ? lv : lv === '大失败' ? '大失败' : '未达成'); g.state = 'resolved'; if (lv === '大失败') { const i = mGet(r, p.uid); if (i) mSet(r, p.uid, 'er', Math.min(100, i.er + 20)); } }
  else { if (p.text) gameLog(r, '【' + p.name + '】：' + p.text, 'free'); gameLog(r, '【' + p.name + '】' + on + (p.item ? '使用了【' + p.item + '】' : '进行了人为干涉'), p.item ? 'item' : 'sys'); g.state = 'resolved'; }
  res.json({ room: fieldOut(req.params.id, true) });
});
api.post('/field/rooms/:id/next', auth, admin, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game; if (!g) return bad(res, '游戏未开始', 409);
  g.mad = g.mad || {}; g.hit = g.hit || {}; Object.keys(g.hurt || {}).forEach(x => { g.hit[x] = (g.hit[x] || 0) + 1; }); g.hurt = {};
  Object.keys(g.pendMad || {}).forEach(x => { const t = crypto.randomInt(1, 11), dur = crypto.randomInt(1, 11); g.mad[x] = { no: t, type: MAD_TABLE[t - 1], left: dur }; gameLog(r, '【' + memberInfo(r, x).name + '】陷入疯狂 · 1d10=' + t + '【' + MAD_TABLE[t - 1] + '】（持续 ' + dur + ' 回合）', 'mad'); }); g.pendMad = {};
  g.pending = null; g.turn++;
  if (g.turn >= g.order.length) { g.turn = 0; g.round++; Object.keys(g.mad).forEach(x => { if (--g.mad[x].left <= 0) { delete g.mad[x]; mSet(r, x, 'sane', true); gameLog(r, '【' + memberInfo(r, x).name + '】的疯狂症状消退', 'sys'); } }); }
  g.state = 'act'; gameTurnLog(r);
  res.json({ room: fieldOut(req.params.id, true) });
});
api.post('/field/rooms/:id/gm', auth, admin, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game, b = req.body || {}; if (!g) return bad(res, '游戏未开始', 409);
  const i = mGet(r, b.uid); if (!i) return bad(res, '该成员不在舰上', 404);
  const nm = i.name, why = str(b.reason, 60); g.mad = g.mad || {}; g.pendMad = g.pendMad || {}; g.hurt = g.hurt || {};
  if (b.op === 'cut') {
    const n = Math.floor(+b.amount); if (!(n > 0 && n <= 100)) return bad(res, '请输入 1–100 的数值');
    if (b.key === 'hp') { const cur = hpNow(i), nv = Math.max(0, cur - n); mSet(r, b.uid, 'hp', nv); g.hurt[b.uid] = true; gameLog(r, '【' + nm + '】的 HP ' + (why ? '因为' + why : '') + '减少了' + (cur - nv) + '点。', 'hurt'); if (nv === 0) gameLog(r, '【' + nm + '】生命垂危', 'hurt'); }
    else { const S = STAT_KEYS.find(s => s[1] === b.key); if (!S || !i.stats) return bad(res, '无效数值'); const cur = +i.stats[b.key] || 0, nv = Math.max(0, cur - n); const ns = { ...i.stats, [b.key]: nv }; mSet(r, b.uid, 'stats', ns); if (i.hp != null) mSet(r, b.uid, 'hp', Math.min(+i.hp, hpMaxOf(ns))); gameLog(r, '【' + nm + '】的' + S[0] + (why ? '因为' + why : '') + '减少了' + (cur - nv) + '点。', 'hurt'); }
  } else if (b.op === 'sane') {
    if (b.value) { const was = !!g.mad[b.uid] || !!g.pendMad[b.uid] || !i.sane; mSet(r, b.uid, 'sane', true); delete g.mad[b.uid]; delete g.pendMad[b.uid]; if (was) gameLog(r, '【' + nm + '】恢复了理智', 'sys'); }
    else { mSet(r, b.uid, 'sane', false); if (!g.mad[b.uid]) g.pendMad[b.uid] = true; }
  } else if (b.op === 'er') mSet(r, b.uid, 'er', Math.max(0, Math.min(100, Math.round(+b.value || 0))));
  else if (b.op === 'erode') {
    if (b.er != null) mSet(r, b.uid, 'er', Math.max(0, Math.min(100, Math.round(+b.er || 0))));
    if (b.mad && !g.mad[b.uid]) { const t = crypto.randomInt(1, 11), dur = crypto.randomInt(1, 11); mSet(r, b.uid, 'sane', false); delete g.pendMad[b.uid]; g.mad[b.uid] = { no: t, type: MAD_TABLE[t - 1], left: dur }; gameLog(r, '【' + nm + '】陷入疯狂 · 1d10=' + t + '【' + MAD_TABLE[t - 1] + '】（持续 ' + dur + ' 回合）', 'mad'); }
  }
  else if (b.op === 'give') { const item = str(b.item, 30); if (!item) return bad(res, '请输入物品名称'); g.loot = g.loot || {}; const L = g.loot[b.uid] = g.loot[b.uid] || []; const cap = Math.floor((+((i.stats || {}).str) || 0) / 20); if (L.length >= cap) return bad(res, '获得栏位已满（' + cap + '）'); L.push(item); gameLog(r, '【' + nm + '】获得了【' + item + '】', 'item'); }
  else if (b.op === 'drop') { g.loot = g.loot || {}; const m = r.members[b.uid]; const arr = b.src === 'loot' ? (g.loot[b.uid] = g.loot[b.uid] || []) : (m.items = m.items || []); const item = arr[+b.idx]; if (!item) return bad(res, '物品不存在'); arr.splice(+b.idx, 1); if (b.src !== 'loot' && !m.bot) { const ti = (m.temps || []).indexOf(item), lci = (m.lootCarry || []).indexOf(item); if (ti >= 0) m.temps.splice(ti, 1); else if (lci >= 0) m.lootCarry.splice(lci, 1); else { const uu = getUser(b.uid); if (uu) { const gd = listOf(uu, 'gained'), ps = listOf(uu, 'personal'), gi = gd.indexOf(item); if (gi >= 0) { gd.splice(gi, 1); db.prepare('update users set gained = ? where id = ?').run(JSON.stringify(gd), b.uid); } else { const pi = ps.indexOf(item); if (pi >= 0) { ps.splice(pi, 1); db.prepare('update users set personal = ? where id = ?').run(JSON.stringify(ps), b.uid); } } } } } g.dropped = g.dropped || []; g.dropped.push({ uid: b.uid, name: nm, item, src: b.src, round: g.round }); gameLog(r, '【' + nm + '】的【' + item + '】被丢弃', 'item'); }
  else return bad(res, '无效操作');
  res.json({ room: fieldOut(req.params.id, true) });
});
api.post('/field/rooms/:id/again', auth, admin, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game; if (!g) return bad(res, '游戏未开始', 409);
  if (g.state !== 'resolved') return bad(res, '当前无法继续', 409);
  g.pending = null; g.state = 'act'; res.json({ room: fieldOut(req.params.id, true) });
});
api.post('/field/rooms/:id/end', auth, admin, (req, res) => {
  const r0 = FIELD[req.params.id]; if (!r0) return bad(res, '无效舰船', 404);
  Object.keys(r0.members).forEach(x => { const m = r0.members[x], L = [...(((r0.game || {}).loot || {})[x] || []), ...(m.lootCarry || [])]; if (m.bot || !L.length) return; const uu = getUser(x); if (uu) db.prepare('update users set gained = ? where id = ?').run(JSON.stringify([...listOf(uu, 'gained'), ...L]), x); });
  FIELD[req.params.id] = { members: {}, started: false }; res.json({ room: fieldOut(req.params.id, true) });
});
api.post('/field/rooms/:id/reset', auth, admin, (req, res) => {
  if (!FIELD[req.params.id]) return bad(res, '无效舰船', 404);
  FIELD[req.params.id] = { members: {}, started: false }; res.json({ room: fieldOut(req.params.id, true) });
});

app.use('/api', api);
app.use((err, req, res, next) => {
  logError('server', req.method + ' ' + req.originalUrl, err, req.user && req.user.id);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.type === 'entity.too.large' ? '内容过大' : '服务器内部错误' });
});
process.on('uncaughtException', e => { logError('crash', 'uncaughtException', e); console.error(e); });
process.on('unhandledRejection', e => { logError('crash', 'unhandledRejection', e); console.error(e); });
app.listen(PORT, () => console.log('DA server on :' + PORT));
