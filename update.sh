#!/usr/bin/env bash
# 更新网站：拉取 GitHub 最新代码并重启
set -e
cd "$(dirname "$0")"
git pull --ff-only
npm install --omit=dev
pm2 restart da
echo ">> 已更新到 $(git log -1 --format='%h %s')"
