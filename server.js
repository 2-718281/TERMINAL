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
const dispLabel = id => DISPATCH_NAME[id] || '';
let ROSTER = {}; try { ROSTER = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'roster.json'), 'utf8')); } catch (e) {}
let NAMES = {}; const loadNames = () => { try { NAMES = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'names.json'), 'utf8')) || {}; } catch (e) { NAMES = {}; } }; loadNames(); try { require('fs').watchFile(require('path').join(__dirname, 'names.json'), { interval: 5000 }, loadNames); } catch (e) {}
const saveNames = () => { try { require('fs').writeFileSync(require('path').join(__dirname, 'names.json'), JSON.stringify(NAMES, null, 1)); } catch (e) {} };
const realName = (id, fallback) => NAMES[id] || (ROSTER[id] && ROSTER[id].name) || fallback || id;
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
  T_('ofail', 'of10', 10, '飞船爆破手', '航线模拟失败 10 次'), T_('ofail', 'of20', 20, '舰桥流放者', '航线模拟失败 20 次'), T_('ofail', 'of30', 30, '驾驶部公敌', '航线模拟失败 30 次'),
  T_('spp', 'sp1', 0, '研究部大胜利', '信号处理数据库 · 完成 TX-01、TX-02 破译'), T_('spp', 'sp1x', 0, '研究部行不行啊？', '信号处理数据库 · 以非研究部身份完成 TX-01、TX-02 破译'), T_('spp', 'sp2', 0, '赫尔墨斯的门徒', '信号处理数据库 · 未完成基准校准即完成 TX-01、TX-02 破译与全部索引对应'), T_('spp', 'sp3', 0, '归祭', ''), T_('spp', 'sp4', 0, '方程末端的红发', ''),
  T_('spcal', 'sp6', 11, '失去研究部访问权', '基准校准阶段提交错误超过 10 次'), T_('sptx', 'sp7', 11, '超算算力滥用者', '破译提交错误超过 10 次'), T_('repair', 'rp1', 0, '耗材的守护者', '防御线路接驳 · 未申请任何耗材且零浪费完成全部工单'), T_('repair', 'rp2', 0, '这里有后勤部！', '防御线路接驳 · 完成全部工单'), T_('repair', 'rp3', 0, '后勤部仓库里的老鼠', '防御线路接驳 · 耗尽耗材 3 次以上且未完成工单'), T_('secret', 'rp4', 0, '于莱夫卡斯的悬崖旁', '')
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
create table if not exists vids(id integer primary key autoincrement, bvid text, link text, title text, artist text, cover text, duration integer, tags text, note text, created_at integer);
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
addCol('users', 'sp_cal', 'integer default 0');
addCol('users', 'sp_tx', 'integer default 0');
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
// 解谜账号：上一次探险留下的实验员终端（不会覆盖已存在的数据）
{ const GID = 'DA-0822', GPW = 'f421112666'; db.prepare('insert or ignore into allowed_ids values(?)').run(GID);
  if (!db.prepare('select 1 from users where id = ?').get(GID)) { const salt = crypto.randomBytes(16).toString('hex');
    db.prepare("insert into users(id, salt, hash, name, title, avatar, created_at, dept, position, gender, birthday, badge, titles) values(?, ?, ?, ?, '', '', ?, '', '员工', '', '', 'base', '[]')").run(GID, salt, hashPw(GPW, salt).toString('hex'), GID, Date.now()); } }
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
const wall = u => { const o = owned(u); return [{ key: 'base', name: deptLabel(u.dept) + (u.position || '员工'), cond: '注册即获得', owned: true }, ...TITLES.filter(t => o.includes(t.key) || !(t.key === 'sp1' && u.dept !== '研究部') && !(t.key === 'sp1x' && u.dept === '研究部')).map(t => ({ key: t.key, name: t.name, cond: t.cond, owned: o.includes(t.key) }))]; };
const pub = u => {
  const w = wall(u), b = w.find(t => t.owned && t.key === u.badge) || w[0];
  return { id: u.id, name: u.name, realName: realName(u.id, u.name), avatar: u.avatar || '', createdAt: u.created_at, dept: u.dept || '', position: u.position || '员工', gender: u.gender || '', birthday: (u.birthday || '').slice(-5), age: u.age || '', isAdmin: isAdmin(u.id), badge: b.key, badgeName: b.name, titles: w };
};
const getUser = id => db.prepare('select * from users where id = ?').get(id);
const getPost = id => db.prepare('select * from posts where id = ?').get(id);
const postCount = id => db.prepare('select count(*) n from posts where author = ?').get(id).n;

const app = express();
app.use(express.json({ limit: '12mb' }));
app.use((req, res, next) => { try { convertBody(req.body, 0); } catch (e) {} next(); });
app.use('/moon', express.static(path.join(__dirname, 'moon'), { maxAge: 0, etag: true, setHeaders: r => r.set('Cache-Control', 'no-cache') }));
app.use('/orbit', express.static(path.join(__dirname, 'orbit'), { maxAge: 0, etag: true, setHeaders: r => r.set('Cache-Control', 'no-cache') }));
app.use('/repair', express.static(path.join(__dirname, 'repair'), { maxAge: 0, etag: true, setHeaders: r => r.set('Cache-Control', 'no-cache') }));
app.use('/recruit', express.static(path.join(__dirname, 'recruit'), { maxAge: 0, etag: true, setHeaders: r => r.set('Cache-Control', 'no-cache') }));
app.use('/sppdb/fonts', express.static(path.join(__dirname, 'fonts'), { immutable: true, maxAge: '365d', index: false }));
app.use('/sppdb', express.static(path.join(__dirname, 'sppdb'), { maxAge: 0, etag: true, setHeaders: r => r.set('Cache-Control', 'no-cache') }));
app.use('/fonts', express.static(path.join(__dirname, 'fonts'), { immutable: true, maxAge: '365d', index: false }));
app.use('/media', express.static(MEDIA, { immutable: true, maxAge: '365d', index: false, dotfiles: 'deny' }));
const INDEX = [path.join(__dirname, 'public', 'index.html'), path.join(__dirname, 'index.html')].find(f => fs.existsSync(f));
app.get(['/', '/index.html'], (req, res) => { if (!INDEX) return res.status(404).send('index.html not found'); res.set('Cache-Control', 'no-cache'); res.sendFile(INDEX); });
const STATIC = { '/manifest.webmanifest': 'application/manifest+json', '/sw.js': 'text/javascript', '/icon-192.png': 'image/png', '/icon-512.png': 'image/png', '/apple-touch-icon.png': 'image/png', '/laugh.wav': 'audio/wav' };
Object.entries(STATIC).forEach(([u, type]) => app.get(u, (req, res) => {
  const f = path.join(__dirname, u.slice(1)); if (!fs.existsSync(f)) return res.status(404).end();
  res.type(type); if (u === '/sw.js') res.set('Cache-Control', 'no-cache'); res.sendFile(f);
}));
const api = express.Router();
const GHOST = 'DA-0822';
api.use((req, res, next) => {
  const send = res.json.bind(res);
  res.json = body => {
    try {
      const p = req.path || '', me = req.user && req.user.id;
      if (!body || typeof body !== 'object' || /^\/(auth|me)(\/|$)/.test(p) || /^\/radio/.test(p)) return send(body);
      if (me === GHOST) {
        if (!/^\/(posts|notifs)/.test(p)) return send(body);
        const gw = v => { if (Array.isArray(v)) return v.filter(x => !(x && typeof x === 'object' && (('author' in x && x.author !== me) || ('actor' in x && x.actor !== me)))).map(gw); if (v && typeof v === 'object') for (const k of Object.keys(v)) v[k] = gw(v[k]); return v; };
        return send(gw(body));
      }
      const walk = v => { if (Array.isArray(v)) return v.filter(x => !(x && typeof x === 'object' && (x.id === GHOST || x.author === GHOST || x.actor === GHOST))).map(walk); if (v && typeof v === 'object') for (const k of Object.keys(v)) { if (k === GHOST) delete v[k]; else v[k] = walk(v[k]); } return v; };
      return send(walk(body));
    } catch (e) { return send(body); }
  };
  next();
});

function auth(req, res, next) {
  const t = (req.get('authorization') || '').replace(/^Bearer /, '');
  const s = t && db.prepare('select user_id from sessions where token = ?').get(t);
  const u = s && getUser(s.user_id);
  if (!u) return bad(res, '未登录', 401);
  req.user = u; CUR_VIEWER = u.id; next();
}
let CUR_VIEWER = '';
const admin = (req, res, next) => isAdmin(req.user.id) ? next() : bad(res, '需要管理员权限', 403);
const statsOf = u => { try { const s = JSON.parse(u.stats || 'null'); return s && typeof s === 'object' ? s : null; } catch (e) { return null; } };
const skillsOf = u => { try { const s = JSON.parse(u.skills || 'null'); return Array.isArray(s) && s.length === 3 ? s : null; } catch (e) { return null; } };
const listOf = (u, k) => { try { const a = JSON.parse((u && u[k]) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const self = u => ({ ...pub(u), realName: realName(u.id, u.name), idCard: u.idcard || '', personal: listOf(u, 'personal'), gained: listOf(u, 'gained'), stats: statsOf(u), skills: skillsOf(u), sane: u.sane !== 0, hp: u.hp == null ? null : u.hp });
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
  return { id: p.id, author: p.author, authorDead: !!(a && a.dead), authorName: a ? a.name : p.author, authorAvatar: a ? a.avatar || '' : '', authorBadge: a ? pub(a).badgeName : '', text: p.text, image: p.image || '', images: postImages(p), createdAt: p.created_at, likeCount, liked, reported, faved, comments };
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

let GFX = { hit: 0, alarm: false, deep: false }; try { const r0 = db.prepare("select v from meta where k = 'gfx'").get(); if (r0) GFX = { ...GFX, ...JSON.parse(r0.v) }; } catch (e) {}
api.post('/admin/gfx', auth, admin, (req, res) => { const k = (req.body || {}).k; if (k === 'hit') GFX.hit = (GFX.hit || 0) + 1; else if (k === 'alarm' || k === 'deep') GFX[k] = !GFX[k]; else return bad(res, '无效演出'); db.prepare("insert or replace into meta values('gfx', ?)").run(JSON.stringify(GFX)); res.json({ fx: GFX }); });
const BUILD_FILES = ['index.html', 'public/index.html', 'moon/index.html', 'orbit/index.html', 'repair/index.html', 'sppdb/index.html', 'recruit/index.html'];
let BUILD = '', BUILD_AT = 0;
const buildId = () => { if (Date.now() - BUILD_AT < 10000 && BUILD) return BUILD; BUILD_AT = Date.now(); BUILD = BUILD_FILES.map(f => { try { return Math.floor(fs.statSync(path.join(__dirname, f)).mtimeMs).toString(36); } catch (e) { return '0'; } }).join('.'); return BUILD; };
api.get('/pulse', auth, (req, res) => res.json({
  now: Date.now(), build: buildId(), fx: GFX, dead: !!(getUser(req.user.id) || {}).dead,
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
api.patch('/announcements/:id', auth, admin, (req, res) => {
  const a = db.prepare('select id from announcements where id = ?').get(+req.params.id); if (!a) return bad(res, '公告不存在', 404);
  const title = str(req.body.title, 60), body = str(req.body.body, 1000); if (!title) return bad(res, '请输入公告标题');
  db.prepare('update announcements set title = ?, body = ? where id = ?').run(title, body, a.id);
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
api.get('/admin/users/:id/items', auth, admin, (req, res) => { const u = getUser(req.params.id); if (!u) return bad(res, '用户不存在', 404); res.json({ personal: listOf(u, 'personal'), gained: listOf(u, 'gained') }); });
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
  if (typeof b.rpName === 'string') { const rp = str(b.rpName, 24); if (rp && rp !== ((ROSTER[u.id] && ROSTER[u.id].name) || f.name)) NAMES[u.id] = rp; else delete NAMES[u.id]; saveNames(); }
  if (b.password) {
    if (String(b.password).length < 6) return bad(res, '新密码至少 6 位');
    f.salt = crypto.randomBytes(16).toString('hex'); f.hash = hashPw(b.password, f.salt).toString('hex');
    db.prepare('delete from sessions where user_id = ?').run(u.id);
  }
  for (const k of ['personal', 'gained']) if (Array.isArray(b[k])) db.prepare('update users set ' + k + ' = ? where id = ?').run(JSON.stringify(b[k].map(x => str(x, 30)).filter(Boolean).slice(0, 20)), u.id);
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
const vidOut = r => ({ id: r.id, bvid: r.bvid, link: r.link, title: r.title, artist: r.artist, cover: r.cover, duration: r.duration || 0, tags: (() => { try { return JSON.parse(r.tags || '[]'); } catch (e) { return []; } })(), note: r.note || '', createdAt: r.created_at });
const vidList = () => db.prepare('select * from vids order by id desc').all().map(vidOut);
api.get('/vids', auth, (req, res) => res.json({ items: vidList() }));
api.post('/vids', auth, admin, async (req, res) => {
  const b = req.body || {}, m = await resolveLink(b.link);
  if (!m || m.platform !== 'bili') return bad(res, '请粘贴有效的 bilibili 视频链接');
  const tags = [...new Set(String(b.tags || '').split(/[\s,，、#]+/).map(x => x.trim().slice(0, 16)).filter(Boolean))].slice(0, 6);
  const title = str(b.title, 80) || m.title || m.mediaId;
  if (b.cover && !isImg(b.cover)) return bad(res, '封面图片格式或大小不支持');
  db.prepare('insert into vids(bvid, link, title, artist, cover, duration, tags, note, created_at) values(?, ?, ?, ?, ?, ?, ?, ?, ?)').run(m.mediaId, m.link || '', title, m.artist || '', b.cover || m.cover || '', m.duration || 0, JSON.stringify(tags), str(b.note, 300), Date.now());
  res.json({ items: vidList() });
});
api.delete('/vids/:id', auth, admin, (req, res) => { db.prepare('delete from vids where id = ?').run(+req.params.id); res.json({ items: vidList() }); });
api.get('/radio/today', auth, async (req, res) => { const rows = await fillMeta(db.prepare('select * from radio where day = ? order by id').all(today()).filter(r => r.author !== GHOST || req.user.id === GHOST)); res.json({ day: today(), items: rows.map(r => radioOut(r, req.user.id)) }); });
api.get('/radio/past', auth, async (req, res) => { const rows = await fillMeta(db.prepare('select * from radio order by id desc limit 200').all().filter(r => r.author !== GHOST || req.user.id === GHOST)); res.json({ items: rows.map(r => radioOut(r, req.user.id)) }); });
api.post('/radio', auth, limit('radio'), async (req, res) => {
  const b = req.body, type = RADIO_TYPES[b.type] ? b.type : '', text = str(b.text, 500), image = b.image || '';
  if (!type) return bad(res, '请选择投稿类型');
  if (req.user.id === 'DA-0822' && shipGet().gr) return bad(res, '投稿通道已关闭', 403);
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
  const SPC = { spcalfail: ['sp_cal', 'spcal'], sptxfail: ['sp_tx', 'sptx'] }[req.body.key];
  if (SPC) {
    db.prepare('update users set ' + SPC[0] + ' = coalesce(' + SPC[0] + ', 0) + 1 where id = ?').run(req.user.id);
    const u = getUser(req.user.id), have = owned(u), n = u[SPC[0]] || 0, fresh = TITLES.filter(t => t.kind === SPC[1] && n >= t.n && !have.includes(t.key));
    if (fresh.length) db.prepare('update users set titles = ? where id = ?').run(JSON.stringify([...have, ...fresh.map(t => t.key)]), u.id);
    return res.json({ user: self(getUser(u.id)), newTitles: fresh.map(t => ({ name: t.name, cond: t.cond })) });
  }
  if (['sptx12', 'sptx3', 'spword', 'sphermes'].includes(req.body.key)) {
    const u = getUser(req.user.id), have = owned(u), k = req.body.key;
    const keys = k === 'sptx3' ? ['sp3'] : k === 'spword' ? ['sp4'] : k === 'sphermes' ? ['sp2'] : [u.dept === '研究部' ? 'sp1' : 'sp1x'];
    const fresh = keys.filter(x => !have.includes(x)).map(x => TITLES.find(t => t.key === x)).filter(Boolean);
    if (fresh.length) db.prepare('update users set titles = ? where id = ?').run(JSON.stringify([...have, ...fresh.map(t => t.key)]), u.id);
    return res.json({ user: self(getUser(u.id)), newTitles: fresh.map(t => ({ name: t.name, cond: t.cond })) });
  }
  const t = TITLES.find(x => (x.kind === 'secret' || x.kind === 'orbit' || x.kind === 'repair') && x.key === req.body.key); if (!t) return bad(res, '无效');
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
// 主舰：常驻房间，不限人数，自由 RP（技能仍需调度批准）
const mkMain = () => ({ members: {}, started: true, main: true, game: { order: [], turn: 0, round: 1, state: 'act', pending: null, log: [], seq: 0, hp: {}, mad: {}, pendMad: {}, hurt: {}, hit: {} } });
FIELD[3] = mkMain();
// WEEK4 主舰：独立舰船房间（非 main）——无回合、无审批，全员自由行动
const W4_ID = '12', mkW4 = () => ({ members: {}, started: false, w4: true });
FIELD[W4_ID] = mkW4();
const w4Open = () => !!shipGet().w4;
function w4Join(r, x) { const g = r.game, m = r.members[x]; if (!g || !m || !m.itemsDone || m.away || isDead(r, x) || g.order.includes(x)) return; g.order.push(x); }
function w4Start(r) {
  const ids = Object.keys(r.members), hp = {}; ids.forEach(x => { const st = memberInfo(r, x).stats || {}; hp[x] = Math.floor(((+st.siz || 0) + (+st.con || 0)) / 10); });
  r.game = { order: ids.filter(x => !r.members[x].away), turn: 0, round: 1, free: true, state: 'act', pending: null, log: [], seq: 0, hp, mad: {}, pendMad: {}, hurt: {}, hit: {} };
  try { const sh = shipGet(), opts = ['airlock', 'rcs', 'lab', 'dock', 'farm', 'med', 'hab1', 'hab2', 'truss'].filter(m => !(sh.lost || []).includes(m) && !(sh.broken || []).includes(m)), mv = db.prepare("select id from users where loc = 'cockpit'").all(); if (opts.length) mv.forEach(u => db.prepare('update users set loc = ? where id = ?').run(opts[crypto.randomInt(0, opts.length)], u.id)); } catch (e) { logError('w4', 'cockpitClear', e); }
}
function w4Drop(r, x) { const g = r.game; if (!g) return; const i = g.order.indexOf(x); if (i >= 0) g.order.splice(i, 1); }
// 娱乐室 · 秘密投票：不计入外勤 / 舰船位置；全员自由检定，无需调度
const FUN_ID = '9', FUN_MIN = 3, FUN_MAX = 12, FUN_SEC = 300000, FUN_GAP = 6000;
const mkFun = () => ({ members: {}, started: false, fun: true, secrets: {} });
FIELD[FUN_ID] = mkFun();
const LIAR_ID = '10', mkLiar = () => ({ members: {}, started: false, fun: true, liar: true, secrets: {} });
FIELD[LIAR_ID] = mkLiar();
const BJ_ID = '11', mkBJ = () => ({ members: {}, started: false, fun: true, bj: true, secrets: {} });
FIELD[BJ_ID] = mkBJ();
// 主舰记录持久化：服务器重启后仍保留完整聊天记录与轮次
const mainSaveT = {}, mainKey = r => r.w4 ? 'w4_room' : 'main_log';
function mainSave(r) { if (r.w4) return w4Save(r); const K = mainKey(r); clearTimeout(mainSaveT[K]); mainSaveT[K] = setTimeout(() => { try { const g = r.game; db.prepare("insert or replace into kv(k, v) values(?, ?)").run(K, JSON.stringify({ all: g.all || [], seq: g.seq || 0, round: g.round || 1, fx: g.fx || {}, w4: g.w4 || null })); } catch (e) {} }, 2000); }
function w4Save(r) { clearTimeout(mainSaveT.w4); mainSaveT.w4 = setTimeout(() => { try { const g = r.game; db.prepare("insert or replace into kv(k, v) values('w4_room', ?)").run(JSON.stringify({ v: 2, started: !!r.started, members: r.started ? r.members : {}, game: g ? { ...g, log: undefined, lastSay: undefined } : null })); } catch (e) {} }, 2000); }
function w4Load() { try { const x = db.prepare("select v from kv where k = 'w4_room'").get(); if (!x) return; const d = JSON.parse(x.v); if (d.v !== 2 || !d.started || !d.game) return; const r = FIELD[W4_ID]; r.started = true; r.members = d.members || {}; Object.values(r.members).forEach(m => { m.away = true; m.seen = Date.now(); }); r.game = d.game; r.game.all = r.game.all || []; r.game.log = r.game.all.slice(-300); r.game.order = []; r.game.free = true; r.game.state = 'act'; r.game.pending = null; } catch (e) {} }
function mainLoad() { w4Load(); ['3'].forEach(id => { try { const x = db.prepare("select v from kv where k = ?").get(mainKey(FIELD[id])); if (!x) return; const d = JSON.parse(x.v), g = FIELD[id].game; g.all = Array.isArray(d.all) ? d.all : []; g.log = g.all.slice(-300); g.seq = +d.seq || (g.all.length ? g.all[g.all.length - 1].id : 0); g.round = +d.round || 1; g.fx = d.fx || {}; if (FIELD[id].w4) { g.free = true; g.state = 'act'; g.pending = null; if (d.w4) g.w4 = d.w4; } } catch (e) {} }); }
function mainClear(r) { if (r.w4) { clearTimeout(mainSaveT.w4); try { db.prepare("delete from kv where k = 'w4_room'").run(); } catch (e) {} return; } const K = mainKey(r); clearTimeout(mainSaveT[K]); try { db.prepare("delete from kv where k = ?").run(K); } catch (e) {} }
const FIELD_BOTS = [];
const GM_AS = { narr: '调度', res: '萨沙·瓦格纳', pilot: 'Kharon', log: '弘泽', nyx: '奈娅', q: '???', voice: '声音', bc: '广播' };
function fieldBots(id) {
  const r = FIELD[id]; if (!r || r.started || r.fun) return;
  FIELD_BOTS.forEach(b => { if (!r.members[b.id] && Object.keys(r.members).length < 8) r.members[b.id] = { ready: true, seen: Date.now(), items: b.items.slice(), itemsDone: true, bot: { ...JSON.parse(JSON.stringify(b)), sane: true } }; });
}
Object.keys(FIELD).forEach(fieldBots);
function fieldRoom(id) {
  const r = FIELD[id]; if (!r) return null; const now = Date.now();
  if (r.fun) return funRoom(id, r, now);
  if (r.w4 && r.started) { Object.keys(r.members).forEach(x => { const m = r.members[x], idle = now - m.seen; if (idle > 6 * 3600e3) { delete r.members[x]; w4Drop(r, x); } else if (idle > 60000 && !m.away) { m.away = true; w4Drop(r, x); } }); r.game.order.filter(x => !r.members[x] || isDead(r, x)).forEach(x => w4Drop(r, x)); Object.keys(r.members).forEach(x => w4Join(r, x)); return r; }
  if (r.main) { Object.keys(r.members).forEach(x => { const m = r.members[x], idle = now - m.seen; if (idle > 6 * 3600e3) { delete r.members[x]; mainDrop(r, x); } else if (idle > 60000 && !m.away) { m.away = true; mainDrop(r, x); } }); r.game.order.filter(x => !r.members[x]).forEach(x => mainDrop(r, x)); return r; }
  Object.keys(r.members).forEach(x => { if (!r.started && !r.members[x].bot && now - r.members[x].seen > 20000) delete r.members[x]; });
  if (!Object.keys(r.members).length) r.started = false;
  return r;
}
const SKILL_LABELS = { pilot: ['飞船操控', '导航规划', '机动规避'], scan: ['物质采样', '环境解析', '异常识别'], res: ['信息重构', '物质解析', '秘文解意'], fix: ['机械修理', '零件制作', '防御维系'], med: ['医学治疗', '生理急救', '神经调谐'] };
const rollLevel = (r, v) => r <= 5 ? '大成功' : r >= 95 ? '大失败' : r <= Math.floor(v / 5) ? '极难成功' : r <= Math.floor(v / 2) ? '困难成功' : r <= v ? '常规成功' : '失败';
const MAD_TABLE = ['昏迷/昏睡', '产生回忆场景的幻觉/认为自己处于过去', '失去听力/视力/痛感', '失去对他人的信任，拒绝任何帮助', '失去空间感', '窃窃私语，发出奇怪的音节', '身体某处剧烈幻痛/失去肢体的幻觉', '对随身物品极度依赖和保护欲', '失去语言表达与书写能力', '失去记忆'];
const madInit = (r, x) => { const g = r.game, md = g.mad[x]; md.since = (g.seq || 0) + 1; if (md.no === 8) md.bag = [...((r.members[x] || {}).items || []), ...((g.loot || {})[x] || [])]; };
const madBagLost = (r, x) => { const g = r.game, md = (g.mad || {})[x]; if (!md || md.no !== 8 || !md.bag) return false; const hv = [...((r.members[x] || {}).items || []), ...((g.loot || {})[x] || [])]; return md.bag.some(it => { const q = hv.indexOf(it); if (q < 0) return true; hv.splice(q, 1); return false; }); };
// 主舰：每一大轮开始时按当前在线、已登记物品、未死亡的成员重新按 DEX 排序；中途加入的人从下一轮开始行动
const mainOrder = r => Object.keys(r.members).filter(x => r.members[x].itemsDone && !r.members[x].away && !isDead(r, x)).map(x => ({ x, dex: +((memberInfo(r, x).stats || {}).dex) || 0, k: Math.random() })).sort((a, c) => c.dex - a.dex || a.k - c.k).map(o => o.x);
const mainReorder = r => { const g = r.game, ids = mainOrder(r), same = ids.length === g.order.length && ids.every((x, i) => x === g.order[i]); g.order = ids; if (ids.length && !same) gameLog(r, '行动顺序：' + ids.map(x => memberInfo(r, x).name).join(' → '), 'sys'); };
function mainDrop(r, x) {
  const g = r.game, i = g.order.indexOf(x); if (i < 0) return;
  g.order.splice(i, 1);
  if (g.pending && g.pending.uid === x) { g.pending = null; g.state = 'act'; }
  if (!g.order.some(y => r.members[y] && !r.members[y].away && !isDead(r, y))) { g.pending = null; g.state = 'act'; newRound(r); gameTurnLog(r); return; }
  if (i < g.turn) { g.turn--; return; }
  if (i > g.turn) return;
  g.pending = null; g.state = 'act';
  if (g.turn >= g.order.length) newRound(r);
  for (let n = 0; n < g.order.length && isDead(r, g.order[g.turn]); n++) { g.turn++; if (g.turn >= g.order.length) newRound(r); }
  gameTurnLog(r);
}
function mainJoin(r, x) {
  const g = r.game; if (g.order.includes(x) || !r.members[x] || !r.members[x].itemsDone || r.members[x].away) return;
  if (!g.order.some(y => r.members[y] && !r.members[y].away && !isDead(r, y))) { g.pending = null; g.state = 'act'; newRound(r); gameTurnLog(r); return; }
  if (!(g.joined = g.joined || {})[x]) { g.joined[x] = g.round; gameLog(r, '【' + memberInfo(r, x).name + '】接入主舰通讯，将于第 ' + (g.round + 1) + ' 轮加入行动顺序', 'sys'); }
}
const newRound = r => { const g = r.game; g.turn = 0; g.round++; if (r.main) { g.joined = {}; mainReorder(r); } else if (g.base) { g.order = g.base.filter(x => g.order.includes(x)); g.base = null; } Object.keys(g.mad).forEach(x => { if (--g.mad[x].left <= 0) { delete g.mad[x]; mSet(r, x, 'sane', true); gameLog(r, '【' + memberInfo(r, x).name + '】的疯狂症状消退', 'sys'); } }); };
const isDead = (r, x) => !!((r.game.dead || {})[x]);
const skipNow = (r, x) => isDead(r, x) || ((r.game.skip || {})[x] === r.game.round);
const stepTurn = r => { const g = r.game; g.turn++; if (g.turn >= g.order.length) newRound(r); for (let n = 0; n < g.order.length && skipNow(r, g.order[g.turn]); n++) { const x = g.order[g.turn]; if (!isDead(r, x)) gameLog(r, '【' + memberInfo(r, x).name + '】已参与协同检定，跳过本回合', 'sys'); g.turn++; if (g.turn >= g.order.length) newRound(r); } };
// 协同检定：当前行动者邀请 1–2 名本轮未行动的队友，使用行动者数值，每名协同者 +1 奖励骰；协同者本轮跳过
const COOP_BAN = ['pow', 'luck', 'con', 'siz'];
function coopList(r, me, b) {
  const g = r.game, raw = Array.isArray(b.helpers) ? [...new Set(b.helpers.map(String))] : []; if (!raw.length) return [];
  if (b.kind !== 'skill' && b.kind !== 'stat') throw new Error('只有技能或属性检定可以协同');
  if (b.kind === 'stat' && COOP_BAN.includes(b.key)) throw new Error('意志、幸运、体质、体型检定不能协同');
  if (raw.length > 2) throw new Error('最多 2 名队友协同');
  return raw.map(x => { const j = g.order.indexOf(x); if (x === me || j <= g.turn) throw new Error('只能邀请本轮还未行动的队友'); if (skipNow(r, x)) throw new Error('【' + memberInfo(r, x).name + '】本轮无法协同'); if (b.kind === 'skill') { const gr = (memberInfo(r, x).skills || []).find(y => y.cat === b.cat); if (!gr || !(+(gr.v || [])[+b.idx] > 0)) throw new Error('联合同伴中至少有一人未持有该技能'); } return { uid: x, name: memberInfo(r, x).name, ok: null }; });
}
const madSkip = r => { const g = r.game; for (let n = 0; n < g.order.length && madBagLost(r, g.order[g.turn]); n++) { gameLog(r, '【' + memberInfo(r, g.order[g.turn]).name + '】执着于失去的物品，跳过了回合', 'mad'); stepTurn(r); gameTurnLog(r); } };
const madPick = t => { const V = [['昏迷', '昏睡'], ['产生回忆场景的幻觉', '认为自己处于过去'], ['失去听力', '失去视力', '失去痛感'], null, null, null, ['身体某处剧烈幻痛', '失去肢体的幻觉']][t - 1]; return V ? V[crypto.randomInt(0, V.length)] : MAD_TABLE[t - 1]; };
const hpMaxOf = s => s ? Math.floor(((+s.siz || 0) + (+s.con || 0)) / 10) : 0;
function mGet(r, x) { const m = r.members[x]; if (!m) return null; if (m.bot) return { name: m.bot.name, stats: m.bot.stats, hp: m.bot.hp == null ? null : m.bot.hp, er: +m.bot.er || 0, sane: m.bot.sane !== false }; const u = getUser(x); return u ? { name: realName(x, u.name), stats: statsOf(u), hp: u.hp == null ? null : u.hp, er: +u.er || 0, sane: u.sane !== 0 } : null; }
const hpNow = i => { const mx = hpMaxOf(i && i.stats); return !i || i.hp == null ? mx : Math.min(+i.hp, mx); };
function mSet(r, x, k, v) { const m = r.members[x]; if (!m) return; if (m.bot) { m.bot[k] = v; return; } const col = { hp: 'hp', er: 'er', sane: 'sane', stats: 'stats' }[k]; if (col) db.prepare('update users set ' + col + ' = ? where id = ?').run(k === 'stats' ? JSON.stringify(v) : k === 'sane' ? (v ? 1 : 0) : v, x); }
function memberInfo(r, x) { const m = r.members[x] || {}, b = m.bot, u = b ? null : getUser(x); return { name: b ? b.name : realName(x, u && u.name), stats: b ? b.stats : u ? statsOf(u) : null, skills: b ? b.skills : u ? skillsOf(u) : null }; }
function gameLog(r, text, kind, lv, extra) { const g = r.game; g.seq++; const e = { id: g.seq, t: Date.now(), kind, text, lv: lv || '', ...(extra || {}) }; g.log.push(e); if (g.log.length > 300) g.log.shift(); g.all = g.all || []; g.all.push(e); if (g.all.length > (r.main || r.w4 ? 20000 : 5000)) g.all.shift(); if (r.main || r.w4) mainSave(r); }
db.exec('create table if not exists field_logs(id integer primary key autoincrement, name text, ship text, members text, log text, by_ text, created_at integer)');
function gameTurnLog(r) { const g = r.game, x = g.order[g.turn]; if (!x) { if (r.main) gameLog(r, '第 ' + g.round + ' 轮 · 暂无可行动船员', 'turn'); return; } gameLog(r, '第 ' + g.round + ' 轮 · 【' + (x ? memberInfo(r, x).name : '—') + '】的回合', 'turn'); }
function gameStart(r) {
  const ids = Object.keys(r.members).map(x => ({ x, dex: +((memberInfo(r, x).stats || {}).dex) || 0, k: Math.random() })).sort((a, c) => c.dex - a.dex || a.k - c.k).map(o => o.x);
  const hp = {}; ids.forEach(x => { const s = memberInfo(r, x).stats || {}; hp[x] = Math.floor(((+s.siz || 0) + (+s.con || 0)) / 10); });
  r.game = { order: ids, turn: 0, round: 1, state: 'act', pending: null, log: [], seq: 0, hp, mad: {}, pendMad: {}, hurt: {}, hit: {} };
  gameLog(r, '行动顺序：' + ids.map(x => memberInfo(r, x).name).join(' → '), 'sys'); gameTurnLog(r);
}
function funRoom(id, r, now) {
  if (!r.started) { Object.keys(r.members).forEach(x => { if (now - r.members[x].seen > 20000) { delete r.members[x]; delete r.secrets[x]; } }); const ms = Object.values(r.members), go = ms.length >= (r.liar ? 2 : r.bj ? 1 : FUN_MIN) && ms.every(x => x.ready); if (!go) r.cd = 0; else if (!r.cd) r.cd = now + 10000; else if (now >= r.cd) { r.cd = 0; if (r.liar) LZ.start(r); else if (r.bj) BJ.start(r, now); else funStart(r); } return r; }
  if (!Object.keys(r.members).some(x => now - r.members[x].seen < 600000)) { FIELD[id] = r.liar ? mkLiar() : r.bj ? mkBJ() : mkFun(); return FIELD[id]; }
  if (r.bj) BJ.tick(r, now); funTick(r); return r;
}
const FUN_RES = { none: '无人猜对 · 无人胜利', author: '猜对少于半数 · 出题人胜利', guess: '猜对多于半数 · 猜题人胜利', tie: '猜对恰好半数 · 平局' };
const funName = x => { const u = getUser(x); return u ? realName(x, u.name) : x; };
const LIAR = (log, nm, rnd) => {
  const SL = ['top', 'bot', 'acc'], SN = { top: '上装', bot: '下装', acc: '配饰' }, bt = b => b.n + ' 个 ' + b.f;
  const deal = r => { const L = r.game.liar; L.dice = {}; L.alive.forEach(x => { L.dice[x] = Array.from({ length: 5 }, () => rnd(6) + 1); }); L.bid = null; L.wild = false; L.round++; log(r, '第 ' + L.round + ' 轮 · 全员重新掷骰 · 场上共 ' + L.alive.length * 5 + ' 颗\n由【' + nm(L.alive[L.turn]) + '】开始', 'sys'); };
  const finish = r => { const L = r.game.liar, w = L.alive[0], rank = [...L.alive, ...L.out.slice().reverse()]; L.end = true; L.bid = null;
    log(r, '吹牛骰结束 · 胜者【' + (w ? nm(w) : '无') + '】\n' + rank.map((u, k) => (k + 1) + '.【' + nm(u) + '】' + ((L.worn[u] || []).map(i => i.name).join('、') || '正常衣物')).join('\n'), 'funres', 'end'); };
  const draw = (L, x) => { const w = L.worn[x] = L.worn[x] || [], has = new Set(w.map(i => i.slot)); let c = L.pool.filter(i => !has.has(i.slot) && i.owner !== x); if (!c.length) c = L.pool.filter(i => !has.has(i.slot)); if (!c.length) c = L.pool.slice(); if (!c.length) return null; const it = c[rnd(c.length)]; L.pool.splice(L.pool.indexOf(it), 1); w.push(it); return it; };
  const lose = (r, x, head) => { const L = r.game.liar; L.last = { round: L.round, bid: L.bid ? { ...L.bid } : null, dice: L.alive.map(u => ({ uid: u, d: L.dice[u].slice() })), loser: x };
    const it = draw(L, x), n = (L.worn[x] || []).length, out = n >= 3; L.last.item = it; L.last.out = out; (L.hist = L.hist || []).push(L.last);
    log(r, head + '\n输家【' + nm(x) + '】' + (it ? '抽到【' + nm(it.owner) + '】的' + SN[it.slot] + '「' + it.name + '」并穿上' : '衣物池已空') + ' · ' + n + '/3' + (out ? '\n【' + nm(x) + '】穿满三件 · 淘汰' : ''), 'funres', out ? 'author' : '');
    let i = L.alive.indexOf(x); if (out) { L.alive.splice(i, 1); L.out.push(x); if (i >= L.alive.length) i = 0; } L.turn = i;
    if (L.alive.length <= 1) return finish(r); deal(r); };
  const start = r => { const ids = Object.keys(r.members); for (let i = ids.length - 1; i > 0; i--) { const j = rnd(i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const pool = []; ids.forEach(x => { const c = r.secrets[x] || {}; SL.forEach(k => { if (c[k]) pool.push({ slot: k, name: c[k], owner: x }); }); });
    r.started = true; r.game = { order: ids, turn: 0, round: 1, state: 'act', pending: null, log: [], seq: 0, hp: {}, mad: {}, pendMad: {}, hurt: {}, hit: {}, free: true, liar: { alive: ids.slice(), all: ids.slice(), out: [], pool, worn: {}, dice: {}, bid: null, wild: true, turn: 0, round: 0, end: false, last: null } };
    log(r, '吹牛骰\n每人 5 颗骰子，轮流叫「场上至少有 N 个 X 点」，只能往上叫：个数更多，或个数相同、点数更大\n不信就「开」：数量够，开的人输；不够，叫的人输\n输家从衣物池抽一件穿上，穿满三件即淘汰，留到最后的人获胜', 'sys');
    deal(r); };
  const bid = (r, x, n, f) => { const L = r.game.liar; if (L.end) return '游戏已结束'; if (L.alive[L.turn] !== x) return '还没轮到你'; n = Math.floor(+n); f = Math.floor(+f);
    if (!(f >= 1 && f <= 6) || !(n >= 1 && n <= L.alive.length * 5)) return '叫法无效'; const p = L.bid; if (p && !(n > p.n || (n === p.n && f > p.f))) return '必须比【' + bt(p) + '】更大';
    if (n === 1 && L.used1) return '「1 个」整局只能叫一次，已经被叫过了'; if (n === 1) L.used1 = true; L.bid = { by: x, n, f }; log(r, '【' + nm(x) + '】：' + bt(L.bid), 'sys'); L.turn = (L.turn + 1) % L.alive.length; return ''; };
  const open = (r, x) => { const L = r.game.liar; if (L.end) return '游戏已结束'; if (L.alive[L.turn] !== x) return '还没轮到你'; const p = L.bid; if (!p) return '还没有人叫，先叫一手';
    const k = L.alive.reduce((s, u) => s + L.dice[u].filter(d => d === p.f || (L.wild && p.f !== 1 && d === 1)).length, 0), ok = k >= p.n;
    lose(r, ok ? x : p.by, '【' + nm(x) + '】开【' + nm(p.by) + '】的 ' + bt(p) + '\n亮骰：' + L.alive.map(u => nm(u) + ' ' + L.dice[u].join(' ')).join(' / ') + '\n场上共 ' + k + ' 个 ' + p.f + (L.wild && p.f !== 1 ? '（含万能 1）' : '') + ' · ' + (ok ? '场上该骰子数量更多' : '场上该骰子数量更少')); return ''; };
  const drop = (r, x) => { const L = r.game && r.game.liar; if (!L || L.end) return; const i = L.alive.indexOf(x); if (i < 0) return; L.alive.splice(i, 1); L.out.push(x); log(r, '【' + nm(x) + '】离开了牌桌', 'sys');
    if (L.alive.length <= 1) return finish(r); L.turn = i % L.alive.length; deal(r); };
  const out = (r, me) => { const L = r.game && r.game.liar; if (!L) return null; const cur = L.alive[L.turn], mine = L.alive.includes(me);
    return { round: L.round, used1: !!L.used1, end: L.end, winner: L.end && L.alive[0] ? nm(L.alive[0]) : '', wild: L.wild, total: L.alive.length * 5, pool: L.pool.length,
      bid: L.bid ? { name: nm(L.bid.by), n: L.bid.n, f: L.bid.f } : null, turnName: L.end ? '' : nm(cur), myTurn: !L.end && cur === me, alive: mine, mine: mine && L.dice[me] ? L.dice[me].slice() : [],
      players: L.all.map(u => ({ uid: u, name: nm(u), out: !L.alive.includes(u), turn: !L.end && u === cur, worn: (L.worn[u] || []).map(i => ({ sl: SN[i.slot], name: i.name, from: nm(i.owner) })) })),
      hist: (L.hist || []).slice().reverse().map(h => ({ round: h.round, loser: nm(h.loser), bid: h.bid ? nm(h.bid.by) + ' 叫 ' + bt(h.bid) : '', item: h.item ? h.item.name : '', out: !!h.out, dice: h.dice.map(e => ({ name: nm(e.uid), d: e.d.join(' ') })) })), last: L.last ? { round: L.last.round, loser: nm(L.last.loser), bid: L.last.bid ? nm(L.last.bid.by) + ' 叫 ' + bt(L.last.bid) : '', item: L.last.item ? L.last.item.name : '', out: !!L.last.out, dice: L.last.dice.map(e => ({ name: nm(e.uid), d: e.d.join(' ') })) } : null };
  };
  return { start, bid, open, drop, out };
};
const LZ = LIAR((r, t, k, lv, ex) => gameLog(r, t, k, lv, ex), funName, n => crypto.randomInt(0, n));
const BLACKJACK = (log, nm, rnd) => {
  const BETS = [10, 20, 50], T_BET = 15000, T_ACT = 20000, T_GAP = 6000, SU = ['♠', '♥', '♦', '♣'], RK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const val = h => { let s = 0, a = 0; h.forEach(c => { if (c.r === 'A') { a++; s++; } else s += c.r === 'J' || c.r === 'Q' || c.r === 'K' ? 10 : +c.r; }); const soft = a > 0 && s + 10 <= 21; return { s: soft ? s + 10 : s, soft }; };
  const isBJ = h => h.length === 2 && val(h).s === 21, cs = h => h.map(c => c.r + c.s).join(' '), sg = k => k > 0 ? '+' + k : k < 0 ? String(k) : '±0';
  const shoe = () => { const d = []; for (let k = 0; k < 2; k++) SU.forEach(s => RK.forEach(r => d.push({ r, s }))); for (let i = d.length - 1; i > 0; i--) { const j = rnd(i + 1); [d[i], d[j]] = [d[j], d[i]]; } return d; };
  const draw = B => { if (!B.deck || !B.deck.length) B.deck = shoe(); return B.deck.pop(); };
  const bot = (r, x) => !!(r.members[x] && r.members[x].bot);
  const hitc = (B, x) => { B.hands[x].push(draw(B)); const v = val(B.hands[x]).s; if (v > 21) B.st[x] = 'bust'; else if (v === 21) B.st[x] = 'stand'; };
  const betPhase = (r, now) => { const B = r.game.bj; B.round++; B.phase = 'bet'; B.t1 = now + T_BET; B.bets = {}; B.hands = {}; B.st = {}; B.dealer = []; B.res = {}; B.dbl = {}; B.dec = {}; B.sub = 0; B.act = {}; log(r, '第 ' + B.round + ' 局 · 请在 ' + T_BET / 1000 + ' 秒内下注', 'turn'); };
  const finish = r => { const B = r.game.bj; B.end = true; B.phase = 'end'; const rank = B.all.slice().sort((a, b) => B.pts[b] - B.pts[a]); log(r, '二十一点结束\n' + rank.map((u, k) => (k + 1) + '.【' + nm(u) + '】' + B.pts[u] + ' 积分').join('\n'), 'funres', 'end'); };
  const settle = (r, now) => { const B = r.game.bj; while (B.dealer.length < 2) B.dealer.push(draw(B)); B.alive.forEach(x => { if (!B.hands[x] || B.hands[x].length < 2) { B.hands[x] = B.hands[x] || []; while (B.hands[x].length < 2) B.hands[x].push(draw(B)); B.st[x] = B.st[x] || 'stand'; B.bets[x] = B.bets[x] || Math.min(10, B.pts[x]); } });
    B.alive.forEach(x => { if (B.st[x] === 'play') B.st[x] = 'stand'; });
    if (B.alive.some(x => B.st[x] !== 'bust') && !isBJ(B.dealer)) while (val(B.dealer).s < 17) B.dealer.push(draw(B));
    const dv = val(B.dealer).s, dbj = isBJ(B.dealer), dbust = dv > 21, rows = [];
    B.alive.forEach(x => { const h = B.hands[x], v = val(h).s, bet = B.bets[x], pb = B.st[x] === 'bj'; let k;
      if (B.st[x] === 'bust') k = -bet; else if (pb && dbj) k = 0; else if (pb) k = Math.floor(bet * 1.5); else if (dbj) k = -bet; else if (dbust || v > dv) k = bet; else if (v < dv) k = -bet; else k = 0;
      B.pts[x] += k; B.res[x] = k; rows.push({ uid: x, h: h.slice(), v, k, st: B.st[x], bet }); });
    const outs = B.alive.filter(x => B.pts[x] <= 0); outs.forEach(x => { B.alive.splice(B.alive.indexOf(x), 1); B.out.push(x); });
    (B.hist = B.hist || []).push({ round: B.round, dealer: B.dealer.slice(), dv, dbj, rows }); if (B.hist.length > 30) B.hist.shift();
    log(r, '第 ' + B.round + ' 局结算 · 庄家 ' + cs(B.dealer) + ' = ' + (dbj ? '21 点' : dv + (dbust ? ' 爆牌' : '')) + '\n' + rows.map(e => '【' + nm(e.uid) + '】' + (e.st === 'bust' ? e.v + ' 爆牌' : e.st === 'bj' ? '21 点' : e.v) + ' · ' + sg(e.k) + ' → ' + B.pts[e.uid]).join('\n') + (outs.length ? '\n' + outs.map(x => '【' + nm(x) + '】积分归零 · 出局').join('\n') : ''), 'funres', '', { bjr: { round: B.round, dealer: B.dealer.map(c => ({ r: c.r, s: c.s })), dv: dbj ? '21 点' : dv + (dbust ? ' 爆牌' : ''), dbust, rows: rows.map(e => ({ name: nm(e.uid), cards: e.h.map(c => ({ r: c.r, s: c.s })), v: e.st === 'bust' ? e.v + ' 爆牌' : e.st === 'bj' ? '21 点' : String(e.v), bust: e.st === 'bust', k: sg(e.k), kn: e.k, pts: B.pts[e.uid] })), outs: outs.map(x => nm(x)) } });
    B.idle = B.idle || {}; const hum = B.alive.filter(x => !bot(r, x)); hum.forEach(x => { B.idle[x] = (B.act || {})[x] ? 0 : (B.idle[x] || 0) + 1; });
    B.phase = 'done'; B.t1 = now + T_GAP; if (!B.alive.length) return finish(r); if (!hum.length || hum.every(x => B.idle[x] >= 3)) { log(r, '连续 3 局无人操作 · 牌局自动结束', 'sys'); finish(r); } };
  const deal = (r, now) => { const B = r.game.bj; B.deck = shoe();
    B.alive.forEach(x => { if (!B.bets[x]) B.bets[x] = Math.min(BETS[0], B.pts[x]); B.hands[x] = [draw(B), draw(B)]; B.st[x] = isBJ(B.hands[x]) ? 'bj' : 'play'; });
    B.dealer = [draw(B), draw(B)]; B.phase = 'act'; B.t1 = now + T_ACT; B.dec = {}; B.sub = 1;
    log(r, '发牌 · 庄家明牌 ' + cs([B.dealer[0]]) + ' · 第 1 轮 · 请在 ' + T_ACT / 1000 + ' 秒内选择要牌或停牌', 'sys', '', { bjd: { round: B.round, up: { r: B.dealer[0].r, s: B.dealer[0].s } } });
    if (!B.alive.some(x => B.st[x] === 'play')) settle(r, now); };
  const tick = (r, now) => { const B = r.game && r.game.bj; if (!B || B.end) return false; now = now || Date.now(); let ch = false;
    if (B.phase === 'bet') { B.alive.forEach(x => { if (bot(r, x) && !B.bets[x]) { B.bets[x] = Math.min(BETS[0], B.pts[x]); ch = true; } }); if (now >= B.t1 || B.alive.every(x => B.bets[x])) { deal(r, now); ch = true; } }
    if (B.phase === 'act') { B.dec = B.dec || {}; B.alive.forEach(x => { if (bot(r, x) && B.st[x] === 'play' && !B.dec[x]) { B.dec[x] = val(B.hands[x]).s < 17 ? 'hit' : 'stand'; ch = true; } });
      const pl = B.alive.filter(x => B.st[x] === 'play');
      if (pl.length && (now >= B.t1 || pl.every(x => B.dec[x]))) { const ln = [];
        pl.forEach(x => { const d = B.dec[x] || 'late'; if (d === 'hit' || d === 'dbl') { if (d === 'dbl') { B.bets[x] *= 2; B.dbl[x] = 1; } hitc(B, x); const c = B.hands[x][B.hands[x].length - 1], v = val(B.hands[x]).s; if (d === 'dbl' && B.st[x] === 'play') B.st[x] = 'stand'; ln.push('【' + nm(x) + '】' + (d === 'dbl' ? '加倍' : '要牌') + ' ' + cs([c]) + ' → ' + (B.st[x] === 'bust' ? v + ' 爆牌' : v)); } else { B.st[x] = 'stand'; ln.push('【' + nm(x) + '】' + (d === 'late' ? '超时 · 自动停牌' : '停牌') + ' · ' + val(B.hands[x]).s); } });
        log(r, '第 ' + B.sub + ' 轮结果\n' + ln.join('\n'), 'sys'); B.dec = {}; B.sub++; ch = true;
        if (B.alive.some(x => B.st[x] === 'play')) { B.t1 = now + T_ACT; log(r, '第 ' + B.sub + ' 轮 · 请在 ' + T_ACT / 1000 + ' 秒内选择要牌或停牌', 'turn'); } }
      if (!B.alive.some(x => B.st[x] === 'play')) { settle(r, now); ch = true; } }
    else if (B.phase === 'done' && now >= B.t1) { betPhase(r, now); ch = true; }
    return ch; };
  const chk = (r, x, ph) => { const B = r.game && r.game.bj; if (!B) return '游戏未开始'; if (B.end) return '游戏已结束'; if (!B.alive.includes(x)) return '你已出局'; if (B.phase !== ph) return ph === 'bet' ? '现在不是下注时间' : '现在不能要牌'; return ''; };
  const bet = (r, x, n) => { const e = chk(r, x, 'bet'); if (e) return e; const B = r.game.bj; n = Math.floor(+n); if (!(n >= 1)) return '下注无效'; if (n > B.pts[x]) return '积分不足'; B.bets[x] = n; (B.act = B.act || {})[x] = 1; tick(r); return ''; };
  const hit = (r, x) => { const e = chk(r, x, 'act'); if (e) return e; const B = r.game.bj; if (B.st[x] !== 'play') return '你已停牌'; B.dec[x] = 'hit'; (B.act = B.act || {})[x] = 1; tick(r); return ''; };
  const stand = (r, x) => { const e = chk(r, x, 'act'); if (e) return e; const B = r.game.bj; if (B.st[x] !== 'play') return '你已停牌'; B.dec[x] = 'stand'; (B.act = B.act || {})[x] = 1; tick(r); return ''; };
  const dbl = (r, x) => { const e = chk(r, x, 'act'); if (e) return e; const B = r.game.bj; if (B.st[x] !== 'play') return '你已停牌'; if (B.hands[x].length !== 2) return '只有前两张牌时可以加倍'; if (B.pts[x] < B.bets[x] * 2) return '积分不足以加倍'; B.dec[x] = 'dbl'; (B.act = B.act || {})[x] = 1; tick(r); return ''; };
  const start = (r, now) => { const ids = Object.keys(r.members); now = now || Date.now();
    r.started = true; r.game = { order: ids, turn: 0, round: 1, state: 'act', pending: null, log: [], seq: 0, hp: {}, mad: {}, pendMad: {}, hurt: {}, hit: {}, free: true, bj: { all: ids.slice(), alive: ids.slice(), out: [], pts: Object.fromEntries(ids.map(x => [x, 100])), round: 0, phase: 'bet', t1: 0, bets: {}, hands: {}, st: {}, dealer: [], res: {}, dbl: {}, deck: [], hist: [], end: false } };
    log(r, '二十一点\n每人初始有 100 积分 · 每局先下注，发牌后按轮进行：每轮所有人同时选择要牌或停牌，' + T_ACT / 1000 + ' 秒内未选则会自动停牌，全员选完后一起发牌，进入下一轮\n请保证点数尽量接近 21，超过即爆牌判负\nA 算 1 或 11，J Q K 算 10\n庄家补牌到 17 点以上 · 玩家胜利可以拿回 1 倍下注，玩家若起手 21 点则可以拿回 1.5 倍下注\n加倍：只能在第 1 轮选择，下注翻倍，并且只会再发一张牌，之后自动停牌，不能继续要牌\n积分归零即出局', 'sys'); betPhase(r, now); };
  const drop = (r, x) => { const B = r.game && r.game.bj; if (!B || B.end) return; const i = B.alive.indexOf(x); if (i < 0) return; B.alive.splice(i, 1); B.out.push(x); log(r, '【' + nm(x) + '】离开了牌桌', 'sys'); if (!B.alive.length) finish(r); else tick(r); };
  const out = (r, me, now) => { const B = r.game && r.game.bj; if (!B) return null; now = now || Date.now(); const hide = B.phase === 'act' || B.phase === 'bet', fin = B.phase === 'done' || B.phase === 'end', C = h => h.map(c => ({ r: c.r, s: c.s }));
    const pl = u => { const h = B.hands[u] || [], v = h.length ? val(h) : null; return { uid: u, name: nm(u), pts: B.pts[u], out: !B.alive.includes(u), bet: B.bets[u] || 0, hand: C(h), total: v ? v.s : 0, soft: !!(v && v.soft && v.s < 21), st: B.st[u] || '', dbl: !!B.dbl[u], dec: u === me ? (B.dec || {})[u] || '' : '', decided: !!(B.dec || {})[u], res: fin && u in B.res ? B.res[u] : null }; };
    const dh = hide ? B.dealer.slice(0, 1) : B.dealer;
    return { round: B.round, sub: B.sub || 0, phase: B.phase, left: Math.max(0, B.t1 - now), end: B.end, bets: BETS, dealer: { hand: C(dh), hidden: hide && B.dealer.length > 1, total: dh.length ? val(dh).s : 0, bj: !hide && isBJ(B.dealer) }, me: B.all.includes(me) ? pl(me) : null, players: B.all.map(pl),
      hist: (B.hist || []).slice(-10).reverse().map(h => ({ round: h.round, dealer: cs(h.dealer), dv: h.dbj ? '21 点' : h.dv > 21 ? h.dv + ' 爆牌' : String(h.dv), dh: C(h.dealer), dbust: h.dv > 21, rows: h.rows.map(e => ({ name: nm(e.uid), cards: cs(e.h), hand: C(e.h), bust: e.st === 'bust', bet: e.bet, v: e.st === 'bust' ? e.v + ' 爆牌' : e.st === 'bj' ? '21 点' : String(e.v), k: sg(e.k), kc: e.k > 0 ? 'win' : e.k < 0 ? 'lose' : 'push' })) })) }; };
  return { start, tick, bet, hit, stand, dbl, drop, out };
};
const BJ = BLACKJACK((r, t, k, lv, ex) => gameLog(r, t, k, lv, ex), funName, n => crypto.randomInt(0, n));
function funTick(r) {}
function funNext(r) {
  const g = r.game, V = g.vote; V.i++; if (V.i >= V.q.length) return funEnd(r);
  const a = V.q[V.i]; V.cur = { no: V.i + 1, author: a, text: r.secrets[a] || '', votes: {} };
  gameLog(r, '第 ' + V.cur.no + ' / ' + V.q.length + ' 题 · 抽出秘密\n「' + V.cur.text + '」\n这是谁的秘密？', 'secret', '', { vno: V.cur.no, sec: V.cur.text });
}
function funClose(r) {
  const g = r.game, V = g.vote, c = V.cur, ids = [...new Set([...g.order, c.author])], guess = Object.keys(c.votes).filter(x => x !== c.author), N = guess.length, k = guess.filter(x => c.votes[x] === c.author).length;
  const out = k === 0 ? 'none' : k * 2 < N ? 'author' : k * 2 > N ? 'guess' : 'tie', rec = {};
  ids.forEach(x => { const au = x === c.author, v = c.votes[x] || ''; rec[x] = { role: au ? 'author' : 'guess', vote: v, ok: !au && v === c.author, res: out === 'author' ? (au ? 'W' : 'L') : out === 'guess' ? (au ? 'L' : 'W') : 'D' }; });
  V.rounds.push({ no: c.no, author: c.author, text: c.text, N, k, out, shown: out !== 'none', rec }); V.cur = null; V.nextAt = Date.now() + FUN_GAP;
  gameLog(r, '第 ' + c.no + ' 题投票截止 · 有效票 ' + N + ' · 猜对 ' + k + ' 人\n' + (out !== 'none' ? '答案：【' + funName(c.author) + '】' : '答案将在游戏结束时公布') + '\n' + FUN_RES[out], 'funres', out);
}
function funEnd(r) {
  const g = r.game, V = g.vote; V.end = true; V.cur = null;
  gameLog(r, '全部秘密已抽完 · 游戏结束 · 公布全部答案\n' + V.rounds.map(x => '第 ' + x.no + ' 题「' + x.text + '」→【' + funName(x.author) + '】 · ' + x.k + ' 人答对').join('\n'), 'funres', 'end');
  [...new Set(V.rounds.flatMap(x => Object.keys(x.rec)))].forEach(x => {
    const s = { W: 0, L: 0, D: 0 }, lines = V.rounds.map(rd => { const e = rd.rec[x]; if (!e) return null; s[e.res]++; return '第 ' + rd.no + ' 题 · ' + (e.role === 'author' ? '出题' : e.vote ? '投【' + funName(e.vote) + '】' + (e.ok ? '✓' : '✗') : '未投票') + ' · ' + { W: '胜', L: '负', D: '平' }[e.res]; }).filter(Boolean);
    gameLog(r, '秘密投票 · 个人战绩\n胜 ' + s.W + ' · 负 ' + s.L + ' · 平 ' + s.D + '\n' + lines.join('\n'), 'gm', 'narr', { to: x });
  });
}
function funStart(r) {
  const ids = Object.keys(r.members).map(x => ({ x, dex: +((memberInfo(r, x).stats || {}).dex) || 0, k: Math.random() })).sort((a, c) => c.dex - a.dex || a.k - c.k).map(o => o.x);
  const q = ids.filter(x => r.secrets[x]); for (let i = q.length - 1; i > 0; i--) { const j = crypto.randomInt(0, i + 1); [q[i], q[j]] = [q[j], q[i]]; }
  r.started = true; r.game = { order: ids, turn: 0, round: 1, state: 'act', pending: null, log: [], seq: 0, hp: {}, mad: {}, pendMad: {}, hurt: {}, hit: {}, free: true, vote: { q, i: -1, cur: null, rounds: [], end: false, nextAt: 0 } };
  gameLog(r, '秘密投票开始 · 共 ' + q.length + ' 题\n由调度宣布截止并进入下一题，从员工列表中投出秘密的主人（出题人的票不计入）\n0 人猜对：无人胜利，答案留到游戏结束公布\n猜对少于半数：出题人胜利\n猜对多于半数：猜题人胜利', 'sys');
  funNext(r);
}
function funOut(r, me) {
  const g = r.game, V = g && g.vote; if (!V) return null; const c = V.cur;
  return { now: Date.now(), total: V.q.length, idx: V.i + 1, end: !!V.end,
    rounds: (V.end ? V.rounds : []).map(x => { const open = x.shown || V.end; return { no: x.no, text: x.text, N: x.N, k: x.k, out: x.out, answerName: open ? funName(x.author) : '', rows: Object.keys(x.rec).map(u => { const e = x.rec[u]; return { uid: u, name: funName(u), role: !open && e.role === 'author' ? 'guess' : e.role, vote: e.vote, vname: e.vote ? funName(e.vote) : '', ok: e.ok, res: e.res }; }) }; }),
    cur: c ? { no: c.no, text: c.text, t1: c.t1, mine: c.votes[me] || '', isMine: c.author === me, votes: Object.keys(c.votes).map(x => ({ uid: x, name: funName(x), target: c.votes[x], tname: funName(c.votes[x]) })) } : null };
}
function gameOut(r) { const g = r.game; if (!g) return null; return { mapSeq: (g.map && g.map.seq) || 0, dogUsed: !!g.dogUsed, free: !!g.free, round: g.round, turnId: g.free ? '' : (g.order[g.turn] || ''), order: g.order.map(x => { const i = memberInfo(r, x); return { id: x, name: i.name, dex: +((i.stats || {}).dex) || 0 }; }), state: g.state, pending: g.pending, skip: g.skip || {}, dropped: g.dropped || [], fx: g.fx || {}, dead: g.dead || {}, w4: r.w4 ? w4Out(r) : null, log: (CUR_VIEWER && isAdmin(CUR_VIEWER) && !r.fun ? g.log : g.log.filter(l => !l.hide && (!l.to || (CUR_VIEWER && l.to === CUR_VIEWER)))).slice(-150) }; }
function fieldOut(id, full) {
  const r = fieldRoom(id);
  const now = Date.now();
  return { id: +id, max: r.main || r.w4 || r.fun ? 0 : 8, main: !!r.main, seeFoam: r.main ? (() => { const v = CUR_VIEWER; if (!v) return false; if (isAdmin(v)) return true; const u = getUser(v); return !!u && (u.dead === 2 || (+((mGet(r, v) || {}).er) || 0) >= 60); })() : true, w4: !!r.w4, fun: !!r.fun, cd: r.fun && r.cd ? Math.max(0, r.cd - now) : 0, vote: r.fun && !r.liar ? funOut(r, CUR_VIEWER) : null, liarMode: !!r.liar, lz: r.liar ? LZ.out(r, CUR_VIEWER) : null, bjMode: !!r.bj, bj: r.bj ? BJ.out(r, CUR_VIEWER, now) : null, started: r.started, dispatcher: r.gm && ((r.started && !r.main) || now - r.gm.t < 30000) ? dispLabel(r.gm.id) || r.gm.id : '', members: Object.keys(r.members).filter(x => !(r.main && r.members[x].away)).map(x => {
    const m = r.members[x], b = m.bot, u = b ? null : getUser(x);
    const mi = mGet(r, x) || {}, gg = r.game || {};
    const o = { id: x, hp: hpNow(mi), hpMax: hpMaxOf(mi.stats), mad: (gg.mad || {})[x] || null, hit: (gg.hit || {})[x] || 0, loot: (gg.loot || {})[x] || [], name: b ? b.name : realName(x, u && u.name), avatar: u ? u.avatar || '' : '', ready: !!m.ready, itemsDone: !!m.itemsDone, items: m.items || [], temps: m.temps || [], lootCarry: m.lootCarry || [], bot: !!b, dispName: dispLabel(x), sane: b ? b.sane !== false : !!u && u.sane !== 0, stats: b ? b.stats : u ? statsOf(u) : null, skills: b ? b.skills : u ? skillsOf(u) : null, dept: b ? b.dept : u ? u.dept || '' : '', idCard: u ? u.idcard || '' : '', secret: r.fun && !r.started && x === CUR_VIEWER ? (r.secrets || {})[x] || '' : '' };
    if (full) { o.realName = b ? '测试账号' : (ROSTER[x] && ROSTER[x].name) || ''; o.er = mi.er || 0; o.pendMad = !!(gg.pendMad || {})[x]; }
    return o;
  }), game: gameOut(r), def: r.fun ? null : r.main || r.w4 ? (() => { const s = shipGet(); let p = 0, q = 0; SHIP_MODS.forEach(m => { const d = defOf(s, m); p += d.p; q += d.s; }); return { p, s: q, max: SHIP_MODS.length * 30, ana: true, med: true, main: true }; })() : defOf(shipGet(), 'sc' + id) };
}
api.post('/field/stats', auth, (req, res) => {
  const u = req.user; if (hasStats(statsOf(u))) return bad(res, '属性已登记，如需修改请联系调度', 409);
  const st = {}, b = (req.body && req.body.stats) || {};
  for (const [label, k] of STAT_KEYS) { const v = +b[k]; if (!Number.isInteger(v) || v < 1 || v > 100) return bad(res, label + ' 需为 1–100 的整数'); st[k] = v; }
  const sum = Object.values(st).reduce((a, c) => a + c, 0); if (!isAdmin(u.id) && sum > 360) return bad(res, '六项属性总和不能超过 360（当前 ' + sum + '）');
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
  Object.keys(FIELD).forEach(id => { if (FIELD[id].fun) return; const r = fieldRoom(id); if (r.members[me]) { member = +id; started = r.started; } if (r.started && r.gm && r.gm.id === me && !r.members[me] && Date.now() - r.gm.t < 30000) gmRoom = +id; });
  res.json({ member, started, gmRoom });
});
api.get('/field/rooms', auth, (req, res) => res.json({ max: 8, rooms: Object.keys(FIELD).filter(id => !FIELD[id].fun).map(id => { const r = fieldRoom(id); return { id: +id, n: Object.keys(r.members).length, started: r.started, main: !!r.main, w4: !!r.w4, lost: shipGet().lost.includes('sc' + id) }; }) }));
api.get('/field/rooms/:id', auth, (req, res) => {
  const r = fieldRoom(req.params.id); if (!r) return bad(res, '无效舰船', 404);
  { const m = r.members[req.user.id]; if (m) { m.seen = Date.now(); if (r.main && m.away && !req.query.gm) { m.away = false; mainJoin(r, req.user.id); } if (r.w4 && m.away && !req.query.gm) { m.away = false; w4Join(r, req.user.id); } } }
  if (isAdmin(req.user.id) && req.query.gm) { if (r.gm && r.gm.id !== req.user.id && Date.now() - r.gm.t < 30000) return bad(res, '该舰已有调度【' + (dispLabel(r.gm.id) || r.gm.id) + '】在线，一艘舰只能有一位调度', 409); r.gm = { id: req.user.id, t: Date.now() }; }
  res.json({ room: fieldOut(req.params.id, isAdmin(req.user.id)) });
});
const NONCES = new Map();
const once = (req, res, next) => { const n = (req.body || {}).nonce; if (typeof n !== 'string' || !n || n.length > 40) return next(); const now = Date.now(); for (const [k, t] of NONCES) { if (now - t > 120000) NONCES.delete(k); else break; } const k = req.user.id + ':' + n; if (NONCES.has(k)) return res.json({ room: fieldOut(req.params.id, isAdmin(req.user.id)) }); NONCES.set(k, now); next(); };
// 临时测绘：只追加的操作日志（每条带客户端生成的唯一 id，重发去重），按服务器序号增量同步；清空/压缩时提高 base，落后的客户端整包重载
const mapApply = (M, o, me, mem, adm) => {
  const id = typeof o.id === 'string' && o.id.length <= 48 ? o.id : ''; if (!id || M.ids[id]) return;
  const I = (v, mx) => Math.max(0, Math.min(mx, Math.round(+v || 0))); let e = null;
  if (o.k === 'add' && (o.t === 'rect' || o.t === 'line') && Array.isArray(o.a) && o.a.length === 4) { if ((M.live || 0) >= 600) return; const a = [I(o.a[0], 36), I(o.a[1], 24), I(o.a[2], 36), I(o.a[3], 24)]; if (a[0] === a[2] && a[1] === a[3]) return; if (o.t === 'rect' && (a[0] === a[2] || a[1] === a[3])) return; e = { k: 'add', t: o.t, a }; }
  else if (o.k === 'del') { const t = M.ops.find(x => x.k === 'add' && x.id === o.ref); if (!t || (t.uid !== me && !adm) || M.ops.some(x => x.k === 'del' && x.ref === t.id)) return; e = { k: 'del', ref: t.id }; }
  else if (o.k === 'pin' && mem) e = +o.x < 0 ? { k: 'pin', x: -1, y: -1 } : { k: 'pin', x: I(o.x, 36 - 1), y: I(o.y, 23) };
  else if (o.k === 'clr' && adm) { M.seq++; M.base = M.seq; M.ops = []; M.live = 0; M.ids = { [id]: 1 }; return; }
  if (!e) return; M.ids[id] = 1; M.seq++; M.ops.push({ ...e, id, uid: me, seq: M.seq }); if (e.k === 'add') M.live = (M.live || 0) + 1; if (e.k === 'del') M.live = Math.max(0, (M.live || 0) - 1);
  if (M.ops.length > 1500) { const dead = new Set(M.ops.filter(x => x.k === 'del').map(x => x.ref)), pins = {}; M.ops.forEach(x => { if (x.k === 'pin') pins[x.uid] = x; }); M.seq++; M.base = M.seq; M.ops = [...M.ops.filter(x => x.k === 'add' && !dead.has(x.id)), ...Object.values(pins).filter(x => x.x >= 0)].map(x => ({ ...x, seq: M.seq })); }
};
api.post('/field/rooms/:id/map', auth, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game; if (!g) return bad(res, '游戏未开始', 409);
  const me = req.user.id, adm = isAdmin(me), mem = !!r.members[me]; if (!mem && !adm) return bad(res, '你不在该舰上', 403);
  const M = g.map || (g.map = { seq: 0, base: 0, ops: [], ids: {}, live: 0 }), b = req.body || {};
  (Array.isArray(b.ops) ? b.ops.slice(0, 60) : []).forEach(o => o && typeof o === 'object' && mapApply(M, o, me, mem, adm));
  const since = Math.floor(+b.since || 0);
  res.json(since < M.base || since > M.seq ? { seq: M.seq, reset: true, ops: M.ops } : { seq: M.seq, ops: M.ops.filter(o => o.seq > since) });
});
api.post('/field/rooms/:id/ungm', auth, admin, (req, res) => { const r = fieldRoom(req.params.id); if (r && r.gm && r.gm.id === req.user.id) delete r.gm; res.json({ ok: true }); });
api.post('/field/rooms/:id/join', auth, (req, res) => {
  const id = req.params.id, r = fieldRoom(id), me = req.user.id; if (!r) return bad(res, '无效舰船', 404);
  if (!r.main && !r.w4 && shipGet().lost.includes('sc' + id)) return bad(res, '该先锋舰已失联，无法进入', 409);
  if (!hasStats(statsOf(req.user))) return bad(res, '请先登记属性', 403);
  if (!skillsOf(req.user)) return bad(res, '请先登记技能', 403);
  if (r.fun) { if (!r.members[me]) { if (r.started) return bad(res, '本局游戏已开始，请等待下一局', 409); r.members[me] = { ready: false, seen: Date.now(), items: [], itemsDone: !!r.bj }; } r.members[me].seen = Date.now(); return res.json({ room: fieldOut(id) }); }
  if (Object.keys(FIELD).some(x => x !== id && !FIELD[x].main && !FIELD[x].fun && FIELD[x].started && !FIELD[x].w4 && FIELD[x].members[me])) return bad(res, '你正在外勤任务中', 409);
  if (r.main || r.w4) { if (r.w4 && !w4Open()) return bad(res, 'WEEK4 主舰尚未开放', 409); if (r.main && w4Open()) return bad(res, '主舰频道已关闭', 409); Object.keys(FIELD).forEach(k => { const o = FIELD[k]; if (k !== id && (o.main || o.w4) && o.members[me]) { if (o.w4) w4Drop(o, me); else mainDrop(o, me); delete o.members[me]; } }); }
  if (r.w4) { if (!r.members[me]) { if (r.started) return bad(res, 'WEEK4 行动已开始，无法中途加入', 409); r.members[me] = { ready: false, seen: Date.now(), items: [], itemsDone: false }; } r.members[me].seen = Date.now(); r.members[me].away = false; if (r.started) { w4Join(r, me); mainSave(r); } return res.json({ room: fieldOut(id) }); }
  if (r.main) { if (!r.members[me]) r.members[me] = { ready: false, seen: Date.now(), items: [], itemsDone: false }; r.members[me].seen = Date.now(); r.members[me].away = false; mainJoin(r, me); return res.json({ room: fieldOut(id) }); }
  if (!r.members[me]) {
    if (r.started) return bad(res, '该舰已启航', 409);
    if (Object.keys(r.members).length >= 8) return bad(res, '该舰已满员', 409);
    Object.keys(FIELD).forEach(x => { if (x !== id && !FIELD[x].fun) delete FIELD[x].members[me]; });
    r.members[me] = { ready: false, seen: Date.now(), items: [], itemsDone: false };
  }
  r.members[me].seen = Date.now();
  res.json({ room: fieldOut(id) });
});
api.post('/field/rooms/:id/leave', auth, (req, res) => { const r = fieldRoom(req.params.id); if (r && r.fun) { if (r.liar && r.started) LZ.drop(r, req.user.id); if (r.bj && r.started) BJ.drop(r, req.user.id); delete r.members[req.user.id]; if (!r.started) delete r.secrets[req.user.id]; return res.json({ ok: true }); } if (r && r.w4 && r.started) { const m0 = r.members[req.user.id], g0 = r.game; if (m0 && (m0.lootCarry || []).length) { g0.loot = g0.loot || {}; g0.loot[req.user.id] = [...(g0.loot[req.user.id] || []), ...m0.lootCarry]; mainSave(r); } delete r.members[req.user.id]; w4Drop(r, req.user.id); return res.json({ ok: true }); } if (r && r.main) { { const m0 = r.members[req.user.id], g0 = r.game; if (m0 && g0 && (m0.lootCarry || []).length) { g0.loot = g0.loot || {}; g0.loot[req.user.id] = [...(g0.loot[req.user.id] || []), ...m0.lootCarry]; mainSave(r); } } delete r.members[req.user.id]; mainDrop(r, req.user.id); return res.json({ ok: true }); } if (r && !r.started) { delete r.members[req.user.id]; fieldRoom(req.params.id); } res.json({ ok: true }); });
api.post('/field/rooms/:id/items', auth, (req, res) => {
  const r = fieldRoom(req.params.id), m = r && r.members[req.user.id]; if (!m) return bad(res, '你不在该舰上', 403);
  if (r.fun && r.liar) { if (r.started) return bad(res, '游戏已开始', 409); const cb = (req.body || {}).clothes || {}, cl = { top: str(cb.top, 24), bot: str(cb.bot, 24), acc: str(cb.acc, 24) }; if (!cl.top || !cl.bot || !cl.acc) return bad(res, '请填写上装、下装和配饰'); r.secrets[req.user.id] = cl; m.itemsDone = true; m.ready = false; m.seen = Date.now(); return res.json({ room: fieldOut(req.params.id) }); }
  if (r.fun) { if (r.started) return bad(res, '游戏已开始', 409); const t = str((req.body || {}).secret, 200); if (!t) return bad(res, '请写下一个秘密'); r.secrets[req.user.id] = t; m.itemsDone = true; m.ready = false; m.seen = Date.now(); return res.json({ room: fieldOut(req.params.id) }); }
  if (r.started && !r.main) return bad(res, '该舰已启航', 409);
  if (r.main && m.itemsDone) return bad(res, '物品已登记，离舰后重新登舰才能更换', 409);
  const cap = carryOf(statsOf(req.user)), list = (Array.isArray(req.body.items) ? req.body.items : []).map(x => typeof x === 'string' ? { name: str(x, 30), temp: true } : { name: str((x || {}).name, 30), temp: !!(x || {}).temp }).filter(x => x.name);
  if (list.length > cap) return bad(res, '最多携带 ' + cap + ' 件');
  const bag = [...listOf(req.user, 'personal'), ...listOf(req.user, 'gained')];
  for (const x of list) if (!x.temp) { const i = bag.indexOf(x.name); if (i < 0) return bad(res, '背包中没有【' + x.name + '】'); bag.splice(i, 1); }
  m.items = list.map(x => x.name); m.temps = list.filter(x => x.temp).map(x => x.name); m.itemsDone = true; m.ready = !!r.main; m.seen = Date.now(); if (r.main) mainJoin(r, req.user.id);
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
  r.started = true; r.gm = { id: req.user.id, t: Date.now() }; if (r.w4) { w4Start(r); mainSave(r); } else gameStart(r); res.json({ room: fieldOut(req.params.id, true) });
});
api.post('/field/rooms/:id/kick', auth, admin, (req, res) => {
  const r = fieldRoom(req.params.id), b = req.body || {}; if (!r || !r.members[b.uid]) return bad(res, '该成员不在舰上', 404);
  if (r.started) return bad(res, '该舰已启航', 409);
  delete r.members[b.uid]; res.json({ room: fieldOut(req.params.id, true) });
});
api.get('/field/rooms/:id/log', auth, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game, me = req.user.id; if (!g) return bad(res, '游戏未开始', 409);
  const all = g.all || g.log; res.json({ log: isAdmin(me) && !r.fun ? all : all.filter(l => !l.hide && (!l.to || l.to === me)) });
});
api.post('/field/rooms/:id/unload', auth, admin, (req, res) => {
  const r = fieldRoom(req.params.id), b = req.body || {}, m = r && r.members[b.uid]; if (!m) return bad(res, '该成员不在舰上', 404);
  if (r.started) return bad(res, '该舰已启航', 409);
  const it = (m.items || [])[+b.idx]; if (!it) return bad(res, '物品不存在');
  m.items.splice(+b.idx, 1); const ti = (m.temps || []).indexOf(it); if (ti >= 0) m.temps.splice(ti, 1);
  res.json({ room: fieldOut(req.params.id, true) });
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
  res.json({ room: fieldOut(req.params.id, isAdmin(req.user.id)) });
});
api.post('/field/rooms/:id/act', auth, once, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game, me = req.user.id, b = req.body || {}; if (!g) return bad(res, '游戏未开始', 409);
  if (!r.members[me]) return bad(res, '你不在该舰上', 403);
  if (isDead(r, me)) return bad(res, '你已死亡', 403);
  if (madBagLost(r, me)) return bad(res, '你失去了重要的物品，无法行动', 403);
  if (r.fun) {
    const info = memberInfo(r, me), target = str(b.target, 24), on = target ? '对【' + target + '】' : ''; let label = '', val = 0;
    if (b.kind === 'skill') { const L = SKILL_LABELS[b.cat], i = +b.idx; if (!L || !(i >= 0 && i < 3)) return bad(res, '无效技能'); const grp = (info.skills || []).find(x => x.cat === b.cat); label = L[i]; val = grp ? +grp.v[i] : 1; }
    else if (b.kind === 'stat') { const S = STAT_KEYS.find(x => x[1] === b.key); if (!S) return bad(res, '无效属性'); label = S[0]; val = +((info.stats || {})[b.key]) || 0; }
    else if (b.kind === 'free') { if (!target) return bad(res, '请填写目标'); gameLog(r, '【' + info.name + '】' + on + '进行了人为干涉', 'sys'); return res.json({ room: fieldOut(req.params.id) }); }
    else return bad(res, '无效行动');
    const roll = crypto.randomInt(1, 101), lv = rollLevel(roll, val);
    gameLog(r, '【' + info.name + '】' + on + '进行【' + label + '】检定\nD100=' + roll + '/' + val + ' ' + lv, 'roll', lv);
    return res.json({ room: fieldOut(req.params.id) });
  }
  if (r.w4) {
    const info = memberInfo(r, me), target = str(b.target, 24), on = target ? '对【' + target + '】' : '', item = str(b.item, 30);
    const wornSuit = item === '宇航服' && !!w4Of(r).suit[me];
    if (item && !wornSuit && ![...(r.members[me].items || []), ...((g.loot || {})[me] || [])].includes(item)) return bad(res, '物品不在背包中');
    if (b.kind === 'free') { if (!target && !item) return bad(res, '请填写目标或选择物品');
      const to = item && target && Object.keys(r.members).find(x => x !== me && memberInfo(r, x).name === target);
      if (to) { if (isDead(r, to)) return bad(res, '对方已死亡', 409); g.loot = g.loot || {}; const TL = g.loot[to] = g.loot[to] || []; if (TL.length >= lootCap(to, r)) return bad(res, '【' + target + '】的外勤背包已满', 409); let off = false; if (!w4Take(r, me, item)) { if (!wornSuit) return bad(res, '物品不在背包中'); w4Of(r).suit[me] = false; off = true; } TL.push(item); gameLog(r, '【' + info.name + '】' + (off ? '脱下身上的宇航服，' : '') + '把【' + item + '】交给了【' + target + '】', 'item'); mainSave(r); return res.json({ room: fieldOut(req.params.id) }); }
      gameLog(r, '【' + info.name + '】' + on + (item ? '使用了【' + item + '】' : '进行了人为干涉'), item ? 'item' : 'sys'); return res.json({ room: fieldOut(req.params.id) }); }
    let label = '', val = 0, key = '';
    if (b.kind === 'skill') { const L = SKILL_LABELS[b.cat], i = +b.idx; if (!L || !(i >= 0 && i < 3)) return bad(res, '无效技能'); const grp = (info.skills || []).find(x => x.cat === b.cat); label = L[i]; val = grp ? +grp.v[i] : 1; key = b.cat + ':' + i; }
    else if (b.kind === 'stat') { const S = STAT_KEYS.find(x => x[1] === b.key); if (!S) return bad(res, '无效属性'); label = S[0]; val = +((info.stats || {})[b.key]) || 0; key = 'st:' + b.key; }
    else return bad(res, '无效行动');
    const W = w4Of(r), now = Date.now(), C = W.cd[me] = W.cd[me] || { any: 0, k: {} }, sec = t => Math.ceil((t - now) / 1000);
    { const tg = target && target !== '自己' ? Object.keys(r.members).find(x => memberInfo(r, x).name === target) : ''; if (tg && tg !== me && !r.members[tg].bot && baseLoc(getUser(tg)) !== baseLoc(getUser(me))) return bad(res, '【' + target + '】不在你所在的舱室', 409); }
    if (now < C.any) return bad(res, '行动冷却中 · ' + sec(C.any) + ' 秒后可再次骰点', 409);
    if (now < (C.k[key] || 0)) return bad(res, '【' + label + '】冷却中 · ' + sec(C.k[key]) + ' 秒', 409);
    C.any = now + W4_CD_ANY; C.k[key] = now + (b.kind === 'skill' && b.cat === 'fix' ? W4_CD_FIX : W4_CD_SKILL);
    const roll = crypto.randomInt(1, 101), lv = rollLevel(roll, val), ok = /成功/.test(lv);
    const tK = target === '物理防御' ? 'p' : target === '特殊防御' ? 's' : '', tP = target === '自己' ? me : (target && Object.keys(r.members).find(x => memberInfo(r, x).name === target)) || '';
    const W5 = w4Of(r), dockTry = !tP && W5.dock === 'broken' && baseLoc(getUser(me)) === 'airlock' && b.kind === 'skill' && b.cat === 'fix' && +b.idx === 0;
    const PZ0 = w4Pz(r), loc0 = baseLoc(getUser(me)), nd0 = PZ0.nodes[loc0], gateFix = !!PZ0.reveal && !dockTry && !tP && b.kind === 'skill' && b.cat === 'fix' && +b.idx === 0 && !!nd0 && nd0.k < W4PZ.perOf(loc0) && !PZ0.door, gateRes = !!PZ0.reveal && b.kind === 'skill' && b.cat === 'res' && +b.idx === 0 && loc0 === W4PZ.HACK && W4PZ.total(PZ0) >= W4PZ.MAX && !PZ0.door, gateCi = !!PZ0.reveal && b.kind === 'skill' && b.cat === 'res' && +b.idx === 2 && loc0 === W4PZ.CI_LAB && !!(PZ0.ci || {}).mach, gateComm = !!PZ0.reveal && !tP && b.kind === 'skill' && b.cat === 'fix' && +b.idx === 0 && loc0 === W4PZ.CI_LAB && !(PZ0.ci || {}).comm, gateMach = !!PZ0.reveal && !tP && b.kind === 'skill' && b.cat === 'fix' && +b.idx === 1 && loc0 === W4PZ.CI_LAB && !!(PZ0.ci || {}).sig && !(PZ0.ci || {}).mach, gateEv = !!PZ0.reveal && b.kind === 'skill' && b.cat === 'pilot' && +b.idx === 2 && loc0 === 'lab' && !!W5.pilot && W5.warn > Date.now(), gatePl = !!PZ0.reveal && b.kind === 'skill' && b.cat === 'scan' && +b.idx === 2 && loc0 === 'lab' && !W5.pilot;
    if (gateFix && ok) { PZ0.unl[me + ':' + loc0] = true; if (W4PZ.KIND[loc0] === 'fix') { nd0.k = W4PZ.perOf(loc0); nd0.by.push(memberInfo(r, me).name); if (W4PZ.total(PZ0) >= W4PZ.MAX) gameLog(r, w4T('powerOn'), 'gm', 'bc'); } } if (gateRes && ok) PZ0.hunl[me] = true; if ((gateComm || gateMach) && ok) { PZ0.ci = PZ0.ci || { g: 0, ok: {}, lk: {} }; if (gateComm) PZ0.ci.comm = true; else PZ0.ci.mach = true; }
    if (gateCi && ok) { PZ0.ci = PZ0.ci || { g: 0, ok: {}, lk: {} }; (PZ0.ci.u = PZ0.ci.u || {})[me] = true; if ((PZ0.ci.g || 0) < 3) PZ0.ci.g = (PZ0.ci.g || 0) + 1; }
    let fix = gateFix ? (ok ? (W4PZ.KIND[loc0] === 'fix' ? '\n' + w4T('trussFixed') : '\n' + w4T('fixOpen')) : '\n' + w4T('fixFail')) : gateRes ? (ok ? '\n' + w4T('resOpen') : '\n' + w4T('resFail')) : gateComm ? '\n' + w4T(ok ? 'commOk' : 'commFail') : gateMach ? '\n' + w4T(ok ? 'machOk' : 'machFail') : gateCi ? (ok ? '\n' + w4T('ciRule', { 语法: W4PZ.CI_RULES[PZ0.ci.g - 1][0] }) : '\n' + w4T('ciFail')) : dockTry ? (ok ? '\n' + w4T('dockOk') : '\n' + w4T('dockFail')) : tP || !(b.kind === 'skill' && b.cat === 'fix' && +b.idx === 2) ? '' : w4Repair(r, me, lv, tK); if (dockTry && ok) W5.dock = 'ok';
    if (lv === '大成功') { const nmB = memberInfo(r, me).name;
      if (gateFix && nd0 && W4PZ.KIND[loc0] !== 'fix' && nd0.k < W4PZ.perOf(loc0)) { nd0.k++; nd0.by.push(nmB); W4PZ.mineNext(PZ0, loc0, me); fix += '\n大成功 · 自动完成一组线路（' + nd0.k + '/' + W4PZ.perOf(loc0) + '）'; if (nd0.k >= W4PZ.perOf(loc0)) gameLog(r, w4T('nodeDone', { 舱段: W4_NAME[loc0] }), 'gm', 'bc'); if (W4PZ.total(PZ0) >= W4PZ.MAX) gameLog(r, w4T('powerOn'), 'gm', 'bc'); }
      if (gateRes && !PZ0.hackDone) { PZ0.hk = Math.min(W4PZ.HPER, (PZ0.hk || 0) + 1); W4PZ.hackNext(PZ0, me); fix += '\n大成功 · 自动完成一组覆写（' + PZ0.hk + '/' + W4PZ.HPER + '）'; if (PZ0.hk >= W4PZ.HPER) { PZ0.hackDone = nmB; PZ0.door = true; const fxU = r.game.fx = r.game.fx || {}; fxU.unlock = (fxU.unlock || 0) + 1; gameLog(r, w4T('hackDone', { 人: nmB }), 'gm', 'bc'); } }
      if (gateCi) { const ci = PZ0.ci = PZ0.ci || { g: 0, ok: {}, lk: {} }; ci.ok = ci.ok || {}; const ci_i = W4PZ.CI_SENTS.findIndex((_, i) => !ci.ok[i]); if (ci_i >= 0) { ci.ok[ci_i] = nmB; const fxC = r.game.fx = r.game.fx || {}; fxC.ci = (fxC.ci || 0) + 1; fxC.ciI = ci_i; fxC.ciBy = me; fix += '\n大成功 · 自动破译一段密文'; } } }
    if (gatePl) { if (ok) W5.pilot = true; fix = '\n' + w4T(ok ? 'plOk' : 'plFail'); }
    if (gateEv) { if (ok) W5.warn = 0; fix = '\n' + w4T(ok ? 'evOk' : 'evFail'); if (lv === '大失败') { W5.warn = 0; w4Strike(r); } }
    if (lv === '大失败' && b.kind === 'skill' && b.cat === 'fix' && +b.idx === 0) { const sh = shipGet(); if ([...W4_MODS, 'cockpit'].includes(loc0) && !(sh.broken || []).includes(loc0) && !sh.lost.includes(loc0)) { const d = defOf(sh, loc0), dmg = crypto.randomInt(1, 4), nv = Math.max(0, d.p - dmg); sh.def[loc0] = { ...(sh.def[loc0] || {}), p: nv }; shipSet(sh); fix += '\n操作失误 · ' + W4_NAME[loc0] + '物理防御 −' + (d.p - nv) + ' → ' + nv + '/30'; } }
    if (tP && label === '神经调谐') { const g0 = r.game, tn = memberInfo(r, tP).name; if (!(g0.mad || {})[tP] && !(g0.pendMad || {})[tP]) fix = '\n【' + tn + '】并没有陷入疯狂'; else if (ok) { delete g0.mad[tP]; delete (g0.pendMad || {})[tP]; mSet(r, tP, 'sane', true); fix = '\n【' + tn + '】的神经被重新调谐 · 恢复了理智'; } else fix = '\n神经调谐没有起效'; }
    if (tP && ok && (label === '生理急救' || label === '医学治疗')) { const tn = memberInfo(r, tP).name, i0 = mGet(r, tP), mx = hpMaxOf(i0 && i0.stats);
      if (isDead(r, tP)) fix = '\n【' + tn + '】已死亡，无法救治';
      else if (label === '生理急救') { const n = lv === '大成功' ? crypto.randomInt(1, 4) : 1, got = w4Heal(r, tP, n); fix = '\n【' + tn + '】HP +' + got + ' → ' + hpNow(mGet(r, tP)) + '/' + mx; }
      else { const W0 = w4Of(r); W0.treat = W0.treat || {}; W0.treat[tP] = { loc: w4LocOf(r, tP), next: Date.now() + W4_HEAL_GAP, by: info.name }; let im = ''; if (lv === '大成功') { const got = w4Heal(r, tP, crypto.randomInt(1, 4)); im = ' · 立即 HP +' + got; } fix = '\n【' + tn + '】开始接受医学治疗' + im + ' · 之后每 10 分钟恢复 1d3 HP，离开所在舱室即中断'; } }
    gameLog(r, '【' + info.name + '】' + on + (item ? '借助【' + item + '】' : '') + '进行【' + label + '】检定\nD100=' + roll + '/' + val + ' ' + lv + fix, 'roll', lv);
    if (dockTry && ok) w4Bc(r, w4T('bcDockOk'));
    if (lv === '大失败') { const mi0 = mGet(r, me); if (mi0) mSet(r, me, 'er', Math.min(100, (+mi0.er || 0) + 20)); }
    w4Scan(r); mainSave(r); return res.json({ room: fieldOut(req.params.id) });
  }
  if (!g.free && g.order[g.turn] !== me) return bad(res, '还没轮到你', 409);
  if ((g.free || r.main) && !(r.gm && Date.now() - r.gm.t < 30000)) return bad(res, '当前没有调度员在线，暂时无法申请行动', 409);
  if (g.state !== 'act') return bad(res, '已有待处理的申请', 409);
  const target = str(b.target, 24), info = memberInfo(r, me), item = str(b.item, 30);
  if (item && ![...(r.members[me].items || []), ...((g.loot || {})[me] || [])].includes(item)) return bad(res, '物品不在背包中');
  if (b.kind === 'skill') { const lab0 = (SKILL_LABELS[b.cat] || [])[+b.idx], dv = defOf(shipGet(), 'sc' + req.params.id); if (lab0 === '物质解析' && !dv.ana) return bad(res, '物质解析器械已损坏，无法使用该技能', 409); if (lab0 === '医学治疗' && !dv.med) return bad(res, '医疗器械已损坏，无法使用该技能', 409); }
  if (b.kind === 'skill') { const L = SKILL_LABELS[b.cat], i = +b.idx; if (!L || !(i >= 0 && i < 3)) return bad(res, '无效技能'); const grp = (info.skills || []).find(x => x.cat === b.cat); g.pending = { uid: me, name: info.name, kind: 'skill', label: L[i], val: grp ? +grp.v[i] : 1, target, item }; }
  else if (b.kind === 'stat') { const S = STAT_KEYS.find(x => x[1] === b.key); if (!S) return bad(res, '无效属性'); g.pending = { uid: me, name: info.name, kind: 'skill', label: S[0], val: +((info.stats || {})[b.key]) || 0, target, item }; }
  else if (b.kind === 'free') { if (!target && !item) return bad(res, '请填写目标或选择物品'); g.pending = { uid: me, name: info.name, kind: 'free', target, item }; }
  else return bad(res, '无效行动');
  try { const hs = coopList(r, me, b); if (hs.length) g.pending.helpers = hs; } catch (e) { g.pending = null; return bad(res, e.message, 409); }
  g.state = 'pending'; res.json({ room: fieldOut(req.params.id) });
});
api.post('/field/rooms/:id/say', auth, once, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game, b = req.body || {}; if (!g) return bad(res, '游戏未开始', 409);
  const text = str(b.text, 300); if (!text) return bad(res, '内容为空');
  const asGm = !!b.gm && isAdmin(req.user.id); if (!asGm && !r.members[req.user.id]) return bad(res, '你不在该舰上', 403); if (!asGm && ((g.mad || {})[req.user.id] || {}).no === 9) return bad(res, '你无法组织语言', 403); if (!asGm && ((g.mad || {})[req.user.id] || {}).no === 1) return bad(res, '你处于昏迷中，无法 RP', 403); const foamU = !asGm && ((isDead(r, req.user.id) && !!r.w4 && !!(w4Of(r).foam || {})[req.user.id]) || (!!r.main && req.user.dead === 2)); if (!asGm && isDead(r, req.user.id) && !foamU) return bad(res, '你已死亡', 403);
  const to = asGm && b.to && r.members[b.to] ? b.to : '';
  { const lk = (asGm ? 'gm:' : '') + req.user.id, now = Date.now(), ls = (g.lastSay = g.lastSay || {})[lk]; if (ls && ls.text === text && now - ls.t < 8000) return res.json({ room: fieldOut(req.params.id, isAdmin(req.user.id)) }); g.lastSay[lk] = { text, t: now }; }
  if (asGm) { const as = GM_AS[b.as] ? b.as : 'narr'; gameLog(r, '【' + GM_AS[as] + '】：' + text, 'gm', as, to ? { to } : null); } else gameLog(r, foamU ? text : '【' + memberInfo(r, req.user.id).name + '】：' + text, 'rp', foamU ? 'foam' : !r.fun && !g.free && g.order[g.turn] !== req.user.id ? 'off' : '');
  res.json({ room: fieldOut(req.params.id, isAdmin(req.user.id)) });
});
api.post('/field/rooms/:id/funstart', auth, once, (req, res) => {
  const r = fieldRoom(req.params.id); if (!r || !r.fun) return bad(res, '无效房间', 404); if (!r.members[req.user.id]) return bad(res, '你不在娱乐室中', 403);
  if (r.started) return res.json({ room: fieldOut(req.params.id) });
  const ms = Object.values(r.members); if (ms.length < FUN_MIN) return bad(res, '至少 ' + FUN_MIN + ' 人才能开始', 409); if (ms.some(x => !x.ready)) return bad(res, '全员准备后才能开始', 409);
  funStart(r); res.json({ room: fieldOut(req.params.id) });
});
api.post('/field/rooms/:id/funvote', auth, once, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game, me = req.user.id; if (!r || !r.fun || !g || !g.vote) return bad(res, '游戏未开始', 409); if (!r.members[me]) return bad(res, '你不在本局中', 403);
  const c = g.vote.cur; if (!c) return bad(res, '当前没有进行中的投票', 409);
  const t = str((req.body || {}).target, 24); if (!t || !getUser(t)) return bad(res, '员工不存在', 404);
  c.votes[me] = t; res.json({ room: fieldOut(req.params.id) });
});
api.post('/field/rooms/:id/fundice', auth, once, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game, b = req.body || {}; if (!r || !r.fun || !g) return bad(res, '游戏未开始', 409); if (!r.members[req.user.id]) return bad(res, '你不在本局中', 403); if (r.liar && g.liar && !g.liar.alive.includes(req.user.id)) return bad(res, '你已淘汰，只能发言', 403);
  const n = Math.floor(+b.n), m = Math.floor(+b.m); if (!(n >= 1 && n <= 10) || !(m >= 2 && m <= 1000)) return bad(res, '骰数 1–10，面数 2–1000');
  const rs = Array.from({ length: n }, () => crypto.randomInt(1, m + 1)), sum = rs.reduce((a, c) => a + c, 0);
  gameLog(r, '【' + memberInfo(r, req.user.id).name + '】骰点 ' + n + 'D' + m + '\n' + (n > 1 ? rs.join('+') + ' = ' : '') + sum, 'roll', 'dice'); res.json({ room: fieldOut(req.params.id) });
});
for (const act of ['bjbet', 'bjhit', 'bjstand', 'bjdouble']) api.post('/field/rooms/:id/' + act, auth, once, (req, res) => {
  const r = fieldRoom(req.params.id), b = req.body || {}; if (!r || !r.bj || !r.game || !r.game.bj) return bad(res, '游戏未开始', 409); if (!r.members[req.user.id]) return bad(res, '你不在本局中', 403);
  const me = req.user.id, e = act === 'bjbet' ? BJ.bet(r, me, b.n) : act === 'bjhit' ? BJ.hit(r, me) : act === 'bjstand' ? BJ.stand(r, me) : BJ.dbl(r, me); if (e) return bad(res, e, 409); res.json({ room: fieldOut(req.params.id) });
});
for (const act of ['liarbid', 'liaropen']) api.post('/field/rooms/:id/' + act, auth, once, (req, res) => {
  const r = fieldRoom(req.params.id), b = req.body || {}; if (!r || !r.liar || !r.game || !r.game.liar) return bad(res, '游戏未开始', 409); if (!r.members[req.user.id]) return bad(res, '你不在本局中', 403);
  const e = act === 'liarbid' ? LZ.bid(r, req.user.id, b.n, b.f) : LZ.open(r, req.user.id); if (e) return bad(res, e, 409); res.json({ room: fieldOut(req.params.id) });
});
api.post('/field/rooms/:id/funnext', auth, admin, once, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game; if (!r || !r.fun || !g || !g.vote) return bad(res, '游戏未开始', 409); if (g.vote.end) return bad(res, '游戏已结束', 409);
  if (g.vote.cur) funClose(r); funNext(r); res.json({ room: fieldOut(req.params.id) });
});
api.post('/field/rooms/:id/savelog', auth, admin, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game, b = req.body || {}; if (!g) return bad(res, '游戏未开始', 409);
  const name = str(b.name, 40); if (!name) return bad(res, '请填写 log 名称');
  const members = g.order.map(x => ({ id: x, name: memberInfo(r, x).name }));
  const info = db.prepare('insert into field_logs(name, ship, members, log, by_, created_at) values(?,?,?,?,?,?)').run(name, str(b.ship, 60), JSON.stringify(members), JSON.stringify(g.all || g.log), req.user.id, Date.now());
  res.json({ ok: true, id: info.lastInsertRowid });
});
api.get('/admin/fieldlogs', auth, admin, (req, res) => res.json({ items: db.prepare('select id, name, ship, members, by_, created_at, json_array_length(log) n from field_logs order by id desc').all().map(x => ({ id: x.id, name: x.name, ship: x.ship, members: JSON.parse(x.members || '[]'), by: x.by_, createdAt: x.created_at, n: x.n })) }));
api.get('/admin/fieldlogs/:id', auth, admin, (req, res) => { const x = db.prepare('select * from field_logs where id = ?').get(+req.params.id); if (!x) return bad(res, 'log 不存在', 404); res.json({ item: { id: x.id, name: x.name, ship: x.ship, members: JSON.parse(x.members || '[]'), log: JSON.parse(x.log || '[]'), by: x.by_, createdAt: x.created_at } }); });
api.delete('/admin/fieldlogs/:id', auth, admin, (req, res) => { db.prepare('delete from field_logs where id = ?').run(+req.params.id); res.json({ ok: true }); });
api.post('/field/rooms/:id/cg', auth, admin, once, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game, img = (req.body || {}).image; if (!g) return bad(res, '游戏未开始', 409);
  if (!isImg(img)) return bad(res, '图片格式或大小不支持');
  gameLog(r, '【调度】发送了 CG', 'cg', '', { img, by: req.user.id });
  res.json({ room: fieldOut(req.params.id, true) });
});
api.post('/field/rooms/:id/fx', auth, admin, once, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game, k = (req.body || {}).key; if (!g) return bad(res, '游戏未开始', 409);
  const fx = g.fx = g.fx || {}; if (k === 'bub') { fx.bub = (fx.bub || 0) + 1; fx.bubLoc = '*'; } else if (k === 'hit' || k === 'laugh') fx[k] = (fx[k] || 0) + 1; else if (k === 'warpLv') { const v = Math.round(+(req.body || {}).v); if (!(v >= 1 && v <= 3)) return bad(res, '无效等级'); fx.warpLv = v; } else if (['alarm', 'deep', 'home', 'shake', 'warp'].includes(k)) fx[k] = !fx[k]; else return bad(res, '无效演出');
  res.json({ room: fieldOut(req.params.id, true) });
});
api.post('/field/rooms/:id/dice', auth, admin, once, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game, b = req.body || {}; if (!g) return bad(res, '游戏未开始', 409);
  const n = Math.floor(+b.n), m = Math.floor(+b.m); if (!(n >= 1 && n <= 100) || !(m >= 2 && m <= 1000)) return bad(res, '骰数 1–100，面数 2–1000');
  const rs = Array.from({ length: n }, () => crypto.randomInt(1, m + 1)), sum = rs.reduce((a, c) => a + c, 0);
  gameLog(r, (b.hide ? '〔暗骰〕' : '') + '【调度】骰点 ' + n + 'D' + m + '\n' + (n > 1 ? rs.join('+') + ' = ' : '') + sum, 'roll', 'dice', b.hide ? { hide: true } : null);
  res.json({ room: fieldOut(req.params.id, true) });
});
api.post('/field/rooms/:id/move', auth, once, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game, me = req.user.id, m = r && r.members[me]; if (!g) return bad(res, '游戏未开始', 409); if (!m) return bad(res, '你不在该舰上', 403); if (((g.mad || {})[me] || {}).no === 8) return bad(res, '你紧紧抓着物品，无法移动', 403);
  const L = (g.loot = g.loot || {})[me] = g.loot[me] || [], i = +(req.body || {}).idx, item = L[i]; if (!item) return bad(res, '物品不存在');
  if ((m.items || []).length >= carryOf(statsOf(req.user))) return bad(res, '随身背包已满');
  L.splice(i, 1); m.items = [...(m.items || []), item]; m.lootCarry = [...(m.lootCarry || []), item];
  res.json({ room: fieldOut(req.params.id) });
});
api.post('/field/rooms/:id/cancel', auth, once, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game; if (!g) return bad(res, '游戏未开始', 409);
  if (g.state === 'pending' && g.pending && g.pending.uid === req.user.id) { g.pending = null; g.state = 'act'; }
  res.json({ room: fieldOut(req.params.id) });
});
api.post('/field/rooms/:id/coop', auth, once, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game, me = req.user.id; if (!g) return bad(res, '游戏未开始', 409);
  const p = g.state === 'pending' && g.pending, h = p && (p.helpers || []).find(x => x.uid === me && x.ok == null); if (!h) return bad(res, '没有待确认的协同', 409);
  if ((req.body || {}).ok) h.ok = true; else { p.helpers = p.helpers.filter(x => x !== h); gameLog(r, '【' + h.name + '】否决了协同检定', 'deny'); }
  res.json({ room: fieldOut(req.params.id) });
});
api.post('/field/rooms/:id/judge', auth, admin, once, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game; if (!g) return bad(res, '游戏未开始', 409);
  if (g.state !== 'pending' || !g.pending) return bad(res, '没有待处理的申请', 409);
  if ((req.body || {}).ok && (g.pending.helpers || []).some(x => x.ok !== true)) return bad(res, '等待其他玩家确认', 409);
  const p = g.pending, on = p.target ? '对【' + p.target + '】' : '';
  if (!(req.body || {}).ok) { gameLog(r, '调度驳回了【' + p.name + '】的行动申请', 'deny'); g.pending = null; g.state = 'act'; }
  else if (p.kind === 'skill') { if (p.text) gameLog(r, '【' + p.name + '】：' + p.text, 'free'); const bb = req.body || {}, hs = p.helpers || [], bo = Math.min(4, Math.max(0, Math.min(2, +bb.bonus || 0)) + hs.length), pe = Math.max(0, Math.min(2, +bb.penalty || 0)), need = ['常规', '困难', '极难'].includes(bb.need) ? bb.need : '常规';
    const net = bo - pe, u = crypto.randomInt(0, 10), ts = Array.from({ length: 1 + Math.abs(net) }, () => crypto.randomInt(0, 10)), vals = ts.map(t => (t * 10 + u) || 100), roll = net > 0 ? Math.min(...vals) : net < 0 ? Math.max(...vals) : vals[0], lv = rollLevel(roll, p.val);
    const expr = net === 0 ? 'D100=' + roll : (net > 0 ? 'b' : 'p') + Math.abs(net) + '=D100=' + vals[0] + ', [' + (net > 0 ? '奖励骰' : '惩罚骰') + ':' + ts.slice(1).join(',') + '] = ' + roll;
    const RK = { '大失败': 0, '失败': 1, '常规成功': 2, '困难成功': 3, '极难成功': 4, '大成功': 5 }, met = RK[lv] >= { '常规': 2, '困难': 3, '极难': 4 }[need];
    gameLog(r, '【' + p.name + '】' + (hs.length ? '与' + hs.map(h => '【' + h.name + '】').join('') + '协同，' : '') + on + (p.item ? '借助【' + p.item + '】' : '') + '进行【' + p.label + '】检定 · 需要等级=' + need + '\n' + expr + '/' + p.val + ' ' + lv + (need !== '常规' ? (met ? '（达成）' : '（未达成）') : ''), 'roll', met ? lv : lv === '大失败' ? '大失败' : '未达成'); g.state = 'resolved'; hs.forEach(h => { (g.skip = g.skip || {})[h.uid] = g.round; }); if (lv === '大失败') { const i = mGet(r, p.uid); if (i) mSet(r, p.uid, 'er', Math.min(100, (+i.er || 0) + 20)); } }
  else { if (p.text) gameLog(r, '【' + p.name + '】：' + p.text, 'free'); gameLog(r, '【' + p.name + '】' + on + (p.item ? '使用了【' + p.item + '】' : '进行了人为干涉'), p.item ? 'item' : 'sys'); g.state = 'resolved'; }
  res.json({ room: fieldOut(req.params.id, true) });
});
// 当前行动者把本回合交给本轮尚未行动的队友：两人在本轮内互换位置（先锋舰下一轮恢复原顺序，主舰每轮本就重排）
api.post('/field/rooms/:id/pass', auth, once, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game, me = req.user.id, adm = isAdmin(me), to = String((req.body || {}).to || ''); if (!g) return bad(res, '游戏未开始', 409);
  if (g.free) return bad(res, '自由行动模式无需交接', 409);
  const cur = g.order[g.turn]; if (cur !== me && !adm) return bad(res, '还没轮到你', 409);
  if (g.state !== 'act' || g.pending) return bad(res, '当前回合已有申请，无法交接', 409);
  const j = g.order.indexOf(to); if (j <= g.turn) return bad(res, '只能交给本轮还未行动的队友', 409);
  if (isDead(r, to)) return bad(res, '该队友已死亡', 409);
  if (skipNow(r, to)) return bad(res, '该队友已参与协同检定', 409);
  if (!r.main && !g.base) g.base = g.order.slice();
  g.order[g.turn] = to; g.order[j] = cur;
  gameLog(r, (cur === me ? '【' + memberInfo(r, cur).name + '】将回合交给了【' : '调度将【' + memberInfo(r, cur).name + '】的回合交给了【') + memberInfo(r, to).name + '】', 'sys'); gameTurnLog(r); madSkip(r);
  res.json({ room: fieldOut(req.params.id, adm) });
});
function turnNext(r) {
  const g = r.game;
  g.mad = g.mad || {}; g.hit = g.hit || {}; Object.keys(g.hurt || {}).forEach(x => { g.hit[x] = (g.hit[x] || 0) + 1; }); g.hurt = {};
  Object.keys(g.pendMad || {}).forEach(x => { const t = crypto.randomInt(1, 11), dur = crypto.randomInt(1, 11); g.mad[x] = { no: t, type: madPick(t), left: dur }; madInit(r, x); gameLog(r, '【' + memberInfo(r, x).name + '】陷入疯狂 · 1d10=' + t + '【' + g.mad[x].type + '】（持续 ' + dur + ' 回合）', 'mad'); }); g.pendMad = {};
  g.pending = null; if (!g.free) { if (r.main && !g.order.length) newRound(r); else stepTurn(r); }
  g.state = 'act'; if (!g.free) { gameTurnLog(r); madSkip(r); }
}
api.post('/field/rooms/:id/next', auth, admin, once, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game; if (!g) return bad(res, '游戏未开始', 409);
  turnNext(r); res.json({ room: fieldOut(req.params.id, true) });
});
// 玩家主动结束自己的回合（有待批申请时不行）
api.post('/field/rooms/:id/endturn', auth, once, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game, me = req.user.id; if (!g) return bad(res, '游戏未开始', 409);
  if (g.free) return bad(res, '自由行动模式没有回合', 409);
  if (g.order[g.turn] !== me) return bad(res, '还没轮到你', 409);
  if (g.state === 'pending') return bad(res, '请先取消待批的行动申请', 409);
  gameLog(r, '【' + memberInfo(r, me).name + '】结束了回合', 'sys'); turnNext(r);
  res.json({ room: fieldOut(req.params.id, isAdmin(me)) });
});
const gmHandler = (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game, b = req.body || {}; if (!g) return bad(res, '游戏未开始', 409);
  const i = mGet(r, b.uid); if (!i) return bad(res, '该成员不在舰上', 404);
  const nm = i.name, why = str(b.reason, 60); g.mad = g.mad || {}; g.pendMad = g.pendMad || {}; g.hurt = g.hurt || {};
  if (b.op === 'cut') {
    const n = Math.floor(+b.amount); if (!(n > 0 && n <= 100)) return bad(res, '请输入 1–100 的数值');
    if (b.key === 'hp') { const cur = hpNow(i), nv = Math.max(0, cur - n); mSet(r, b.uid, 'hp', nv); g.hurt[b.uid] = true; gameLog(r, '【' + nm + '】的 HP ' + (why ? '因为' + why : '') + '减少了' + (cur - nv) + '点。', 'hurt'); if (nv === 0) gameLog(r, '【' + nm + '】生命垂危', 'hurt'); }
    else { const S = STAT_KEYS.find(s => s[1] === b.key); if (!S || !i.stats) return bad(res, '无效数值'); const cur = +i.stats[b.key] || 0, nv = Math.max(0, cur - n); const ns = { ...i.stats, [b.key]: nv }; mSet(r, b.uid, 'stats', ns); if (i.hp != null) mSet(r, b.uid, 'hp', Math.min(+i.hp, hpMaxOf(ns))); gameLog(r, '【' + nm + '】的' + S[0] + (why ? '因为' + why : '') + '减少了' + (cur - nv) + '点。', 'hurt'); }
  } else if (b.op === 'add') {
    const n = Math.floor(+b.amount); if (!(n > 0 && n <= 100)) return bad(res, '请输入 1–100 的数值');
    if (b.key === 'hp') { const cur = hpNow(i), nv = Math.min(hpMaxOf(i.stats), cur + n); mSet(r, b.uid, 'hp', nv); gameLog(r, '【' + nm + '】的 HP ' + (why ? '因为' + why : '') + '增加了' + (nv - cur) + '点。', 'heal'); }
    else { const S = STAT_KEYS.find(s => s[1] === b.key); if (!S || !i.stats) return bad(res, '无效数值'); const cur = +i.stats[b.key] || 0, nv = Math.min(100, cur + n); mSet(r, b.uid, 'stats', { ...i.stats, [b.key]: nv }); gameLog(r, '【' + nm + '】的' + S[0] + (why ? '因为' + why : '') + '增加了' + (nv - cur) + '点。', 'heal'); }
  } else if (b.op === 'sane') {
    if (b.value) { const was = !!g.mad[b.uid] || !!g.pendMad[b.uid] || !i.sane; mSet(r, b.uid, 'sane', true); delete g.mad[b.uid]; delete g.pendMad[b.uid]; if (was) gameLog(r, '【' + nm + '】恢复了理智', 'sys'); }
    else { mSet(r, b.uid, 'sane', false); if (!g.mad[b.uid]) g.pendMad[b.uid] = true; }
  } else if (b.op === 'er') mSet(r, b.uid, 'er', Math.max(0, Math.min(100, Math.round(+b.value || 0))));
  else if (b.op === 'erFx' && ['er60', 'er80', 'er100'].includes(b.k)) { if (!r.w4) return bad(res, '仅 W4 主舰可用'); if (isDead(r, b.uid)) return bad(res, '该成员已死亡', 409); w4ErStage(r, b.uid, b.k); }
  else if (b.op === 'erode') {
    if (b.er != null) mSet(r, b.uid, 'er', Math.max(0, Math.min(100, Math.round(+b.er || 0))));
    if (b.mad && !g.mad[b.uid]) { const t = crypto.randomInt(1, 11), dur = crypto.randomInt(1, 11); mSet(r, b.uid, 'sane', false); delete g.pendMad[b.uid]; g.mad[b.uid] = { no: t, type: madPick(t), left: dur }; madInit(r, b.uid); gameLog(r, '【' + nm + '】陷入疯狂 · 1d10=' + t + '【' + g.mad[b.uid].type + '】（持续 ' + dur + ' 回合）', 'mad'); }
  }
  else if (b.op === 'give') { const item = str(b.item, 30); if (!item) return bad(res, '请输入物品名称'); g.loot = g.loot || {}; const L = g.loot[b.uid] = g.loot[b.uid] || []; const cap = Math.floor((+((i.stats || {}).str) || 0) / 20); if (L.length >= cap) return bad(res, '获得栏位已满（' + cap + '）'); L.push(item); gameLog(r, '【' + nm + '】获得了【' + item + '】', 'item'); }
  else if (b.op === 'drop') { g.loot = g.loot || {}; const m = r.members[b.uid]; if (!m) return bad(res, '该成员不在舰上', 404); let from = ''; const arr = b.src === 'loot' ? (g.loot[b.uid] = g.loot[b.uid] || []) : (m.items = m.items || []); const item = arr[+b.idx]; if (!item) return bad(res, '物品不存在'); const tmp = b.src !== 'loot' && (m.temps || []).includes(item); arr.splice(+b.idx, 1); if (b.src !== 'loot' && !m.bot) { const ti = (m.temps || []).indexOf(item), lci = (m.lootCarry || []).indexOf(item); if (ti >= 0) m.temps.splice(ti, 1); else if (lci >= 0) m.lootCarry.splice(lci, 1); else { const uu = getUser(b.uid); if (uu) { const gd = listOf(uu, 'gained'), ps = listOf(uu, 'personal'), gi = gd.indexOf(item); if (gi >= 0) { gd.splice(gi, 1); from = 'gained'; db.prepare('update users set gained = ? where id = ?').run(JSON.stringify(gd), b.uid); } else { const pi = ps.indexOf(item); if (pi >= 0) { ps.splice(pi, 1); from = 'personal'; db.prepare('update users set personal = ? where id = ?').run(JSON.stringify(ps), b.uid); } } } } } g.dropped = g.dropped || []; g.dropped.push({ uid: b.uid, name: nm, item, src: b.src, round: g.round, temp: tmp, from }); gameLog(r, '【' + nm + '】的【' + item + '】被丢弃', 'item'); }
  else if (b.op === 'secret') {
    let label = '', val = 0;
    if (b.kind === 'stat') { const S = STAT_KEYS.find(x => x[1] === b.key); if (!S) return bad(res, '无效属性'); label = S[0]; val = +((i.stats || {})[b.key]) || 0; }
    else { const L = SKILL_LABELS[b.cat], k = +b.idx; if (!L || !(k >= 0 && k < 3)) return bad(res, '无效技能'); const grp = (memberInfo(r, b.uid).skills || []).find(x => x.cat === b.cat); label = L[k]; val = grp ? +grp.v[k] : 1; }
    const roll = crypto.randomInt(1, 101), lv = rollLevel(roll, val);
    gameLog(r, '〔暗投〕【' + nm + '】进行【' + label + '】检定\nD100=' + roll + '/' + val + ' ' + lv, 'roll', lv, { hide: true });
  }
  else if (b.op === 'check') {
    let label = '', val = 0;
    if (b.kind === 'stat') { const S = STAT_KEYS.find(x => x[1] === b.key); if (!S) return bad(res, '无效属性'); label = S[0]; val = +((i.stats || {})[b.key]) || 0; }
    else { const L = SKILL_LABELS[b.cat], k = +b.idx; if (!L || !(k >= 0 && k < 3)) return bad(res, '无效技能'); const grp = (memberInfo(r, b.uid).skills || []).find(x => x.cat === b.cat); label = L[k]; val = grp ? +grp.v[k] : 1; }
    const bo = Math.max(0, Math.min(2, +b.bonus || 0)), pe = Math.max(0, Math.min(2, +b.penalty || 0)), need = ['常规', '困难', '极难'].includes(b.need) ? b.need : '常规';
    const net = bo - pe, u = crypto.randomInt(0, 10), ts = Array.from({ length: 1 + Math.abs(net) }, () => crypto.randomInt(0, 10)), vals = ts.map(t => (t * 10 + u) || 100), roll = net > 0 ? Math.min(...vals) : net < 0 ? Math.max(...vals) : vals[0], lv = rollLevel(roll, val);
    const expr = net === 0 ? 'D100=' + roll : (net > 0 ? 'b' : 'p') + Math.abs(net) + '=D100=' + vals[0] + ', [' + (net > 0 ? '奖励骰' : '惩罚骰') + ':' + ts.slice(1).join(',') + '] = ' + roll;
    const RK = { '大失败': 0, '失败': 1, '常规成功': 2, '困难成功': 3, '极难成功': 4, '大成功': 5 }, met = RK[lv] >= { '常规': 2, '困难': 3, '极难': 4 }[need];
    gameLog(r, (b.hide ? '〔暗投〕' : '') + '【' + nm + '】进行【' + label + '】检定 · 需要等级=' + need + '\n' + expr + '/' + val + ' ' + lv + (need !== '常规' ? (met ? '（达成）' : '（未达成）') : ''), 'roll', met ? lv : lv === '大失败' ? '大失败' : '未达成', b.hide ? { hide: true } : null);
    if (lv === '大失败' && !b.hide) mSet(r, b.uid, 'er', Math.min(100, (+i.er || 0) + 20));
  }
  else if (b.op === 'dog') {
    if (r.main || r.w4) return bad(res, '主舰没有机器狗');
    if (g.dogUsed) return bad(res, '机器狗本次外勤已使用', 409);
    if (isDead(r, b.uid)) return bad(res, '该成员已死亡'); if (hpNow(i) > 0) return bad(res, '只能对 HP 归零的濒死成员使用');
    mSet(r, b.uid, 'hp', Math.min(5, hpMaxOf(i.stats))); mSet(r, b.uid, 'er', Math.min(100, (+i.er || 0) + 20)); g.dogUsed = true;
    gameLog(r, '机器狗救回了【' + nm + '】，HP 恢复了 ' + Math.min(5, hpMaxOf(i.stats)) + ' 点。', 'heal');
  }
  else if (b.op === 'dead') {
    g.dead = g.dead || {}; if (g.dead[b.uid]) return bad(res, '该成员已死亡');
    g.dead[b.uid] = true; delete g.mad[b.uid]; delete g.pendMad[b.uid]; gameLog(r, '【' + nm + '】死亡', 'dead'); if (!r.members[b.uid].bot) db.prepare('update users set dead = 1 where id = ?').run(b.uid);
    if (g.order[g.turn] === b.uid && g.order.some(x => !isDead(r, x))) { g.pending = null; stepTurn(r); g.state = 'act'; gameTurnLog(r); madSkip(r); }
  }
  else if (b.op === 'restore') { const D = g.dropped || [], d = D[+b.idx]; if (!d || d.uid !== b.uid) return bad(res, '记录不存在'); const m = r.members[b.uid], cap = Math.floor((+((i.stats || {}).str) || 0) / 20); if (!m) return bad(res, '该成员不在舰上', 404);
    if (d.src === 'loot') { g.loot = g.loot || {}; const L = g.loot[b.uid] = g.loot[b.uid] || []; if (L.length >= cap) return bad(res, '获得栏位已满（' + cap + '）'); L.push(d.item); }
    else { m.items = m.items || []; if (m.items.length >= cap) return bad(res, '随身背包已满（' + cap + '）'); m.items.push(d.item); if (!m.bot) { const uu = d.from && getUser(b.uid); if (d.temp) m.temps = [...(m.temps || []), d.item]; else if (uu) db.prepare('update users set ' + d.from + ' = ? where id = ?').run(JSON.stringify([...listOf(uu, d.from), d.item]), b.uid); else m.lootCarry = [...(m.lootCarry || []), d.item]; } }
    D.splice(+b.idx, 1); gameLog(r, '【' + nm + '】的【' + d.item + '】被归还', 'item'); }
  else return bad(res, '无效操作');
  if (r.w4) w4Scan(r);
  res.json({ room: fieldOut(req.params.id, isAdmin(req.user.id)) });
};
api.post('/field/rooms/:id/gm', auth, admin, once, gmHandler);
api.post('/field/rooms/:id/selfdrop', auth, once, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game, me = req.user.id, b = req.body || {}; if (!g) return bad(res, '游戏未开始', 409);
  if (!r.members[me]) return bad(res, '你不在该舰上', 403); if (isDead(r, me)) return bad(res, '你已死亡', 403);
  if (((g.mad || {})[me] || {}).no === 8) return bad(res, '你紧紧抓着物品，无法丢弃', 403);
  req.body = { uid: me, op: 'drop', src: b.src === 'loot' ? 'loot' : 'carry', idx: +b.idx }; return gmHandler(req, res);
});
api.post('/field/rooms/:id/again', auth, admin, once, (req, res) => {
  const r = fieldRoom(req.params.id), g = r && r.game; if (!g) return bad(res, '游戏未开始', 409);
  if (g.state !== 'resolved') return bad(res, '当前无法继续', 409);
  g.pending = null; g.state = 'act'; res.json({ room: fieldOut(req.params.id, true) });
});
api.post('/field/rooms/:id/end', auth, admin, (req, res) => {
  const r0 = FIELD[req.params.id]; if (!r0) return bad(res, '无效舰船', 404);
  [...new Set([...Object.keys(r0.members), ...Object.keys((r0.game || {}).loot || {})])].forEach(x => { const m = r0.members[x] || {}, L = [...(((r0.game || {}).loot || {})[x] || []), ...(m.lootCarry || [])]; if (m.bot || /^bot/.test(x) || !L.length) return; const uu = getUser(x); if (uu) db.prepare('update users set gained = ? where id = ?').run(JSON.stringify([...listOf(uu, 'gained'), ...L]), x); });
  if (r0.main || r0.w4) mainClear(r0); FIELD[req.params.id] = r0.w4 ? mkW4() : r0.main ? mkMain() : r0.liar ? mkLiar() : r0.bj ? mkBJ() : r0.fun ? mkFun() : { members: {}, started: false }; fieldBots(req.params.id); res.json({ room: fieldOut(req.params.id, true) });
});
api.post('/field/rooms/:id/reset', auth, admin, (req, res) => {
  if (!FIELD[req.params.id]) return bad(res, '无效舰船', 404);
  if (FIELD[req.params.id].main || FIELD[req.params.id].w4) mainClear(FIELD[req.params.id]); FIELD[req.params.id] = FIELD[req.params.id].w4 ? mkW4() : FIELD[req.params.id].main ? mkMain() : FIELD[req.params.id].liar ? mkLiar() : FIELD[req.params.id].bj ? mkBJ() : FIELD[req.params.id].fun ? mkFun() : { members: {}, started: false }; fieldBots(req.params.id); res.json({ room: fieldOut(req.params.id, true) });
});

// ---- 一览 · 飞船状态 ----
addCol('users', 'loc', "text default ''");
addCol('users', 'dead', 'integer default 0');
db.exec('create table if not exists kv(k text primary key, v text)');
mainLoad();
const SHIP_MODS = ['cockpit', 'airlock', 'rcs', 'lab', 'dock', 'farm', 'med', 'hab1', 'hab2', 'ring', 'truss', 'gen', 'fuel', 'fusion', 'drive'];
const SHIP_NOENTRY = ['ring', 'gen', 'fuel', 'fusion', 'drive'];
const SHIP_MODES = ['cruise', 'burn', 'dock', 'anomaly', 'lost'];
const SHIP_DEF = () => ({ def: {}, imgs: {}, lost: [], R: 0, legs: [{ r: 6, n: 15 }, { r: 5, n: 15 }, { r: 4, n: 20 }], at: 1, mode: 'cruise' });
const shipGet = () => { try { const x = db.prepare("select v from kv where k = 'ship'").get(); return { ...SHIP_DEF(), ...(x ? JSON.parse(x.v) : {}) }; } catch (e) { return SHIP_DEF(); } };
const defOf = (s, id) => ({ p: 30, s: 30, ana: true, med: true, ...(((s || {}).def || {})[id] || {}) });
const shipSet = s => db.prepare("insert or replace into kv(k, v) values('ship', ?)").run(JSON.stringify(s));
const sortieOf = id => { for (const k of Object.keys(FIELD)) { const r = FIELD[k]; if (!r.main && !r.w4 && !r.fun && r.started && r.members[id]) return 'sc' + k; } return ''; };
const HABS = ['hab1', 'hab2'], randHab = () => HABS[crypto.randomInt(0, 2)];
// 首次上线：仅给还没有位置的成员随机分配到两个居住模块（只填空值，永不覆盖已有位置；用数据库标记保证只执行一次）
if (!db.prepare("select 1 from kv where k = 'ship_seeded'").get()) {
  const tx = db.transaction(() => { db.prepare("select id from users where loc is null or loc = ''").all().forEach(u => db.prepare("update users set loc = ? where id = ? and (loc is null or loc = '')").run(randHab(), u.id)); db.prepare("insert or replace into kv(k, v) values('ship_seeded', ?)").run(String(Date.now())); });
  tx();
}
const baseLoc = u => { if (u && SHIP_MODS.includes(u.loc)) return u.loc; if (!u || !u.id) return 'hab1'; const h = randHab(); db.prepare("update users set loc = ? where id = ? and (loc is null or loc = '')").run(h, u.id); const x = db.prepare('select loc from users where id = ?').get(u.id); return (x && x.loc) || h; };
const shipOut = me => ({
  meDead: !!(getUser(me) || {}).dead,
  ship: shipGet(), me: sortieOf(me) || baseLoc(getUser(me)),
  fleet: Object.keys(FIELD).filter(k => !FIELD[k].fun).map(k => ({ id: +k, started: !!FIELD[k].started, ids: FIELD[k].started ? Object.keys(FIELD[k].members) : [] })),
  crew: db.prepare('select id, name, dept, loc, dead, er from users').all().map(u => ({ id: u.id, name: realName(u.id, u.name), dept: u.dept || '', loc: sortieOf(u.id) || baseLoc(u), dead: !!u.dead, er: +u.er || 0 }))
});
api.get('/ship', auth, (req, res) => res.json(shipOut(req.user.id)));
const W4PZ = (() => {
  const R = n => Math.floor(Math.random() * n), rot = (m, k) => { k = ((k % 4) + 4) % 4; while (k--) m = ((m << 1) | (m >> 3)) & 15; return m; };
  const NODES = [['airlock', '气密兼对接模块'], ['truss', '三级总控'], ['dock', '实验兼多功能对接模块']], HACK = 'truss', PER = 24, MAX = 60, HPER = 12, PERS = { airlock: 24, dock: 24, truss: 12 }, KIND = { airlock: 'path', dock: 'circ', truss: 'brk' }, CODES = ['1C', '55', 'BD', 'E9', '7A', 'FF'];
  const DIRS = [[-1, 0, 1, 4], [0, 1, 2, 8], [1, 0, 4, 1], [0, -1, 8, 2]];
  function powered(c, rots) { const n = c.n, m = c.m.map((x, i) => rot(x, (rots && rots[i]) || 0)), st = c.sr * n, seen = new Set(); if (!(m[st] & 8)) return { seen, ok: false, m }; seen.add(st); const q = [st]; let ok = false;
    while (q.length) { const i = q.shift(), r = Math.floor(i / n), cc = i % n; if (r === c.er && cc === n - 1 && (m[i] & 2)) ok = true;
      DIRS.forEach(([dr, dc, bit, op]) => { if (!(m[i] & bit)) return; const a = r + dr, b = cc + dc; if (a < 0 || b < 0 || a >= n || b >= n) return; const j = a * n + b; if (seen.has(j) || !(m[j] & op)) return; seen.add(j); q.push(j); }); }
    return { seen, ok, m }; }
  const circOk = (c, rots) => powered(c, rots).ok;
  function circGen(n) { n = n || 5;
    for (let t = 0; t < 400; t++) { const sr = R(n), er = R(n), seen = new Set(), path = []; let steps = 0;
      const dfs = (r, c) => { if (++steps > 4000) return false; path.push([r, c]); seen.add(r * n + c); if (r === er && c === n - 1) { if (path.length >= n + 3) return true; } else { const ds = DIRS.slice().sort(() => Math.random() - 0.5); for (const [dr, dc] of ds) { const a = r + dr, b = c + dc; if (a < 0 || b < 0 || a >= n || b >= n || seen.has(a * n + b)) continue; if (dfs(a, b)) return true; } } path.pop(); seen.delete(r * n + c); return false; };
      if (!dfs(sr, 0)) continue;
      const sol = Array.from({ length: n * n }, () => rot([5, 3, 7, 3][R(4)], R(4)));
      path.forEach(([r, c], i) => { let m = 0; [path[i - 1], path[i + 1]].forEach(p => { if (p) DIRS.forEach(([dr, dc, bit]) => { if (r + dr === p[0] && c + dc === p[1]) m |= bit; }); }); if (i === 0) m |= 8; if (i === path.length - 1) m |= 2; sol[r * n + c] = m; });
      const c0 = { n, sr, er, m: sol.map(x => rot(x, R(4))) }; if (circOk(c0)) continue; return c0; }
    return null; }
  function hexGen(n, buf, len) { n = n || 5; buf = buf || 6; len = len || 3;
    for (let t = 0; t < 400; t++) { const g = Array.from({ length: n * n }, () => CODES[R(CODES.length)]), used = new Set(); let r = 0, c = R(n), ok = true; const p = [[r, c]]; used.add(c);
      for (let i = 1; i < buf; i++) { const o = []; for (let k = 0; k < n; k++) { const a = i % 2 ? k : r, b = i % 2 ? c : k; if (!used.has(a * n + b)) o.push([a, b]); } if (!o.length) { ok = false; break; } [r, c] = o[R(o.length)]; used.add(r * n + c); p.push([r, c]); }
      if (!ok) continue; const k0 = R(buf - len + 1); return { n, buf, g, seq: p.slice(k0, k0 + len).map(([a, b]) => g[a * n + b]) }; }
    return null; }
  function hexOk(h, path) { if (!Array.isArray(path) || !path.length || path.length > h.buf) return false; const n = h.n, used = new Set(); let pr = -1, pc = -1;
    for (let i = 0; i < path.length; i++) { const r = +(path[i] || [])[0], c = +(path[i] || [])[1]; if (!(r >= 0 && c >= 0 && r < n && c < n) || used.has(r * n + c)) return false; if (i === 0 ? r !== 0 : i % 2 ? c !== pc : r !== pr) return false; used.add(r * n + c); pr = r; pc = c; }
    return (' ' + path.map(([r, c]) => h.g[r * n + c]).join(' ') + ' ').includes(' ' + h.seq.join(' ') + ' '); }
  const perOf = id => PERS[id] || PER;
  function pathGen(n, rnd) { n = n || 5; rnd = rnd || Math.random; const R = k => Math.floor(rnd() * k); const adjc = (seen, r, c) => DIRS.map(([dr, dc]) => [r + dr, c + dc]).filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n && !seen.has(a * n + b));
    for (let t = 0; t < 600; t++) { const seen = new Set(), p = []; let r = R(n), c = R(n); seen.add(r * n + c); p.push(r * n + c);
      for (;;) { const o = adjc(seen, r, c); if (!o.length) break; o.sort(() => rnd() - 0.5); o.sort((x, y) => adjc(seen, x[0], x[1]).length - adjc(seen, y[0], y[1]).length); [r, c] = rnd() < 0.8 ? o[0] : o[R(o.length)]; seen.add(r * n + c); p.push(r * n + c); }
      if (p.length >= 26 && (p.length <= n * n - 2 || t > 300)) return { n, s: p[0], open: p.slice().sort((a, b) => a - b) }; }
    return null; }
  function pathOk(pc, p) { if (!pc || !Array.isArray(p) || p.length !== pc.open.length) return false; const op = new Set(pc.open), seen = new Set(), n = pc.n;
    for (let i = 0; i < p.length; i++) { const v = +p[i]; if (!op.has(v) || seen.has(v)) return false; if (i) { const u = +p[i - 1]; if (Math.abs(Math.floor(u / n) - Math.floor(v / n)) + Math.abs(u % n - v % n) !== 1) return false; } seen.add(v); }
    return true; }
  const seeded = str => { let h = 2166136261; for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => { h += 0x6D2B79F5; let z = h; z = Math.imul(z ^ (z >>> 15), z | 1); z ^= z + Math.imul(z ^ (z >>> 7), z | 61); return ((z ^ (z >>> 14)) >>> 0) / 4294967296; }; };
  function brkGen(rnd) { rnd = rnd || Math.random; const n = 4, N = n * n, tg = (s, i) => { const r = Math.floor(i / n), c = i % n; [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < n && cc >= 0 && cc < n) s[rr * n + cc] ^= 1; }); };
    for (let t = 0; t < 50; t++) { const s = Array(N).fill(1), k = 3 + Math.floor(rnd() * 3), used = new Set(); while (used.size < k) used.add(Math.floor(rnd() * N)); used.forEach(i => tg(s, i)); if (s.some(x => !x)) return { n, s }; } return { n, s: [1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1] }; }
  function brkApply(c, ps) { const n = c.n, s = c.s.slice(); (ps || []).forEach(i => { i = +i; if (!(i >= 0 && i < n * n)) return; const r = Math.floor(i / n), cc = i % n; [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => { const rr = r + dr, c2 = cc + dc; if (rr >= 0 && rr < n && c2 >= 0 && c2 < n) s[rr * n + c2] ^= 1; }); }); return s; }
  const brkOk = (c, ps) => !!c && Array.isArray(ps) && ps.length <= 40 && brkApply(c, ps).every(x => x === 1);
  const gen = (id, seed) => KIND[id] === 'path' ? pathGen(6, seed != null ? seeded(seed) : null) : KIND[id] === 'circ' ? circGen(5) : KIND[id] === 'brk' ? brkGen(seed != null ? seeded(seed) : null) : null;
  function hopGen(rnd) { rnd = rnd || Math.random; const Rr = k => Math.floor(rnd() * k), n = 5, buf = 7, len = 3;
    for (let t = 0; t < 500; t++) { const g = Array.from({ length: n * n }, () => CODES[Rr(CODES.length)]), j = Array.from({ length: n * n }, () => 1 + Rr(2)), s = Rr(n * n), used = new Set([s]), p = []; let cur = s;
      for (let i = 0; i < buf; i++) { const o = hopNext({ n, j }, cur).filter(x => !used.has(x)); if (!o.length) break; cur = o[Rr(o.length)]; used.add(cur); p.push(cur); }
      if (p.length < buf) continue; const k0 = Rr(buf - len + 1); return { n, buf, g, j, s, seq: p.slice(k0, k0 + len).map(x => g[x]) }; }
    return null; }
  function hopNext(h, i) { const n = h.n, r = Math.floor(i / n), c = i % n, d = h.j[i]; return [[r - d, c], [r + d, c], [r, c - d], [r, c + d]].map(([a, b]) => ((a % n) + n) % n * n + ((b % n) + n) % n); }
  function hopOk(h, path) { if (!h || !Array.isArray(path) || !path.length || path.length > h.buf) return false; const used = new Set([h.s]); let cur = h.s;
    for (const v0 of path) { const v = +v0; if (!(v >= 0 && v < h.n * h.n) || used.has(v) || !hopNext(h, cur).includes(v)) return false; used.add(v); cur = v; }
    return (' ' + path.map(v => h.g[+v]).join(' ') + ' ').includes(' ' + h.seq.join(' ') + ' '); }
  const RG_OPS = { L: ['ROL / 左移', x => ((x << 1) | (x >> 7)) & 255], R: ['SHIFT / 右移', x => ((x >> 1) | ((x & 1) << 7)) & 255], N: ['NOT / 取反', x => x ^ 255], V: ['REV / 倒序', x => { let y = 0; for (let i = 0; i < 8; i++) if (x & (1 << i)) y |= 1 << (7 - i); return y; }], H: ['左半亮灭反', x => x ^ 240], T: ['右半亮灭反', x => x ^ 15] };
  const rgApply = (h, id, x) => RG_OPS[id] ? RG_OPS[id][1](x) : x;
  function regGen(rnd) { rnd = rnd || Math.random; const Rr = k => Math.floor(rnd() * k), base = Object.keys(RG_OPS);
    for (let t = 0; t < 300; t++) { const h = { ops: ['N', 'R', 'V'] }, a = 1 + Rr(254), dist = new Map([[a, 0]]), q2 = [a];
      while (q2.length) { const x = q2.shift(), d = dist.get(x); if (d >= 3) continue; h.ops.forEach(o => { const y = rgApply(h, o, x); if (!dist.has(y)) { dist.set(y, d + 1); q2.push(y); } }); }
      const far = [...dist].filter(([, d]) => d >= 2 && d <= 3); if (!far.length) continue; const [tg, d] = far[Rr(far.length)]; return { a, t: tg, ops: h.ops, lim: d + 2 }; }
    return { a: 15, t: 240, ops: ['N', 'L', 'V'], lim: 3 }; }
  function regOk(h, ops) { if (!h || !Array.isArray(ops) || ops.length > h.lim) return false; let x = h.a; for (const o of ops) { if (!h.ops.includes(o)) return false; x = rgApply(h, o, x); } return x === h.t; }
  const TXT0 = {"nodeDone":"【系统】：{舱段}线路已全部桥接。","powerOn":"【系统】：舰桥门禁供电恢复 · 门禁程序需在三级总控接管。","hackDone":"【系统】：门禁程序接管成功（{人}）· 舰桥舱门已解锁。","hackFail":"【系统】：门禁入侵失败（{人}）· 终端锁定 60 秒。","doorGm":"【系统】：舰桥舱门已解锁。","ciSolved":"【密文解意】：「{译文}」（{人}）","fixOpen":"门禁线路检修口已打开。","fixFail":"未能打开门禁线路检修口。","trussFixed":"三级总控门禁线路已修复","resOpen":"已接入门禁程序 · 可以开始骇入。","resFail":"未能接入门禁程序。","ciRule":"解析出一条密文语法：{语法}。","ciFail":"未能解析出新的语法。","dockOk":"对接模块紧急修复完成 · 双向气阀恢复工作。","dockFail":"对接模块紧急修复失败 · 气阀仍未响应。","foam":"【{人}】的轮廓开始起泡、透明……化作了泡沫。","uiFix":"使用机械维修进行桥接。","uiTruss":"使用机械维修修复三级总控门禁线路。","uiRes":"使用信息重构接管门禁程序。","uiDoor":"舱门已解锁","ulTop":"OVERRIDE ACCEPTED // BRIDGE ACCESS","ulText":"舰桥舱门已解锁","commOk":"主实验模块通讯阵列已修复。","commFail":"未能修复通讯阵列。","machOk":"拟合仪缺失部件已补全。","machFail":"未能制作出合适的部件。","warn":"前方即将遭遇未判明行动源，【噪音】主驾驶信号异常...请二级主控进行机动规避。","evOk":"机动规避成功，主舰已规避。","evFail":"机动规避失败。","plLock":"驾驶面板离线，请主动接管。","plOk":"已识别行动源信号 · 二级驾驶面板上线","plFail":"未能识别行动源信号","plIdle":"航线上暂无未判明行动源","evac":"舰桥完整性急剧下降，请在60秒内立刻撤离舰桥及气密模块。","boomMain":"警告——驾驶兼总控模块发生爆炸！","boomVan":"主舰方向传来强烈闪光——MSV-05 驾驶模块发生爆炸！","dockHit":"气密兼对接模块受到冲击 · 双向气阀失效 · 需要紧急维修才能接驳先锋舰","bcDockOk":"气密兼对接模块双向气阀已恢复 · 先锋舰可以开始接驳","bcVdock":"先锋舰{号}号已完成接驳 · 船员正在登舰","bcStrike":"舰体遭到无法判明的行动源撞击！{舱段}受损","bcBreak":"{舱段}结构损毁！相邻舱段已封锁，需穿戴宇航服通行","bcFixed":"{舱段}已完成紧急修复","bcDefOut":"{防御}已耗尽","bcDefLow":"{防御}告急（{值}/30）","ciSig":"先锋舰已发送未判明信号加急样本，请前往主实验模块进行拟合。","uiComm":"主实验模块通讯阵列故障。","uiWait":"通讯已恢复。","uiMach":"拟合仪故障。"}, TXT_LBL = {"nodeDone":"桥接 · 某舱段全部完成","powerOn":"桥接 · 三处全部完成","hackDone":"骇入 · 12 组完成","hackFail":"骇入 · 失败锁定","doorGm":"调度强制开门","ciSolved":"密文 · 破译一句","fixOpen":"骰点结果 · 检修口打开","fixFail":"骰点结果 · 检修口未打开","trussFixed":"骰点结果 · 三级总控修复","resOpen":"骰点结果 · 接入门禁程序","resFail":"骰点结果 · 未接入门禁程序","ciRule":"骰点结果 · 解锁密文语法","ciFail":"骰点结果 · 未解锁语法","dockOk":"骰点结果 · 对接模块修复","dockFail":"骰点结果 · 对接模块修复失败","foam":"ER 满 · 化作泡沫","uiFix":"桥接页 · 机械维修提示","uiTruss":"桥接页 · 三级总控提示","uiRes":"桥接页 · 信息重构提示","uiDoor":"桥接页 · 舱门已解锁","ulTop":"解锁演出 · 第一行","ulText":"解锁演出 · 结尾字","commOk":"骰点结果 · 通讯阵列修复","commFail":"骰点结果 · 通讯修复失败","machOk":"骰点结果 · 拟合仪修复","machFail":"骰点结果 · 拟合仪修复失败","warn":"撞击警告 · 广播","evOk":"机动规避 · 成功","evFail":"机动规避 · 失败","plLock":"驾驶面板 · 未解锁提示","plOk":"骰点结果 · 驾驶面板解锁","plFail":"骰点结果 · 驾驶面板未解锁","plIdle":"驾驶面板 · 无威胁","evac":"舰桥撤离 · 弹窗正文","boomMain":"爆炸 · 主舰广播","boomVan":"爆炸 · 先锋舰广播","dockHit":"爆炸 · 气密模块受损广播","bcDockOk":"广播 · 气阀恢复","bcVdock":"广播 · 先锋舰接驳完成（{号}）","bcStrike":"广播 · 行动源撞击（{舱段}）","bcBreak":"广播 · 模块损毁（{舱段}）","bcFixed":"广播 · 模块紧急修复（{舱段}）","bcDefOut":"广播 · 防御耗尽（{防御}）","bcDefLow":"广播 · 防御告急（{防御} {值}）","ciSig":"先锋舰来讯 · 弹窗正文","uiComm":"拟合页 · 通讯故障提示","uiWait":"拟合页 · 等待来讯","uiMach":"拟合页 · 仪器故障提示"};
  const tx = (over, k, v) => String((over && over[k]) || TXT0[k] || '').replace(/\{([^{}]+)\}/g, (m, n) => v && v[n] != null ? v[n] : m);
  const ERL0 = {"er60":["？？？：【{人}】突然感到世界开始摇晃。","？？？：【{人}】突然感到耳边传来尖锐的啸叫。","？？？：【{人}】眼前的舱壁像水面一样泛起了波纹。","？？？：【{人}】听见舱外有什么东西在叫自己的名字。"],"er80":["？？？：【{人}】的身影开始变得透明。","？？？：【{人}】的身形开始沸腾。","？？？：【{人}】的指尖渗出细小的气泡。"],"er100":["？？？：【{人}】在众人面前变成了泡沫。"]}, ERL_LBL = {"er60":"ER ≥ 60 · 意志坚定检定前","er80":"ER ≥ 80","er100":"ER = 100 · 化作泡沫"};
  const erLine = (over, k, nm) => { const L = (over && Array.isArray(over[k]) && over[k].length) ? over[k] : ERL0[k] || ['']; return String(L[Math.floor(Math.random() * L.length)]).replace(/\{人\}/g, nm); };
  const garble = (t, seed) => { const rnd = seeded('g' + seed), G = '░▒▓▚▞▙▟◌◍◎∷∵∴≋≈⌇⍿⎍⏃'; return Array.from(String(t)).map(ch => /\s/.test(ch) ? ch : G[Math.floor(rnd() * G.length)]).join(''); };
  const CI_ROOTS = [['S', '前进'], ['T', '我们'], ['U', '投信石'], ['V', '摇篮'], ['W', '进食'], ['X', '珊瑚'], ['Y', '存在'], ['Z', '他者'], ['α', '天空 · 冰壳']], CI_RULES = [['反相', '谱线倒置 · 方向相反'], ['断线', '谱线中断 · 破碎 / 无法'], ['空段', '句末空白段 · 疑问']], CI_LAB = 'lab';
  const CI_GLOSS = ['我们', '家', '我们的天空', '前进', '暗流', '人类', '天空断裂', '异常地涌动', '后退', '我', '深蓝色', '无法逃离', '母亲', '恐惧', '消失', '存在', '进食', '何处？', '灰白色', '彼此', '他者', '摇篮', '愿景', '生存'];
  const CI_SENTS = [{ segs: [[['T', 1], ['α', 1]], [['α', 1, 'd']]], ans: ['我们的天空', '天空断裂'], tr: '冰壳（他们的天空）在断裂' }, { segs: [[['U', 2], ['S', 1]], [['Z', 2], ['S', 1]]], ans: ['暗流', '异常地涌动'], tr: '暗流异常涌动' }, { segs: [[['T', 1]], [['S', 1, 'rd']]], ans: ['我们', '无法逃离'], tr: '我们无力逃离' },
    { segs: [[['T', 0.5]], [['Z', 1], ['W', 1]]], ans: ['我', '恐惧'], tr: '我害怕' }, { segs: [[['T', 1]], [['Y', 1]], []], ans: ['我们', '存在', '何处？'], tr: '族群在哪里' }, { segs: [[['T', 1]], [['T', 0.5], ['T', 0.5]], [['V', 1]]], ans: ['我们', '彼此', '摇篮'], tr: '让我们彼此依靠' }];
  const ciOk = (i, a) => { const s = CI_SENTS[i]; return !!s && Array.isArray(a) && a.length === s.ans.length && s.ans.every((x, k) => CI_GLOSS[+a[k]] === x); };
  const fresh = v => ({ v: (v || 0) + 1, nodes: Object.fromEntries(NODES.map(([id]) => [id, { k: 0, c: gen(id), by: [] }])), hack: regGen(), hackDone: '', hk: 0, ci: { g: 0, ok: {}, lk: {} }, lock: 0, door: false, unl: {}, hunl: {}, reveal: false });
  const fix = pz => { if (!pz) return fresh(0); NODES.forEach(([id]) => { const x = pz.nodes[id] = pz.nodes[id] || { k: 0, c: gen(id), by: [] }; if (x.k == null) { x.k = x.done ? perOf(id) : 0; x.by = x.by || []; } if (KIND[id] === 'path' ? !(x.c && x.c.open && x.c.n === 6) : KIND[id] === 'circ' ? !(x.c && x.c.m) : KIND[id] === 'brk' ? !(x.c && x.c.s) : false) x.c = gen(id, (pz.v || 0) + ':' + id + ':' + x.k); }); pz.unl = pz.unl || {}; pz.hunl = pz.hunl || {}; pz.hk = pz.hk || 0; if (!pz.hack || !pz.hack.ops || pz.hack.keys || pz.hack.ops.join('') !== 'NRV') pz.hack = regGen(seeded('h:' + (pz.v || 0) + ':' + pz.hk)); pz.ci = pz.ci || { g: 0, ok: {}, lk: {} }; return pz; };
  const total = pz => NODES.reduce((a, [id]) => a + Math.min(perOf(id), ((pz.nodes[id] || {}).k) || 0), 0);
  function mine(pz, loc, uid) { const nd = pz.nodes[loc]; if (!nd) return null; nd.cs = nd.cs || {}; let m = nd.cs[uid]; const j = (m && m.j) || 0; if (!m || !m.c) m = nd.cs[uid] = { j, c: gen(loc, (pz.v || 0) + ':' + loc + ':' + uid + ':' + j) }; return m; }
  function hackOf(pz, uid) { pz.hks = pz.hks || {}; let m = pz.hks[uid]; if (!m || !m.h) { const j = (m && m.j) || 0; m = pz.hks[uid] = { j, h: regGen(seeded('h:' + (pz.v || 0) + ':' + uid + ':' + j)) }; } return m; }
  function hackNext(pz, uid) { const m = hackOf(pz, uid); m.j++; m.h = regGen(seeded('h:' + (pz.v || 0) + ':' + uid + ':' + m.j)); }
  function mineNext(pz, loc, uid) { const m = mine(pz, loc, uid); m.j++; m.c = gen(loc, (pz.v || 0) + ':' + loc + ':' + uid + ':' + m.j); }
  function view(pz, loc, now, uid) { const tot = total(pz), nd = pz.nodes[loc], open = !!nd && nd.k < perOf(loc) && !pz.door, unl = open && (!!pz.unl[uid + ':' + loc] || !!nd.gu), hkOpen = loc === HACK && tot >= MAX && !pz.door, hunl = hkOpen && (!!pz.hunl[uid] || !!pz.hu);
    const o = { v: pz.v, nodes: NODES.map(([id, name]) => ({ id, name, k: Math.min(perOf(id), pz.nodes[id].k || 0), per: perOf(id), kind: KIND[id], gu: !!pz.nodes[id].gu })), hu: !!pz.hu, tot, max: MAX, per: perOf(loc), kind: KIND[loc] || '', hackDone: pz.hackDone, hk: Math.min(HPER, pz.hk || 0), hper: HPER, door: !!pz.door, lock: Math.max(0, ((pz.lks || {})[uid] || 0) - now), here: loc, reveal: !!pz.reveal, lab: !!pz.reveal && loc === CI_LAB, ci: (() => { const ci = pz.ci || { g: 0, ok: {}, lk: {} }, lk = {}; CI_SENTS.forEach((_, i) => { const t0 = ((ci.lk || {})[uid + ':' + i] || 0) - now; if (t0 > 0) lk[i] = t0; }); return { g: ci.g || 0, ok: ci.ok || {}, lk, comm: !!ci.comm, sig: !!ci.sig, mach: !!ci.mach, me: !!(ci.u || {})[uid] || !!ci.uAll, uAll: !!ci.uAll }; })(),
      bridge: !!pz.reveal && (!!nd || loc === HACK), nodeOpen: open, nodeK: nd ? Math.min(perOf(loc), nd.k) : 0, nodeDone: !!nd && nd.k >= perOf(loc) && !pz.door, needFix: open && !unl, needRes: hkOpen && !hunl, hackWait: loc === HACK && tot < MAX && !pz.door && !open };
    const my = unl && (KIND[loc] === 'path' || KIND[loc] === 'circ' || KIND[loc] === 'brk') ? mine(pz, loc, uid) : null; if (my && KIND[loc] === 'brk') o.brk = { id: loc, k: my.j, n: my.c.n, s: my.c.s }; if (my && KIND[loc] === 'path') o.path = { id: loc, k: my.j, n: my.c.n, s: my.c.s, open: my.c.open }; if (my && KIND[loc] === 'circ') o.circ = { id: loc, k: my.j, n: my.c.n, sr: my.c.sr, er: my.c.er, m: my.c.m };
    if (hunl) { const hh = hackOf(pz, uid).h; o.hack = { a: hh.a, t: hh.t, ops: hh.ops, lim: hh.lim }; }
    return o; }
  function noisy(t, p) { p = Math.max(0, Math.min(100, +p || 0)) / 100; if (!p) return t; const G = '█▓▒░#%&*@~'; let o = ''; for (const ch of String(t)) { const x = Math.random(); o += x < p * 0.4 ? G[R(G.length)] : x < p * 0.6 ? '' : x < p * 0.68 ? '…' : ch; } return o.replace(/…+/g, '…'); }
  return { rot, powered, circOk, circGen, hexGen, hexOk, fresh, fix, total, view, noisy, NODES, HACK, PER, MAX, HPER, mine, mineNext, hackOf, hackNext, brkApply, brkOk, garble, ERL0, ERL_LBL, erLine, TXT0, TXT_LBL, tx, hopGen, hopNext, hopOk, RG_OPS, rgApply, regGen, regOk, PERS, KIND, perOf, gen, pathGen, pathOk, CI_ROOTS, CI_RULES, CI_GLOSS, CI_SENTS, CI_LAB, ciOk };
})();
// ===== WEEK4 主舰：自由行动 + 模块防御衰减 / 维修 / 撕卡通知 =====
const W4_MODS = ['airlock', 'rcs', 'lab', 'dock', 'farm', 'med', 'hab1', 'hab2', 'truss'];
const W4_NAME = { cockpit: '驾驶兼总控模块', airlock: '气密兼对接模块', rcs: '姿控推进模块', lab: '主实验模块', dock: '实验兼多功能对接模块', farm: '仓储兼种植模块', med: '生活兼医疗模块', hab1: '乘员居住模块 I', hab2: '乘员居住模块 II', ring: '重力环', truss: '三级总控', gen: '发电机模块', fuel: '燃料仓', fusion: '可控聚变反应堆', drive: '等离子推进模块' };
const W4_ER_GAP = 10 * 60e3, W4_CD_SKILL = 3 * 60e3, W4_CD_FIX = 100e3, W4_HEAL_GAP = 10 * 60e3, W4_CD_ANY = 100e3, W4_RATE = { low: 60e3, mid: 40e3, high: 20e3 }, W4_SUIT_N = 10, W4_BCD = 60e3;
const W4_BCD_LINES = { 1: '最终警告：舰桥结构将在 60 秒内崩解' };
const w4Pz = r => { const W = w4Of(r); return W.pz = W4PZ.fix(W.pz); };
const W4_PRE0 = ["驾驶兼总控模块已锁定 · 机械维修人员请检修门禁线路","门禁供电已恢复 · 请前往三级总控接管门禁程序","异常能量读数急剧上升 · 全体船员保持警戒","舰桥已锁定 · 导航系统拒绝一切外部指令","即将机动规避无法判明的行动源 · 请抓紧固定物","舱体多处受损 · 维修人员请前往各模块","跃迁准备程序已启动 · 请远离推进模块","所有先锋舰请速回主舰 · 重复，请速回主舰","舰桥舱门已开启 · 导航系统仍处于锁定状态"];
let W4_PRE = (() => { try { const x = db.prepare("select v from kv where k = 'w4_presets'").get(); const a = x && JSON.parse(x.v); return Array.isArray(a) ? a : W4_PRE0.slice(); } catch (e) { return W4_PRE0.slice(); } })();
let W4_TXT = (() => { try { const x = db.prepare("select v from kv where k = 'w4_txt'").get(); const o = x && JSON.parse(x.v); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } })();
const w4T = (k, v) => W4PZ.tx(W4_TXT, k, v);
let W4_ERL = (() => { try { const x = db.prepare("select v from kv where k = 'w4_erl'").get(); const o = x && JSON.parse(x.v); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } })();
function w4Bc(r, text, opt) { opt = opt || {}; const W = w4Of(r), noise = ((w4Pz(r).ci || {}).comm) ? 0 : opt.noise != null ? +opt.noise : (W.noise != null ? W.noise : 40), sc = opt.scope || 'all';
  if (sc !== 'van') gameLog(r, '【广播】：' + text, 'gm', 'bc'); if (sc === 'main') return;
  Object.keys(FIELD).forEach(k => { const o = FIELD[k]; if (o === r || o.fun || o.main || o.w4 || !o.started || !o.game) return; gameLog(o, '【主舰广播 · 信号' + (noise >= 60 ? '极差' : noise >= 25 ? '不稳' : '良好') + '】：' + W4PZ.noisy(text, noise), 'gm', 'bc'); }); }
const w4Of = r => { const g = r.game; return g.w4 = g.w4 || { on: { p: false, s: false }, rate: 'mid', t0: 0, boom: 0, next: {}, focus: {}, zero: {}, alerts: [], aSeq: 0, ack: {}, cd: {}, suit: {}, suits: W4_SUIT_N, suitsT: 5, foam: {} }; };
const w4Occ = (r, mod) => Object.keys(r.members).filter(x => !r.members[x].bot && !isDead(r, x) && baseLoc(getUser(x)) === mod);
const w4Out = r => { const W = w4Of(r), me = CUR_VIEWER, now = Date.now(), C = W.cd[me] || { any: 0, k: {} };
  return { on: W.on, rate: W.rate, started: !!W.t0, el: W.t0 ? now - W.t0 : 0, bcd: W.bcd ? Math.max(0, W.bcd - now) : 0, warn: W.warn ? Math.max(0, W.warn - now) : 0, pilot: !!W.pilot, boomAgo: W.boom ? now - W.boom : 0, dock: W.dock || '', vdock: W.vdock || {}, noise: W.noise != null ? W.noise : 40, erGap: W.erGap || 10, pz: W4PZ.view(w4Pz(r), me ? baseLoc(getUser(me)) : '', now, me), cgs: me && isAdmin(me) ? (W.cgs || []) : [], presets: me && isAdmin(me) ? W4_PRE : [], txt: W4_TXT, erl: me && isAdmin(me) ? W4_ERL : {}, boom: W.boom || 0, suits: W.suits, suitsT: W.suitsT == null ? 5 : W.suitsT, suit: !!W.suit[me], cdAny: Math.max(0, C.any - now), cdK: Object.fromEntries(Object.entries(C.k).filter(([, t]) => t > now).map(([k, t]) => [k, t - now])), alerts: me && isAdmin(me) ? W.alerts : [], foam: W.foam, seeFoam: !!me && (isAdmin(me) || !!W.foam[me] || (+((mGet(r, me) || {}).er) || 0) >= 60) }; };
function w4Alert(r, kind, target, text) { const W = w4Of(r), k = kind + ':' + target; if (W.ack[k] || W.alerts.some(a => a.k === k)) return; W.alerts.push({ id: ++W.aSeq, k, kind, target, text, t: Date.now() }); gameLog(r, '〔调度提醒〕' + text, 'sys', '', { hide: true }); }
function w4Scan(r) {
  const W = w4Of(r), sh = shipGet(), br = sh.broken || [], live = {};
  [...W4_MODS, 'cockpit'].forEach(m => { const k = 'mod:' + m; if (defOf(sh, m).p <= 0 && !br.includes(m) && !sh.lost.includes(m)) { live[k] = 1; w4Alert(r, 'mod', m, W4_NAME[m] + '物理防御归零 · 是否判定模块损坏？'); } });
  Object.keys(r.members).forEach(x => { if (r.members[x].bot || isDead(r, x)) return; const i = mGet(r, x); if (!i) return; const nm = memberInfo(r, x).name;
    if (hpNow(i) <= 0) { live['hp:' + x] = 1; w4Alert(r, 'hp', x, '【' + nm + '】HP 归零 · 体质检定 / 判定死亡'); }
    { const er = +i.er || 0, ES = W.erSt = W.erSt || {}, g = r.game; let ch = false; if (ES[x] == null) { ES[x] = er >= 100 ? 3 : er >= 80 ? 2 : er >= 60 ? 1 : 0; mainSave(r); return; } const s0 = ES[x] || 0;
      if (er < 60) { if (s0) { ES[x] = 0; ch = true; } }
      else { if (s0 < 1) { ES[x] = 1; ch = true; gameLog(r, W4PZ.erLine(W4_ERL, 'er60', nm), 'mad'); const v = +(((memberInfo(r, x).stats) || {}).pow) || 0, roll = crypto.randomInt(1, 101), lv = rollLevel(roll, v); gameLog(r, '【' + nm + '】进行【意志坚定】检定\nD100=' + roll + '/' + v + ' ' + lv, 'roll', lv);
          if (!/成功/.test(lv) && !(g.mad || {})[x]) { const t = crypto.randomInt(1, 11), dur = crypto.randomInt(1, 11); mSet(r, x, 'sane', false); g.mad = g.mad || {}; delete (g.pendMad || {})[x]; g.mad[x] = { no: t, type: madPick(t), left: dur }; madInit(r, x); gameLog(r, '【' + nm + '】陷入疯狂 · 1d10=' + t + '【' + g.mad[x].type + '】', 'mad'); } }
        if (er >= 80 && (ES[x] || 0) < 2) { ES[x] = 2; ch = true; gameLog(r, W4PZ.erLine(W4_ERL, 'er80', nm), 'mad'); }
        if (er >= 100 && (ES[x] || 0) < 3) { ES[x] = 3; w4Kill(r, x, true, '', W4PZ.erLine(W4_ERL, 'er100', nm)); ch = true; } }
      if (ch) mainSave(r); } });
  Object.keys(W.ack).forEach(k => { if (!live[k] && !k.startsWith('boom:')) delete W.ack[k]; });
  W.alerts = W.alerts.filter(a => a.kind === 'boom' ? !isDead(r, a.target) : live[a.k]);
}
function w4ErStage(r, x, k) { const g = r.game, nm = memberInfo(r, x).name;
  if (k === 'er60') { gameLog(r, W4PZ.erLine(W4_ERL, 'er60', nm), 'mad'); const v = +(((memberInfo(r, x).stats) || {}).pow) || 0, roll = crypto.randomInt(1, 101), lv = rollLevel(roll, v); gameLog(r, '【' + nm + '】进行【意志坚定】检定\nD100=' + roll + '/' + v + ' ' + lv, 'roll', lv);
    if (!/成功/.test(lv) && !(g.mad || {})[x]) { const t = crypto.randomInt(1, 11), dur = crypto.randomInt(1, 11); mSet(r, x, 'sane', false); g.mad = g.mad || {}; delete (g.pendMad || {})[x]; g.mad[x] = { no: t, type: madPick(t), left: dur }; madInit(r, x); gameLog(r, '【' + nm + '】陷入疯狂 · 1d10=' + t + '【' + g.mad[x].type + '】', 'mad'); } }
  else if (k === 'er80') gameLog(r, W4PZ.erLine(W4_ERL, 'er80', nm), 'mad');
  else if (k === 'er100') w4Kill(r, x, true, '', W4PZ.erLine(W4_ERL, 'er100', nm)); }
function w4Kill(r, x, foam, why, txt) { const g = r.game; g.dead = g.dead || {}; if (g.dead[x]) return; g.dead[x] = true; delete (g.mad || {})[x]; delete (g.pendMad || {})[x]; const nm = memberInfo(r, x).name; if (foam) { w4Of(r).foam[x] = true; const fx = g.fx = g.fx || {}; fx.bub = (fx.bub || 0) + 1; fx.bubLoc = r.members[x] && r.members[x].bot ? '' : baseLoc(getUser(x)); } gameLog(r, txt || foam ? txt || w4T('foam', { 人: nm }) : '【' + nm + '】死亡' + (why ? '（' + why + '）' : ''), 'dead'); if (r.members[x] && !r.members[x].bot) db.prepare('update users set dead = ? where id = ?').run(foam ? 2 : 1, x); }
function w4Break(r, mod) { const sh = shipGet(); sh.broken = [...new Set([...(sh.broken || []), mod])]; shipSet(sh); gameLog(r, '【广播】：' + w4T('bcBreak', { 舱段: W4_NAME[mod] }), 'gm', 'bc');
  db.prepare('select id, loc from users where dead = 0 or dead is null').all().forEach(u => { if (!sortieOf(u.id) && baseLoc(u) === mod && r.members[u.id]) w4Kill(r, u.id, false, '模块损毁'); }); }
function w4Boom(r) { const W = w4Of(r); if (W.boom) return; W.boom = Date.now(); W.suits = 0; const sh = shipGet(); sh.broken = [...new Set([...(sh.broken || []), 'cockpit'])]; sh.boom = W.boom; sh.def = sh.def || {}; sh.def.airlock = { ...(sh.def.airlock || {}), p: Math.min(defOf(sh, 'airlock').p, 6) }; shipSet(sh); W.dock = 'broken'; W.bcd = 0;
  Object.keys(FIELD).forEach(k => { const o = FIELD[k]; if (o.fun || !o.started || !o.game) return; const fx = o.game.fx = o.game.fx || {}; fx.boom = (fx.boom || 0) + 1; gameLog(o, '【广播】：' + w4T(o.main || o.w4 ? 'boomMain' : 'boomVan'), 'gm', 'bc'); });
  w4Occ(r, 'cockpit').forEach(x => w4Alert(r, 'boom', x, '【' + memberInfo(r, x).name + '】身处爆炸的驾驶模块 · 是否判定死亡？'));
  w4Occ(r, 'airlock').filter(x => !W.suit[x]).forEach(x => w4Alert(r, 'boom', x, '【' + memberInfo(r, x).name + '】在相邻的气密兼对接模块且未穿宇航服 · 是否判定死亡？'));
  gameLog(r, '【广播】：' + w4T('dockHit'), 'gm', 'bc'); mainSave(r); }
function w4Heal(r, x, n) { const i = mGet(r, x); if (!i) return 0; const mx = hpMaxOf(i.stats), cur = hpNow(i), nv = Math.min(mx, cur + n); if (nv !== cur) mSet(r, x, 'hp', nv); return nv - cur; }
const w4LocOf = (r, x) => (r.members[x] && r.members[x].bot) ? 'bot' : baseLoc(getUser(x));
function w4Repair(r, me, lv, kf) {
  const mod = baseLoc(getUser(me)), sh = shipGet(); if (![...W4_MODS, 'cockpit'].includes(mod) || (sh.broken || []).includes(mod) || sh.lost.includes(mod)) return '';
  const d = defOf(sh, mod), k = kf || (d.s < d.p ? 's' : 'p'), dl = lv === '大成功' ? 5 : lv === '大失败' ? -5 : /成功/.test(lv) ? crypto.randomInt(1, 4) : 0, nm = W4_NAME[mod] + (k === 'p' ? '物理' : '特殊') + '防御';
  if (!dl) return ''; if (dl > 0 && d[k] >= 30) return '\n' + W4_NAME[mod] + '防御完好';
  const nv = Math.max(0, Math.min(30, d[k] + dl)); sh.def[mod] = { ...(sh.def[mod] || {}), [k]: nv }; shipSet(sh);
  return '\n' + nm + ' ' + (nv >= d[k] ? '+' : '') + (nv - d[k]) + ' → ' + nv + '/30';
}
function w4Strike(r) { const sh = shipGet(), live = W4_MODS.filter(m => !sh.lost.includes(m) && !(sh.broken || []).includes(m)), hit = []; for (let i = 0; i < 3 && live.length; i++) { const m = live.splice(crypto.randomInt(0, live.length), 1)[0], d = defOf(sh, m), dp = crypto.randomInt(1, 7), ds = crypto.randomInt(1, 4); sh.def[m] = { ...(sh.def[m] || {}), p: Math.max(0, d.p - dp), s: Math.max(0, d.s - ds) }; hit.push(W4_NAME[m]); gameLog(r, '〔冲击〕' + W4_NAME[m] + ' 物理 −' + dp + ' · 特殊 −' + ds, 'sys', '', { hide: true }); }
  shipSet(sh); const fx = r.game.fx = r.game.fx || {}; fx.hit = (fx.hit || 0) + 1; w4Bc(r, w4T('bcStrike', { 舱段: hit.join('、') }), { scope: 'main' }); }
function w4Tick() {
  const r = FIELD[W4_ID]; if (!r || !r.game) return; const W = w4Of(r), now = Date.now(); let sh = null, dirty = false, save = false;
  if (W.warn && now >= W.warn) { W.warn = 0; save = true; w4Strike(r); }
  if (W.bcd && !W.boom) { const left = W.bcd - now, step = Math.ceil(left / 60e3); if (left <= 0) { W.bcd = 0; w4Boom(r); } else if (step !== W.bcdStep) { const first = !W.bcdStep; W.bcdStep = step; save = true; if (!first) { const s2 = shipGet(); if (!(s2.lost || []).includes('cockpit')) { const d2 = defOf(s2, 'cockpit'); s2.def.cockpit = { ...(s2.def.cockpit || {}), p: Math.max(0, d2.p - 10) }; shipSet(s2); } } const fx = r.game.fx = r.game.fx || {}; fx.hit = (fx.hit || 0) + 1; } }
  ['p', 's'].forEach(k => { if (!W.on[k]) return; if (!W.next[k]) W.next[k] = now + W4_RATE[W.rate]; if (now < W.next[k]) return; W.next[k] = now + (W4_RATE[W.rate] || W4_RATE.mid);
    sh = sh || shipGet(); const live = W4_MODS.filter(m => !sh.lost.includes(m) && !(sh.broken || []).includes(m) && defOf(sh, m)[k] > 0); if (!live.length) return;
    let f = W.focus[k]; if (!live.includes(f) || crypto.randomInt(0, 4) === 0) f = W.focus[k] = live[crypto.randomInt(0, live.length)];
    const was = defOf(sh, f)[k], nv = Math.max(0, was - crypto.randomInt(1, 4)); sh.def[f] = { ...(sh.def[f] || {}), [k]: nv }; dirty = save = true;
    if (live.length > 1 && crypto.randomInt(0, 2)) { const oth = live.filter(m => m !== f), o = oth[crypto.randomInt(0, oth.length)]; sh.def[o] = { ...(sh.def[o] || {}), [k]: Math.max(0, defOf(sh, o)[k] - 1) }; }
    const lb = W4_NAME[f] + (k === 'p' ? '物理防御' : '特殊防御');
    if (nv === 0) gameLog(r, '【广播】：' + w4T('bcDefOut', { 防御: lb }), 'gm', 'bc'); else if (nv <= 10 && was > 10) gameLog(r, '【广播】：' + w4T('bcDefLow', { 防御: lb, 值: nv }), 'gm', 'bc'); });
  sh = sh || shipGet();
  [...W4_MODS, 'cockpit'].forEach(m => { if (defOf(sh, m).s > 0 || (sh.broken || []).includes(m)) { delete W.zero[m]; return; } if (!W.zero[m]) { W.zero[m] = now; save = true; return; } if (now - W.zero[m] < (W.erGap || 10) * 60e3) return; W.zero[m] = now; save = true;
    if (!W.t0) return; w4Occ(r, m).filter(x => !(r.members[x] || {}).away).forEach(x => { const i = mGet(r, x); if (!i) return; const nv = Math.min(100, (+i.er || 0) + 3); mSet(r, x, 'er', nv); }); });
  if (dirty) shipSet(sh);
  Object.keys(W.treat || {}).forEach(x => { const T = W.treat[x], nm = r.members[x] ? memberInfo(r, x).name : x; if (!r.members[x] || isDead(r, x)) { delete W.treat[x]; save = true; return; }
    if (w4LocOf(r, x) !== T.loc) { delete W.treat[x]; save = true; gameLog(r, '【' + nm + '】离开了治疗所在的舱室，医学治疗中断', 'sys'); return; }
    if (now < T.next) return; T.next = now + W4_HEAL_GAP; save = true; const got = w4Heal(r, x, crypto.randomInt(1, 4)), i1 = mGet(r, x), mx = hpMaxOf(i1 && i1.stats), cur = hpNow(i1);
    gameLog(r, '【' + nm + '】医学治疗生效 · HP +' + got + ' → ' + cur + '/' + mx, 'item'); if (cur >= mx) { delete W.treat[x]; gameLog(r, '【' + nm + '】已完全恢复，医学治疗结束', 'sys'); } });
  const n0 = W.alerts.length; w4Scan(r); if (save || W.alerts.length !== n0) mainSave(r);
}
setInterval(() => { try { w4Tick(); } catch (e) { logError('w4', 'tick', e); } }, 5000);
const SUIT = '宇航服', lootCap = (x, r) => { const bt = r && r.members[x] && r.members[x].bot; return Math.floor((+(((bt ? bt.stats : getUser(x) && statsOf(getUser(x))) || {}).str) || 0) / 20); };
// 从成员的外勤背包 / 随身背包取出一件物品（随身物品按丢弃同样的规则从永久背包扣除）
function w4Take(r, x, item) { const g = r.game, m = r.members[x]; if (!m) return false; g.loot = g.loot || {}; const L = g.loot[x] = g.loot[x] || [], li = L.indexOf(item); if (li >= 0) { L.splice(li, 1); return true; }
  const ci = (m.items || []).indexOf(item); if (ci < 0) return false; m.items.splice(ci, 1); if (m.bot) return true; const ti = (m.temps || []).indexOf(item), lci = (m.lootCarry || []).indexOf(item); if (ti >= 0) { m.temps.splice(ti, 1); return true; } if (lci >= 0) { m.lootCarry.splice(lci, 1); return true; }
  const uu = getUser(x); if (uu) { const gd = listOf(uu, 'gained'), ps = listOf(uu, 'personal'), gi = gd.indexOf(item); if (gi >= 0) { gd.splice(gi, 1); db.prepare('update users set gained = ? where id = ?').run(JSON.stringify(gd), x); } else { const pi = ps.indexOf(item); if (pi >= 0) { ps.splice(pi, 1); db.prepare('update users set personal = ? where id = ?').run(JSON.stringify(ps), x); } } } return true; }
api.post('/field/rooms/:id/suit', auth, once, (req, res) => {
  const r = fieldRoom(req.params.id), me = req.user.id, op = String((req.body || {}).op || 'take'); if (!r || !r.w4 || !r.game) return bad(res, '无效舰船', 404); if (!r.members[me]) return bad(res, '你不在该舰上', 403); if (isDead(r, me)) return bad(res, '你已死亡', 403);
  const W = w4Of(r), g = r.game, nm = memberInfo(r, me).name; g.loot = g.loot || {}; const L = g.loot[me] = g.loot[me] || [];
  if (op === 'take') { const loc = baseLoc(getUser(me)); if (loc !== 'airlock' && loc !== 'truss' && !['hab1', 'hab2'].includes(loc)) return bad(res, '只有气密兼对接模块、三级总控和乘员居住模块存放宇航服', 409); if (W.suitsT == null) W.suitsT = 5; if (L.length >= lootCap(me)) return bad(res, '外勤背包已满', 409); if (loc === 'airlock') { if (W.suits <= 0) return bad(res, '气密兼对接模块的宇航服已领完', 409); W.suits--; } if (loc === 'truss') { if (W.suitsT <= 0) return bad(res, '三级总控的宇航服已领完', 409); W.suitsT--; } L.push(SUIT); gameLog(r, '【' + nm + '】在' + W4_NAME[loc] + '领取了宇航服' + (loc === 'airlock' ? '（剩余 ' + W.suits + ' 套）' : loc === 'truss' ? '（剩余 ' + W.suitsT + ' 套）' : ''), 'item'); }
  else if (op === 'wear') { if (W.suit[me]) return bad(res, '你已穿着宇航服', 409); if (!w4Take(r, me, SUIT)) return bad(res, '背包里没有宇航服', 409); W.suit[me] = true; gameLog(r, '【' + nm + '】穿上了宇航服', 'item'); }
  else if (op === 'off') { if (!W.suit[me]) return bad(res, '你没有穿宇航服', 409); if (L.length >= lootCap(me)) return bad(res, '外勤背包已满，无法脱下', 409); W.suit[me] = false; L.push(SUIT); gameLog(r, '【' + nm + '】脱下了宇航服', 'item'); }
  else return bad(res, '无效操作');
  mainSave(r); res.json({ room: fieldOut(req.params.id) });
});
api.post('/field/rooms/:id/pz', auth, once, (req, res) => {
  const r = fieldRoom(req.params.id), me = req.user.id, b = req.body || {}; if (!r || !r.w4 || !r.game) return bad(res, '无效舰船', 404); if (!r.members[me]) return bad(res, '你不在该舰上', 403); if (isDead(r, me)) return bad(res, '你已死亡', 403);
  const W = w4Of(r), pz = w4Pz(r), loc = baseLoc(getUser(me)), nm = memberInfo(r, me).name, now = Date.now();
  if (!pz.reveal) return bad(res, '任务尚未开始', 409);
  if (b.op === 'ciph') { if (loc !== W4PZ.CI_LAB) return bad(res, '密文终端在主实验模块', 409); const ci = pz.ci = pz.ci || { g: 0, ok: {}, lk: {} }, ci_i = +b.i, ci_k = me + ':' + ci_i; if (!W4PZ.CI_SENTS[ci_i]) return bad(res, '无效密文', 409); if (!ci.mach) return bad(res, '拟合仪尚未修复', 409); if (ci.ok[ci_i]) return bad(res, '这段密文已被破译', 409); if (now < (ci.lk[ci_k] || 0)) return bad(res, '解析冷却中', 409);
    let cfail = false; if (W4PZ.ciOk(ci_i, b.a)) { ci.ok[ci_i] = nm; const fxC = r.game.fx = r.game.fx || {}; fxC.ci = (fxC.ci || 0) + 1; fxC.ciI = ci_i; fxC.ciBy = me; } else { cfail = true; ci.lk[ci_k] = now + 30e3; }
    mainSave(r); return res.json({ room: fieldOut(req.params.id), fail: cfail }); }
  if (pz.door) return bad(res, '舰桥舱门已经打开', 409); let fail = false;
  if (b.op === 'circ') { const nd = pz.nodes[loc]; if (!nd) return bad(res, '此舱段没有门禁线路'); if (W4PZ.KIND[loc] !== 'circ') return bad(res, '此舱段不是接线线路'); if (nd.k >= W4PZ.perOf(loc)) return bad(res, '本舱段线路已全部桥接', 409); if (!pz.unl[me + ':' + loc] && !(pz.nodes[loc] || {}).gu) return bad(res, '请先使用机械维修打开检修口', 409);
    const my = W4PZ.mine(pz, loc, me); if (!Array.isArray(b.rots) || b.rots.length !== my.c.m.length || +b.k !== my.j) return bad(res, '线路已变化，请重试', 409); if (!W4PZ.circOk(my.c, b.rots.map(x => (+x | 0) & 3))) return bad(res, '线路未接通', 409);
    nd.k++; nd.by.push(nm); W4PZ.mineNext(pz, loc, me); const t = W4PZ.total(pz); if (nd.k >= W4PZ.perOf(loc)) gameLog(r, w4T('nodeDone', { 舱段: W4_NAME[loc] }), 'gm', 'bc');
    if (t >= W4PZ.MAX) gameLog(r, w4T('powerOn'), 'gm', 'bc'); }
  else if (b.op === 'brk') { const nd = pz.nodes[loc]; if (!nd || W4PZ.KIND[loc] !== 'brk') return bad(res, '此舱段没有继电器阵列'); if (nd.k >= W4PZ.perOf(loc)) return bad(res, '本舱段线路已全部桥接', 409); if (!pz.unl[me + ':' + loc] && !(pz.nodes[loc] || {}).gu) return bad(res, '请先使用机械维修打开检修口', 409); const my = W4PZ.mine(pz, loc, me); if (+b.k !== my.j) return bad(res, '线路已变化，请重试', 409); if (!W4PZ.brkOk(my.c, b.p)) return bad(res, '继电器未全部复位', 409);
    nd.k++; nd.by.push(nm); W4PZ.mineNext(pz, loc, me); const t = W4PZ.total(pz); if (nd.k >= W4PZ.perOf(loc)) gameLog(r, w4T('nodeDone', { 舱段: W4_NAME[loc] }), 'gm', 'bc'); if (t >= W4PZ.MAX) gameLog(r, w4T('powerOn'), 'gm', 'bc'); }
  else if (b.op === 'path') { const nd = pz.nodes[loc]; if (!nd || W4PZ.KIND[loc] !== 'path') return bad(res, '此舱段没有一笔画线路'); if (nd.k >= W4PZ.perOf(loc)) return bad(res, '本舱段线路已全部桥接', 409); if (!pz.unl[me + ':' + loc] && !(pz.nodes[loc] || {}).gu) return bad(res, '请先使用机械维修打开检修口', 409); const my = W4PZ.mine(pz, loc, me); if (+b.k !== my.j) return bad(res, '线路已变化，请重试', 409); if (!W4PZ.pathOk(my.c, b.p)) return bad(res, '线路未连通', 409);
    nd.k++; nd.by.push(nm); W4PZ.mineNext(pz, loc, me); const t = W4PZ.total(pz); if (nd.k >= W4PZ.perOf(loc)) gameLog(r, w4T('nodeDone', { 舱段: W4_NAME[loc] }), 'gm', 'bc'); if (t >= W4PZ.MAX) gameLog(r, w4T('powerOn'), 'gm', 'bc'); }
  else if (b.op === 'hack') { if (loc !== W4PZ.HACK) return bad(res, '门禁程序终端在三级总控'); if (W4PZ.total(pz) < W4PZ.MAX) return bad(res, '门禁供电不足', 409); if (!pz.hunl[me] && !pz.hu) return bad(res, '请先使用信息重构接入门禁程序', 409); if (now < ((pz.lks || {})[me] || 0)) return bad(res, '终端锁定中', 409);
    if (W4PZ.regOk(W4PZ.hackOf(pz, me).h, b.ops)) { pz.hk = (pz.hk || 0) + 1; W4PZ.hackNext(pz, me); if (pz.hk >= W4PZ.HPER) { pz.hackDone = nm; pz.door = true; const fxU = r.game.fx = r.game.fx || {}; fxU.unlock = (fxU.unlock || 0) + 1; gameLog(r, w4T('hackDone', { 人: nm }), 'gm', 'bc'); } }
    else { fail = true; (pz.lks = pz.lks || {})[me] = now + 60e3; W4PZ.hackNext(pz, me); gameLog(r, w4T('hackFail', { 人: nm }), 'gm', 'bc'); } }
  else return bad(res, '无效操作');
  w4Scan(r); mainSave(r); res.json({ room: fieldOut(req.params.id), fail });
});
api.post('/field/rooms/:id/w4', auth, admin, once, (req, res) => {
  const r = fieldRoom(req.params.id), b = req.body || {}; if (!r || !r.w4 || !r.game) return bad(res, '无效舰船', 404); const W = w4Of(r), now = Date.now();
  if (b.op === 'tog' && (b.k === 'p' || b.k === 's')) { W.on[b.k] = !W.on[b.k]; W.next[b.k] = 0; if (W.on[b.k] && !W.t0) { W.t0 = now; gameLog(r, '〔调度〕主舰倒计时开始 · 2 小时后驾驶模块爆炸', 'sys', '', { hide: true }); } }
  else if (b.op === 'rate' && W4_RATE[b.v]) W.rate = b.v;
  else if (b.op === 'boom') { if (W.boom) return bad(res, '驾驶模块已爆炸', 409); w4Boom(r); }
  else if (b.op === 'def' && [...W4_MODS, 'cockpit'].includes(b.mod) && (b.k === 'p' || b.k === 's')) { const sh = shipGet(), d = defOf(sh, b.mod); sh.def[b.mod] = { ...(sh.def[b.mod] || {}), [b.k]: Math.max(0, Math.min(30, d[b.k] + Math.round(+b.d || 0))) }; shipSet(sh); }
  else if (b.op === 'mod' && SHIP_MODS.includes(b.mod)) { if (b.broken) { if ((shipGet().broken || []).includes(b.mod)) return bad(res, '该模块已损坏', 409); w4Break(r, b.mod); } else { const sh = shipGet(); sh.broken = (sh.broken || []).filter(x => x !== b.mod); const d = defOf(sh, b.mod); sh.def[b.mod] = { ...(sh.def[b.mod] || {}), p: Math.max(1, d.p) }; shipSet(sh); gameLog(r, '【广播】：' + w4T('bcFixed', { 舱段: W4_NAME[b.mod] }), 'gm', 'bc'); } }
  else if (b.op === 'modFull') { const sh = shipGet(), ids = b.mod === 'all' ? W4_MODS.concat('cockpit') : [b.mod].filter(m => [...W4_MODS, 'cockpit'].includes(m)), fixed = []; ids.forEach(m => { if ((sh.lost || []).includes(m)) return; if ((sh.broken || []).includes(m)) fixed.push(W4_NAME[m]); sh.broken = (sh.broken || []).filter(x => x !== m); sh.def[m] = { ...(sh.def[m] || {}), p: 30, s: 30 }; }); shipSet(sh); if (fixed.length) gameLog(r, '【广播】：' + w4T('bcFixed', { 舱段: fixed.join('、') }), 'gm', 'bc'); }
  else if (b.op === 'alert') { const a = W.alerts.find(x => x.id === +b.id); if (!a) return bad(res, '提醒已失效', 404); const act = String(b.act || '');
    if (act === 'no') { W.ack[a.k] = true; W.alerts = W.alerts.filter(x => x !== a); }
    else if (a.kind === 'mod' && act === 'yes') { W.alerts = W.alerts.filter(x => x !== a); w4Break(r, a.target); }
    else if (a.kind === 'hp' && act === 'con') { const i = mGet(r, a.target), v = +((i && i.stats) || {}).con || 0, roll = crypto.randomInt(1, 101), lv = rollLevel(roll, v); gameLog(r, '【' + memberInfo(r, a.target).name + '】进行【体质】检定\nD100=' + roll + '/' + v + ' ' + lv, 'roll', lv); a.con = lv; }
    else if ((a.kind === 'hp' || a.kind === 'boom') && act === 'dead') { W.alerts = W.alerts.filter(x => x !== a); w4Kill(r, a.target, false, a.kind === 'boom' ? '爆炸' : ''); }
    else if (a.kind === 'er' && act === 'foam') { W.alerts = W.alerts.filter(x => x !== a); w4Kill(r, a.target, true); }
    else return bad(res, '无效操作'); }
  else if (b.op === 'bc') { const t = str(b.text, 200); if (!t) return bad(res, '请填写广播内容'); const nz = Math.max(0, Math.min(100, Math.round(+b.noise || 0))); W.noise = nz; w4Bc(r, t, { noise: nz, scope: ['main', 'van', 'all'].includes(b.scope) ? b.scope : 'all' }); }
  else if (b.op === 'erGap' && [10, 5, 2].includes(+b.v)) W.erGap = +b.v;
  else if (b.op === 'strike') w4Strike(r);
  else if (b.op === 'warn') { if (b.on === false) { W.warn = 0; gameLog(r, '〔调度〕撞击警告已取消', 'sys', '', { hide: true }); } else { W.warn = now + 60e3; const fxW = r.game.fx = r.game.fx || {}; fxW.warnN = (fxW.warnN || 0) + 1; w4Bc(r, w4T('warn'), { scope: 'main' }); } }
  else if (b.op === 'bcd') { if (W.boom) return bad(res, '驾驶模块已爆炸', 409); if (b.on) { W.bcd = now + W4_BCD; W.bcdStep = 0; const fx = r.game.fx = r.game.fx || {}; fx.alarm = true; fx.evac = (fx.evac || 0) + 1; gameLog(r, '〔调度〕舰桥爆炸倒计时开始 · 1 分钟', 'sys', '', { hide: true }); } else { W.bcd = 0; gameLog(r, '〔调度〕舰桥倒计时已取消', 'sys', '', { hide: true }); } }
  else if (b.op === 'dockFix') { W.dock = W.dock === 'ok' ? 'broken' : 'ok'; if (W.dock === 'ok') w4Bc(r, w4T('bcDockOk')); }
  else if (b.op === 'vdock' && (b.k === '1' || b.k === '2')) { W.vdock = W.vdock || {}; W.vdock[b.k] = !W.vdock[b.k]; if (W.vdock[b.k]) w4Bc(r, w4T('bcVdock', { 号: b.k === '1' ? '一' : '二' })); }
  else if (b.op === 'final') { const fx = r.game.fx = r.game.fx || {}; fx.hit = (fx.hit || 0) + 1; ['舰体结构开始崩解——', 'MSV-05 主控系统强制接管：修正航向 · 修正速度', '航线锁定 · 进入 3R'].forEach(t => w4Bc(r, t, { noise: 0 })); Object.keys(FIELD).forEach(k => { const o = FIELD[k]; if (o !== r && !o.fun && !o.main && !o.w4 && o.started && o.game) { const f2 = o.game.fx = o.game.fx || {}; f2.hit = (f2.hit || 0) + 1; } }); }
  else if (b.op === 'cg') { const img = b.image || b.url || ''; if (!isImg(img) && !MEDIA_RE.test(img)) return bad(res, '图片格式或大小不支持'); const cap = str(b.cap, 120); W.cgs = [{ url: img, cap }, ...(W.cgs || []).filter(x => x.url !== img)].slice(0, 12);
    const push = o => { gameLog(o, '【调度】发送了 CG', 'cg', '', { img, by: req.user.id }); if (cap) gameLog(o, cap, 'gm', 'narr'); }; push(r); if (b.sync) Object.keys(FIELD).forEach(k => { const o = FIELD[k]; if (o !== r && !o.fun && !o.main && !o.w4 && o.started && o.game) push(o); }); }
  else if (b.op === 'pzReset') { W.pz = W4PZ.fresh((W.pz || {}).v); W.pz.reveal = false; gameLog(r, '〔调度〕舰桥门禁谜题已重置', 'sys', '', { hide: true }); }
  else if (b.op === 'pzNode' && w4Pz(r).nodes[b.id]) { const nd = w4Pz(r).nodes[b.id]; if (nd.k >= W4PZ.perOf(b.id)) { nd.k = 0; nd.by = []; } else { nd.k++; nd.by.push('调度'); } nd.c = W4PZ.gen(b.id); }
  else if (b.op === 'reveal') { const pz = w4Pz(r); pz.reveal = !pz.reveal; }
  else if (b.op === 'unlock') { const fx = r.game.fx = r.game.fx || {}; fx.unlock = (fx.unlock || 0) + 1; gameLog(r, '〔调度〕发送了「舰桥舱门已解锁」演出', 'sys', '', { hide: true }); }
  else if (b.op === 'erl' && W4PZ.ERL0[b.k] && Array.isArray(b.list)) { const L = b.list.map(x => str(x, 200)).filter(Boolean).slice(0, 40); if (L.length) W4_ERL[b.k] = L; else delete W4_ERL[b.k]; try { db.prepare("insert or replace into kv(k, v) values('w4_erl', ?)").run(JSON.stringify(W4_ERL)); } catch (e) {} }
  else if (b.op === 'txt') { const k = String(b.k || ''); if (!W4PZ.TXT0[k]) return bad(res, '无效文案'); const v = str(b.v, 300); if (v && v !== W4PZ.TXT0[k]) W4_TXT[k] = v; else delete W4_TXT[k]; try { db.prepare("insert or replace into kv(k, v) values('w4_txt', ?)").run(JSON.stringify(W4_TXT)); } catch (e) {} }
  else if (b.op === 'presets' && Array.isArray(b.list)) { W4_PRE = b.list.map(x => str(x, 200)).filter(Boolean).slice(0, 60); try { db.prepare("insert or replace into kv(k, v) values('w4_presets', ?)").run(JSON.stringify(W4_PRE)); } catch (e) {} }
  else if (b.op === 'ciSet' && ['comm', 'mach'].includes(b.k)) { const pz = w4Pz(r); pz.ci[b.k] = !pz.ci[b.k]; }
  else if (b.op === 'ciSig') { const pz = w4Pz(r); pz.ci.sig = true; const fx = r.game.fx = r.game.fx || {}; fx.sig = (fx.sig || 0) + 1; gameLog(r, '【加急信号样本】：' + w4T('ciSig'), 'gm', 'bc'); }
  else if (b.op === 'pzCi') { const pz = w4Pz(r); pz.ci = pz.ci || { g: 0, ok: {}, lk: {} }; pz.ci.g = ((pz.ci.g || 0) + 1) % 4; }
  else if (b.op === 'pzUnl') { const pz = w4Pz(r); if (b.id === 'hack') pz.hu = !pz.hu; else if (pz.nodes[b.id]) pz.nodes[b.id].gu = !pz.nodes[b.id].gu; }
  else if (b.op === 'plSet') W.pilot = !W.pilot;
  else if (b.op === 'pzHk') { const pz = w4Pz(r); if (pz.hackDone) return bad(res, '门禁已接管', 409); pz.hk = Math.min(W4PZ.HPER, (pz.hk || 0) + 1); pz.lks = {}; if (pz.hk >= W4PZ.HPER) { pz.hackDone = '调度'; pz.door = true; const fxU = r.game.fx = r.game.fx || {}; fxU.unlock = (fxU.unlock || 0) + 1; gameLog(r, w4T('hackDone', { 人: '调度' }), 'gm', 'bc'); } }
  else if (b.op === 'pzHack') { const pz = w4Pz(r); pz.hackDone = pz.hackDone ? '' : '调度'; pz.hk = pz.hackDone ? W4PZ.HPER : 0; pz.door = !!pz.hackDone; }
  else if (b.op === 'pzDoor') { const pz = w4Pz(r); pz.door = !pz.door; if (pz.door) gameLog(r, w4T('doorGm'), 'gm', 'bc'); }
  else if (b.op === 'reset') { const sh = shipGet(); [...W4_MODS, 'cockpit'].forEach(m => { delete sh.def[m]; }); sh.broken = []; sh.boom = 0; shipSet(sh); r.game.w4 = null; w4Of(r); gameLog(r, '〔调度〕主舰状态已重置', 'sys', '', { hide: true }); }
  else return bad(res, '无效操作');
  w4Scan(r); mainSave(r); res.json({ room: fieldOut(req.params.id, true) });
});

api.post('/ship/move', auth, (req, res) => {
  const to = String((req.body || {}).loc || ''); if (!SHIP_MODS.includes(to)) return bad(res, '无效舱段'); if (SHIP_NOENTRY.includes(to)) return bad(res, '无人舱段，不可进入', 409);
  if (sortieOf(req.user.id)) return bad(res, '外勤中，无法移动', 409);
  { const R4 = FIELD[W4_ID]; if (R4 && R4.started && R4.game && R4.members[req.user.id] && (w4Of(R4).foam || {})[req.user.id]) return bad(res, '你已化作泡沫，无法移动', 409); if (to === 'cockpit' && !req.user.dead && R4.started && R4.game && R4.members[req.user.id] && !w4Pz(R4).door) return bad(res, '舰桥舱门已锁定', 409); }
  const s = shipGet();
  if (!req.user.dead && (s.broken || []).length) { const a = SHIP_MODS.indexOf(baseLoc(req.user)), z = SHIP_MODS.indexOf(to), via = SHIP_MODS.slice(Math.min(a, z), Math.max(a, z) + 1).filter((m, i) => m !== SHIP_MODS[a]); if (via.some(m => s.broken.includes(m)) && !(FIELD[W4_ID].game && w4Of(FIELD[W4_ID]).suit[req.user.id])) return bad(res, '通往该舱段的路线已损毁，需穿戴宇航服', 409); }
  if (!req.user.dead) { if (s.lost.includes(to)) return bad(res, '该舱段已失联', 409); if (s.lost.includes(baseLoc(req.user))) return bad(res, '所在舱段已失联，无法离开', 409); }
  db.prepare('update users set loc = ? where id = ?').run(to, req.user.id); res.json(shipOut(req.user.id));
});
api.post('/admin/crew/dead', auth, admin, (req, res) => { const b = req.body || {}; if (!getUser(b.uid)) return bad(res, '用户不存在', 404); db.prepare('update users set dead = ? where id = ?').run(b.dead ? 1 : 0, b.uid); res.json(shipOut(req.user.id)); });
api.post('/admin/crew/er', auth, admin, (req, res) => { const b = req.body || {}; if (!getUser(b.uid)) return bad(res, '用户不存在', 404); const v = Math.max(0, Math.min(100, Math.round(+b.er || 0))); db.prepare('update users set er = ? where id = ?').run(v, b.uid); res.json(shipOut(req.user.id)); });
api.post('/admin/ship', auth, admin, (req, res) => {
  const b = req.body || {}, s = shipGet();
  if (Array.isArray(b.lost)) { const nl = [...new Set(b.lost.filter(x => SHIP_MODS.includes(x) || x === 'sc1' || x === 'sc2'))], fresh = nl.filter(x => !s.lost.includes(x)); if (fresh.length) db.prepare('select id, loc from users').all().forEach(u => { const so = sortieOf(u.id); if (so ? fresh.includes(so) : fresh.includes(baseLoc(u))) db.prepare('update users set dead = 1 where id = ?').run(u.id); }); s.lost = nl; }
  if (typeof b.w4 === 'boolean') s.w4 = b.w4;
  if (typeof b.hw === 'boolean') s.hw = b.hw;
  if (typeof b.gr === 'boolean') s.gr = b.gr;
  if (b.legs != null) {
    if (!Array.isArray(b.legs) || !b.legs.length || b.legs.length > 8) return bad(res, '航段数需为 1–8');
    const L = b.legs.map(l => ({ r: Math.round(+(l || {}).r * 100) / 100, n: Math.floor(+(l || {}).n) }));
    if (L.some(l => !(l.r >= 1.1 && l.r <= 20) || !(l.n >= 1 && l.n <= 999))) return bad(res, '轨道半径 1.1–20R，圈数 1–999');
    s.legs = L;
  }
  if (b.at != null) s.at = Math.floor(+b.at) || 0;
  s.at = Math.max(0, Math.min(s.legs.length + 1, s.at | 0));
  if (b.R != null) { const R = Math.round(+b.R * 100) / 100; if (!(R === 0 || (R >= 1.1 && R <= 20))) return bad(res, '引力场半径 1.1–20R'); s.R = R; }
  if (b.mode != null) { if (!SHIP_MODES.includes(b.mode)) return bad(res, '无效动图'); s.mode = b.mode; }
  if (b.def && typeof b.def === 'object' && (SHIP_MODS.includes(b.def.id) || b.def.id === 'sc1' || b.def.id === 'sc2')) { const c = defOf(s, b.def.id), cl = x => Math.max(0, Math.min(30, Math.round(+x || 0))); const nx = { p: b.def.p != null ? cl(b.def.p) : c.p, s: b.def.s != null ? cl(b.def.s) : c.s, ana: b.def.ana != null ? !!b.def.ana : c.ana, med: b.def.med != null ? !!b.def.med : c.med }; s.def = { ...(s.def || {}), [b.def.id]: nx }; }
  if (b.imgs && typeof b.imgs === 'object') { s.imgs = { ...(s.imgs || {}) }; for (const k of Object.keys(b.imgs)) { if ((!SHIP_MODS.includes(k) && k !== 'sc1' && k !== 'sc2') || SHIP_NOENTRY.includes(k)) continue; const v = b.imgs[k]; if (!v) delete s.imgs[k]; else if (isImg(v)) s.imgs[k] = saveImg(v); else return bad(res, '图片无效或过大'); } }
  shipSet(s); res.json(shipOut(req.user.id));
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
