#!/usr/bin/env bash
# 首次安装：在服务器上执行  bash ~/TERMINAL/setup.sh
set -e
APP_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ">> [1/4] 安装系统组件"
sudo apt-get update -y
sudo apt-get install -y nginx build-essential curl git
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo npm i -g pm2

echo ">> [2/4] 安装网站依赖"
cd "$APP_DIR"
npm install --omit=dev

echo ">> [3/4] 启动网站（开机自启）"
if pm2 describe da >/dev/null 2>&1; then pm2 restart da; else pm2 start server.js --name da; fi
pm2 save
sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$USER" --hp "$HOME" >/dev/null

echo ">> [4/4] 配置 Nginx"
sudo tee /etc/nginx/sites-available/da >/dev/null <<'EOF'
server {
  listen 80 default_server;
  listen [::]:80 default_server;
  server_name _;
  client_max_body_size 6m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
EOF
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/da /etc/nginx/sites-enabled/da
sudo nginx -t && sudo systemctl reload nginx

IP=$(curl -s --max-time 5 http://checkip.amazonaws.com || echo "你的静态IP")
echo ""
echo "=============================================="
echo " 完成！在任何电脑/手机浏览器打开： http://$IP"
echo "=============================================="
