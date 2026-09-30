#!/usr/bin/env bash
# 开启 HTTPS：bash ~/TERMINAL/https.sh 你的域名 你的邮箱
# 例：bash ~/TERMINAL/https.sh da.example.com me@gmail.com
set -e
DOMAIN="$1"; EMAIL="$2"
if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then echo "用法：bash ~/TERMINAL/https.sh 你的域名 你的邮箱"; exit 1; fi

echo ">> [1/3] 检查域名解析"
MYIP=$(curl -s --max-time 5 http://checkip.amazonaws.com)
DNSIP=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -n1)
echo "   服务器 IP：$MYIP    域名解析到：${DNSIP:-（未解析）}"
if [ "$MYIP" != "$DNSIP" ]; then echo "!! 域名还没有指向这台服务器，请先设置 A 记录并等待几分钟后重试"; exit 1; fi

echo ">> [2/3] 安装 certbot"
sudo NEEDRESTART_MODE=a DEBIAN_FRONTEND=noninteractive apt-get install -y certbot python3-certbot-nginx
sudo sed -i "s/server_name .*;/server_name $DOMAIN;/" /etc/nginx/sites-available/da
sudo nginx -t && sudo systemctl reload nginx

echo ">> [3/3] 申请证书并开启 HTTPS（自动把 http 跳转到 https）"
sudo certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --no-eff-email --redirect -n

echo ""
echo "=============================================="
echo " 完成！现在访问： https://$DOMAIN"
echo " 证书每 90 天会自动续期，无需操作"
echo "=============================================="
