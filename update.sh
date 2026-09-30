#!/usr/bin/env bash
# 更新网站：先备份数据库，再拉取 GitHub 最新代码并重启
set -e
cd "$(dirname "$0")"
if [ -f data.db ]; then
  mkdir -p ~/da-backups
  node -e "const D=require('better-sqlite3');new D('data.db').backup(process.argv[1]).then(()=>console.log('>> 数据库已备份到 '+process.argv[1]))" ~/da-backups/data-$(date +%Y%m%d-%H%M%S).db
  ls -1t ~/da-backups/data-*.db 2>/dev/null | tail -n +21 | xargs -r rm --
fi
mkdir -p ~/da-backups/media && cp -rn media/. ~/da-backups/media/ 2>/dev/null || true
git pull --ff-only
npm install --omit=dev
pm2 restart da
echo ">> 已更新到 $(git log -1 --format='%h %s')"
