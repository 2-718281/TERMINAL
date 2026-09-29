# Descensus Astrorum · 部署手册（仓库：2-718281/TERMINAL）

仓库里的文件都放在根目录，不分子文件夹：

| 文件 | 作用 |
|---|---|
| `index.html` | 网页本体。改网页就替换这个文件 |
| `server.js` / `package.json` | 后端 |
| `setup.sh` | 服务器首次安装 |
| `update.sh` | 服务器更新 |
| `allow.js` | 授权 ID 名单 |
| `.github/workflows/deploy.yml` | 推送后自动部署（必须放在这个路径） |

## 在服务器上安装
Lightsail 实例页 → **使用 SSH 连接**，逐行粘贴：
```bash
sudo apt-get update -y && sudo apt-get install -y git
git clone https://github.com/2-718281/TERMINAL.git ~/TERMINAL
bash ~/TERMINAL/setup.sh
```
看到「完成！…… http://你的IP」后，用任意设备打开这个地址。左上角显示 ONLINE 就说明成功了。

## 授权 ID
```bash
cd ~/TERMINAL
node allow.js                    # 查看
node allow.js DA-0417 DA-0418    # 添加
node allow.js --remove DA-0417   # 移除
```

## 更新网页
1. 在 GitHub 网页上进入仓库 → **Add file → Upload files**，拖入新的 `index.html` → **Commit changes**
2. 服务器执行 `bash ~/TERMINAL/update.sh`。配好自动部署后，这一步可以省掉

## 自动部署
仓库 **Settings → Secrets and variables → Actions → New repository secret**，添加三个：
- `SSH_HOST`：你的静态 IP
- `SSH_USER`：`ubuntu`
- `SSH_KEY`：Lightsail「账户 → SSH 密钥」里下载的 .pem 文件，全部内容

## 常用命令
```bash
pm2 status        # 运行状态
pm2 logs da       # 日志
pm2 restart da    # 重启
```
