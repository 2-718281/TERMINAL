#!/usr/bin/env bash
# 开启 HTTPS，同时保留静态 IP 直接访问（http://IP）
# 用法：bash ~/TERMINAL/https.sh 你的域名 你的邮箱
# 例：bash ~/TERMINAL/https.sh descensusastrorum.com me@gmail.com
# 已经运行过旧版本也可以直接再运行一次，会自动修正配置
set -e
DOMAIN="$1"; EMAIL="$2"
if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then echo "用法：bash ~/TERMINAL/https.sh 你的域名 你的邮箱"; exit 1; fi

echo ">> [1/4] 检查域名解析"
MYIP=$(curl -s --max-time 5 http://checkip.amazonaws.com)
DNSIP=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -n1)
WWWIP=$(getent hosts "www.$DOMAIN" | awk '{print $1}' | head -n1)
echo "   服务器 IP：$MYIP"
echo "   $DOMAIN → ${DNSIP:-（未解析）}"
echo "   www.$DOMAIN → ${WWWIP:-（未解析）}"
if [ "$MYIP" != "$DNSIP" ]; then echo "!! 域名还没有指向这台服务器，请先设置 A 记录并等待几分钟后重试"; exit 1; fi
NAMES="$DOMAIN"; ARGS=(-d "$DOMAIN")
if [ "$MYIP" = "$WWWIP" ]; then NAMES="$DOMAIN www.$DOMAIN"; ARGS+=(-d "www.$DOMAIN"); else echo "   （www 未指向本机，只为 $DOMAIN 申请证书）"; fi

echo ">> [2/4] 安装 certbot"
sudo NEEDRESTART_MODE=a DEBIAN_FRONTEND=noninteractive apt-get install -y certbot python3-certbot-nginx

echo ">> [3/4] 写入 Nginx 配置（IP 直连 + 域名各一份）"
PROXY='  client_max_body_size 12m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }'
# IP 直连：默认站点，只走 http
sudo tee /etc/nginx/sites-available/da >/dev/null <<EOF
server {
  listen 80 default_server;
  listen [::]:80 default_server;
  server_name _;
$PROXY
}
EOF
# 域名：certbot 会在这份里加上 https 和跳转
sudo tee /etc/nginx/sites-available/da-domain >/dev/null <<EOF
server {
  listen 80;
  listen [::]:80;
  server_name $NAMES;
$PROXY
}
EOF
sudo ln -sf /etc/nginx/sites-available/da /etc/nginx/sites-enabled/da
sudo ln -sf /etc/nginx/sites-available/da-domain /etc/nginx/sites-enabled/da-domain
sudo nginx -t && sudo systemctl reload nginx

echo ">> [4/4] 申请证书并开启 HTTPS（域名的 http 自动跳转到 https）"
sudo certbot --nginx "${ARGS[@]}" -m "$EMAIL" --agree-tos --no-eff-email --redirect --keep-until-expiring -n

echo ""
echo "=============================================="
echo " 完成！"
echo "   域名（加密）：https://$DOMAIN"
echo "   静态 IP     ：http://$MYIP"
echo " 证书每 90 天会自动续期，无需操作"
echo "=============================================="
