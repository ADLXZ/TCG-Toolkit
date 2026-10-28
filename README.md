# TCG Toolkit

在一个页面里查询游游亭的卡牌价格与库存。支持 WSR、WS、PM、Lycee、ChaosTCG，
可同时搜索多个游戏、筛选排序全部结果、收藏卡牌并刷新最新信息。

## 使用 Web UI

1. **注册 / 登录**：首次使用点击“没有账户？注册”。用户名 3–32 位字母、数字、下划线或连字符，密码 8–18 个字符。
2. **搜索**：输入卡名或编号，勾选要搜索的游戏后点“搜索”。会自动加载全部分页，可随时“停止”并保留已加载结果。
   聚焦搜索框可选择最近 10 条搜索历史。
3. **筛选与排序**：按名称或编号、稀有度、库存、价格区间（双点滑动条）和游戏筛选，排序作用于全部已加载结果。
   右上角可在列表和网格视图之间切换。
4. **收藏**：点击卡牌上的 ☆ 收藏，在侧边栏“我的收藏”中查看。收藏页同样支持筛选和两种视图，
   可单张刷新或“刷新全部”以获取最新价格和库存；刷新失败时保留原信息。
5. **语言与货币**：侧边栏底部切换 English / 简体中文，以及显示货币 JPY / CNY / CAD（保留日元原价）。
6. **用户中心**：点击侧边栏左下角的头像进入，可查看账户信息并退出登录。

点击卡名会在新标签页打开游游亭的商品页。

## 本地部署

### 方式一：Docker（推荐）

需要 Docker Desktop（Linux containers）。

1. 在项目目录复制配置文件：

   ```powershell
   Copy-Item .env.example .env
   ```

2. 按需编辑 `.env`（见下方配置表）。`TCG_TRUSTED_ORIGINS` 必须与浏览器访问地址完全一致，包括端口，否则无法登录。

3. 构建并启动：

   ```powershell
   docker compose up -d --build
   ```

4. 打开 http://localhost:8000 。

常用命令：

```powershell
docker compose ps              # 查看状态
docker compose logs -f web     # 查看日志
docker compose stop            # 停止
docker compose start           # 再次启动
docker compose up -d --build   # 更新代码后重建
```

用户、收藏和汇率数据保存在 `currency-data` 数据卷中，重建镜像不会丢失。备份时先 `docker compose stop web`，
复制数据卷内容后再 `docker compose start web`；不要删除该数据卷。

如果 Windows 占用了 8000 端口，在 `.env` 中设置 `TCG_PORT=18080`，并同步把 `TCG_TRUSTED_ORIGINS`
改为 `http://localhost:18080`，然后访问 http://localhost:18080 。

### 方式二：直接运行 Python

需要 Python 3.11 或更新版本。

```powershell
python -m venv venv
venv\Scripts\activate
python -m pip install -e ".[web]"
Copy-Item .env.example .env
uvicorn tcg_toolkit.web:app --app-dir src --port 8000 --env-file .env
```

打开 http://localhost:8000 。数据默认保存在项目目录的 `data/` 下。

### 配置项

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `TCG_TRUSTED_ORIGINS` | 允许登录的访问地址，多个用逗号分隔，不含路径 | 空（不允许登录） |
| `TCG_PORT` | Docker 映射到本机的端口 | `8000` |
| `RAPIDAPI_KEY` | 汇率接口密钥；不填时只能显示日元 | 空 |
| `TCG_SEARCH_PROXY_URL` | 搜索 HTML 转发接口；显式设为空可直连 | `http://62.234.212.90:8080/proxy` |
| `TCG_USER_DB` | 用户与收藏数据库路径（直接运行时） | `data/users.sqlite3` |
| `TCG_CURRENCY_CACHE` | 汇率缓存路径（直接运行时） | `data/currency.sqlite3` |
| `TCG_PROXY_IPS` | 受信任的反向代理来源 IP，不要设为 `*` | `127.0.0.1` |
| `TCG_SUBNET` | Docker 网络子网，与本地网络冲突时修改 | `10.203.0.0/24` |

`.env` 已被 Git 忽略，请勿提交密钥。公网部署请参阅 [部署手册](deploy/README.md)。
