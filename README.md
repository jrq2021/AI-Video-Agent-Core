# 万能视频下载与创作工具

这是一个 React + FastAPI 项目，用于解析你拥有或已获授权处理的公开视频，并提供字幕、摘要、思维导图、批量解析和创作包功能。会员通过兑换码开通；不会绕过付费、私密、地区或版权访问限制。

## 标准本地启动

要求：Windows、Python 3.10+、Node.js 18+，以及可用的 ffmpeg。

首次安装依赖：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r .\backend\requirements.txt
Push-Location .\frontend
npm install
Pop-Location
```

首次配置时，从模板创建本地环境文件：

```powershell
Copy-Item .\backend\.env.example .\backend\.env
```

编辑 `backend/.env` 后，使用统一启动脚本：

```powershell
.\scripts\start-local.ps1
```

标准地址为：

- 前端：`http://127.0.0.1:5173`
- 后端健康检查：`http://127.0.0.1:8000/api/health`

脚本不会覆盖 `.env`、用户数据库或兑换码。`5174/8001` 仅用于临时调试会话，不是标准启动地址。

## 邮箱验证码

QQ 邮箱建议使用 SMTP SSL：

```env
SMTP_HOST="smtp.qq.com"
SMTP_PORT="465"
SMTP_SSL="1"
SMTP_USER="你的QQ邮箱@qq.com"
SMTP_PASSWORD="QQ邮箱SMTP授权码"
SMTP_FROM="你的QQ邮箱@qq.com"
EMAIL_CODE_DEBUG="0"
```

`SMTP_PASSWORD` 必须填写 QQ 邮箱生成的 SMTP 授权码，不是 QQ 登录密码。

本地测试邮件时，可以临时改为：

```env
EMAIL_CODE_DEBUG="1"
```

重启后端后，在注册页发送验证码。页面会显示开发验证码，同时仍会尝试投递邮件。测试完成后立即改回 `EMAIL_CODE_DEBUG="0"` 并重启后端；公开站点绝不能开启调试验证码。

## 生产环境

部署前，将以下值写入部署环境或 `backend/.env`：

```env
APP_ENV="production"
JWT_SECRET="稳定且随机的长字符串"
EMAIL_CODE_SECRET="独立且随机的长字符串"
CORS_ALLOW_ORIGINS="https://你的正式域名"
SMTP_HOST="smtp.qq.com"
SMTP_FROM="你的QQ邮箱@qq.com"
ADMIN_EMAILS="owner@example.com,second-admin@example.com"
EMAIL_CODE_DEBUG="0"
```

`ADMIN_EMAILS` 使用英文逗号分隔；其中每个邮箱都必须已经注册为网站账号。只有白名单账号可访问 `/admin` 和 `/api/admin/*`。修改白名单后需要重启本项目后端；不要将真实邮箱之外的任何密钥提交到 Git。

生产环境缺少上述必要配置时，后端会拒绝启动，避免随机登录密钥、开放跨域或未配置邮件服务导致付费用户无法正常使用。可用下面的命令生成两段随机密钥：

```powershell
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(48)); print(secrets.token_urlsafe(48))"
```

不要把 `backend/.env`、SMTP 授权码、JWT 密钥、支付密钥或 cookies 文件提交到 Git。

## 兑换码交付

卖家在 `backend` 目录中使用本地命令生成、查看或作废兑换码：

```powershell
Push-Location .\backend
..\.venv\Scripts\python.exe coupon_admin.py create --plan pro --type weekly --count 3 --note "xianyu-2026"
..\.venv\Scripts\python.exe coupon_admin.py list --status active
Pop-Location
```

买家注册并登录后访问 `/redeem` 输入兑换码；兑换成功后可在兑换中心和个人中心查看到期时间与每日额度。

## 运营后台

使用 `ADMIN_EMAILS` 白名单中的账号登录后，访问 `/admin`。后台提供运营概览、用户搜索与套餐调整、禁用/逻辑删除/恢复、卡券批量生成与 CSV 导出、撤销卡券以及 90 天操作审计日志。

禁用或逻辑删除用户会立即阻止该账号继续使用现有令牌和重新登录；恢复后会保留原有会员、订单和兑换记录。为防止误操作，后台不允许管理员修改自己的套餐或账号状态。
