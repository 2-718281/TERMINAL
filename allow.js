// 管理注册授权名单
//   node deploy/allow.js                 查看名单
//   node deploy/allow.js DA-0417 DA-0418 添加
//   node deploy/allow.js --remove DA-0417 移除
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'data.db'));
db.exec('create table if not exists allowed_ids(id text primary key)');

const args = process.argv.slice(2);
const remove = args[0] === '--remove';
const ids = (remove ? args.slice(1) : args).map(s => s.toUpperCase());

if (!ids.length) {
  const rows = db.prepare('select a.id, (u.id is not null) reg from allowed_ids a left join users u on u.id = a.id order by a.id').all();
  console.log('授权名单（' + rows.length + '）：');
  rows.forEach(r => console.log('  ' + r.id + (r.reg ? '  · 已注册' : '')));
  process.exit(0);
}
const stmt = db.prepare(remove ? 'delete from allowed_ids where id = ?' : 'insert or ignore into allowed_ids values(?)');
ids.forEach(id => { stmt.run(id); console.log((remove ? '已移除 ' : '已授权 ') + id); });
