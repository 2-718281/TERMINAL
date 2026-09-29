# Descensus Astrorum · 部署手册

跟着做完，你会得到一个 `http://你的IP` 的网址，任何人在任何电脑、手机上都能打开、登录、发帖。
以后改网页只要推送到 GitHub，服务器自动更新。

```
你的电脑 ──push──▶ GitHub ──自动──▶ AWS 服务器 ◀── 访客浏览器
```

## 网站包里有什么

| 文件 | 作用 |
|---|---|
| `public/index.html` | 网页本体（手机客户端）。改网页就是替换这个文件 |
| `server.js` | 后端：登录、注册、帖子、头像 |
| `package.json` | 后端依赖清单 |
| `deploy/setup.sh` | 服务器首次安装脚本（一条命令装好全部） |
| `deploy/update.sh` | 服务器更新脚本 |
| `deploy/allow.js` | 管理「可注册 ID」授权名单 |
| `.github/workflows/deploy.yml` | GitHub 自动部署 |

> `.gitignore` 和 `.github` 是隐藏文件/文件夹。Mac 按 `Cmd+Shift+.` 显示，Windows 在资源管理器「查看 → 隐藏的项目」打勾。它们必须一起上传。

---

## 第一步 · 把网站包放到 GitHub（约 10 分钟）

用 **GitHub Desktop**（图形界面，不用敲命令，隐藏文件也会一起上传）。

1. 注册/登录 https://github.com
2. 下载安装 GitHub Desktop：https://desktop.github.com ，打开后用 GitHub 账号登录
3. 把下载的网站包解压，把文件夹改名为 `da-site`，放到一个好找的位置（如「文档」）
4. GitHub Desktop 菜单 **File → Add local repository…** → 选择 `da-site` 文件夹
   - 提示「This directory does not appear to be a Git repository」→ 点 **create a repository** → 再点 **Create repository**
5. 左下角 Summary 填 `首次上传` → 点 **Commit to main**
6. 顶部点 **Publish repository**
   - Name：`da-site`
   - **Keep this code private**：建议**取消勾选**（公开仓库部署最简单；代码里没有密码，用户数据不会上传）。如果坚持私有，见文末「私有仓库」
   - 点 **Publish repository**
7. 浏览器打开 `https://github.com/你的用户名/da-site`，能看到文件就成功了

---

## 第二步 · 在 AWS 开一台服务器（约 10 分钟）

用 **Amazon Lightsail**（AWS 的简化版服务器，固定月费，适合新手）。

1. 登录 https://lightsail.aws.amazon.com （没有 AWS 账号先注册，需要绑信用卡）
2. 右上角可切换中文。点 **创建实例**
3. **实例位置**：选离访客近的区域
   - 访客主要在中国大陆 → 选 **东京** 或 **新加坡**
4. **选择平台**：Linux/Unix
5. **选择蓝图**：点 **仅操作系统** → **Ubuntu 22.04 LTS**
6. **选择实例套餐**：最便宜的一档即可（价格以页面为准）
7. **实例名称**：`da-server` → 点 **创建实例**
8. 等 1–2 分钟，状态变成「正在运行」

### 2.1 固定 IP（重要，否则重启后 IP 会变）
1. 左侧 **联网** → **创建静态 IP**
2. 附加到实例：选 `da-server` → 名称随意 → **创建**
3. 记下这个 IP，例如 `54.12.34.56`，下文称 **你的IP**

### 2.2 开放端口
1. 点进 `da-server` 实例 → **联网** 标签
2. **IPv4 防火墙** 里应该已有 SSH(22)、HTTP(80)
3. 点 **添加规则** → 应用程序选 **HTTPS** → **创建**（为以后加域名做准备）

---

## 第三步 · 在服务器上安装网站（约 5 分钟）

1. 实例页面点橙色 **使用 SSH 连接**，会弹出一个黑色终端窗口
2. 依次**复制粘贴**下面每一行，回车（把 `你的用户名` 换成你的 GitHub 用户名）：

```bash
sudo apt-get update -y && sudo apt-get install -y git
git clone https://github.com/你的用户名/da-site.git ~/da-site
bash ~/da-site/deploy/setup.sh
```

3. 等 2–4 分钟，最后出现：

```
 完成！在任何电脑/手机浏览器打开： http://你的IP
```

4. 用手机或另一台电脑打开 `http://你的IP`
   - 左上角显示 **ONLINE** 表示已连上服务器（显示 LOCAL DEMO 说明没连上，见「常见问题」）
   - 输入 `DA-6666` → 设置密码 → 进入主页

**到这里，别人已经可以访问了。** 把 `http://你的IP` 发给他们即可。

---

## 第四步 · 管理授权 ID（谁可以注册）

只有名单里的 ID 能注册。在服务器终端（**使用 SSH 连接**）里：

```bash
cd ~/da-site
node deploy/allow.js                    # 查看名单
node deploy/allow.js DA-0417 DA-0418    # 添加（可一次多个）
node deploy/allow.js --remove DA-0417   # 移除
```

名单存在服务器的 `data.db` 里，更新网站不会清空。

---

## 第五步 · 以后怎么更新网页

### 5.1 替换文件并推送
1. 把新的 `index.html` 覆盖到你电脑上的 `da-site/public/index.html`
2. 打开 GitHub Desktop，左侧会显示改动 → Summary 写 `更新网页` → **Commit to main** → **Push origin**

### 5.2 让服务器拉取更新（二选一）

**A. 手动（最简单）**：服务器终端执行
```bash
bash ~/da-site/deploy/update.sh
```

**B. 自动（推荐，一次配置永久省事）**：之后每次 Push，服务器会在 1 分钟内自动更新。
1. Lightsail 右上角头像 → **账户** → **SSH 密钥** → 找到你实例所在区域的**默认密钥** → **下载**，得到一个 `.pem` 文件
2. 用记事本/文本编辑打开 `.pem`，**全选复制**（包括 `-----BEGIN` 和 `-----END` 两行）
3. 打开 `https://github.com/你的用户名/da-site` → **Settings** → 左侧 **Secrets and variables → Actions** → **New repository secret**，依次添加三个：

| Name | Secret |
|---|---|
| `SSH_HOST` | 你的IP |
| `SSH_USER` | `ubuntu` |
| `SSH_KEY` | 刚才复制的 .pem 全部内容 |

4. 仓库顶部 **Actions** → 左侧 **Deploy** → **Run workflow** 试一次，出现绿色 ✓ 即成功

---

## 可选 · 绑定域名 + HTTPS（强烈建议正式使用前做）

没有 HTTPS 时浏览器会显示「不安全」，密码以明文传输。

1. 买一个域名（Cloudflare、Namecheap、阿里云国际等）
2. 在域名的 DNS 设置里添加一条 **A 记录**：主机 `@`（或 `app`），值 = 你的IP
3. 等 5–30 分钟生效后，服务器终端执行（把域名换成你的）：
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名.com
```
4. 按提示输入邮箱、同意条款，完成后访问 `https://你的域名.com`。证书会自动续期。

---

## 备份

用户、帖子、头像都在服务器 `~/da-site/data.db`。
Lightsail 实例页 → **快照** → **创建快照**，或开启 **自动快照**（每天一次）。

---

## 常见问题

**打开网页左上角显示 LOCAL DEMO**
说明网页没连到后端。服务器执行 `pm2 logs da --lines 30` 看报错；执行 `pm2 restart da` 重启。

**网页打不开 / 一直转圈**
- 确认用的是 `http://` 不是 `https://`（没配域名证书前）
- 确认第 2.2 步防火墙里有 HTTP(80)
- 服务器执行 `sudo systemctl status nginx`，不是 active 就执行 `sudo systemctl restart nginx`

**GitHub Actions 显示红色 ✗**
点进去看日志。多半是 `SSH_KEY` 复制不完整，或区域选错了密钥。

**私有仓库**
第三步 `git clone` 时会要求输入用户名和密码：密码处填 GitHub **Personal access token**（GitHub → 头像 → Settings → Developer settings → Personal access tokens → Fine-grained → 仅勾选该仓库的 Contents: Read）。之后执行一次 `git -C ~/da-site config credential.helper store`，以后 `update.sh` 就不会再问。

**常用服务器命令**
```bash
pm2 status            # 网站是否在运行
pm2 logs da           # 实时日志（Ctrl+C 退出）
pm2 restart da        # 重启网站
```
