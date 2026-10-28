# TCG Toolkit

## 用户系统与远程部署

公开注册后即可登录，登录会话有效期为 7 天，退出会立即撤销当前会话。
搜索和汇率 API 均要求 Bearer 登录。用户名为 3–32 位 ASCII 字母、数字、下划线或连字符，
忽略大小写并以小写保存；密码为 8–18 个字符，空格保留。密码使用 Argon2id，数据库只保存会话令牌摘要。
用户中心的个人资料、账户安全与偏好设置为待开发占位；本版无找回密码和用户管理功能。
搜索历史按用户 ID 保存在当前浏览器，不云同步，旧匿名历史不自动迁移到新账户。

接口：`POST /api/auth/register`（201）、`POST /api/auth/login`、
`POST /api/auth/logout`（204）、`GET /api/auth/me`。
注册和登录请求体为 `{"username":"alice","password":"long-password"}`；注册还必须提交与密码相同的 `confirm_password` 字段；退出发送 `{}`。
写请求必须携带 `Content-Type: application/json` 以及与配置完全一致的 `Origin`；API 客户端需保存令牌并发送 `Authorization: Bearer <token>`。
注册、登录返回 `{user, token}`；`me` 返回用户对象。用户字段为 `id`、`username`、`created_at`（UTC Unix 秒）。
401 表示未登录或凭据不正确，409 表示重名，422 表示输入错误，429 表示限流，403 表示 Origin 未被允许。
注册每 IP 每分钟 5 次，登录 10 次（包含失败请求）；限流在单个服务进程内生效，重启清空。

部署 GitHub Pages 与独立 VPS 请见 [部署手册](deploy/README.md)。浏览器令牌存于 localStorage，旧 Cookie 不再认证，升级后需重新登录。

### 本地或单站点 HTTPS 代理

生产继续使用单个 Uvicorn 进程和 SQLite，将 `.env` 配置为：

```dotenv
TCG_TRUSTED_ORIGINS=https://cards.example.com
TCG_PROXY_IPS=实际代理连接容器时的来源IP
```

Origin 可用逗号分隔多个完整地址，不包含路径。默认未配置 Origin 时不接受注册、登录和退出。
开发修改端口时也要同步更新 Origin。直接运行 Uvicorn 时通过进程环境设置这些变量；
`.env` 自动注入仅适用于 Docker Compose。直接运行时代理配置使用 `FORWARDED_ALLOW_IPS`。

在宿主机用 Caddy 等代理将 HTTPS 转发至 `127.0.0.1:8000`，例如：

```caddyfile
cards.example.com {
    reverse_proxy 127.0.0.1:8000
}
```

保留 Compose 的本机端口绑定，不将 Uvicorn 直接暴露公网。代理应覆盖客户端转发头；
`TCG_PROXY_IPS` 只列明确受信任的代理来源，不能设为 `*`。Docker 转发时来源可能是桥接网关，
应以实际连接来源配置；否则限流会将所有访问计入代理 IP。健康检查公开，API 文档入口关闭。

### 数据与升级

用户库默认 `data/users.sqlite3`，直接运行可用 `TCG_USER_DB` 改路径；Compose 固定为 `/app/data/users.sqlite3`。
用户库和汇率库共同使用原有 `currency-data` 卷，重建镜像与容器保留账户和未过期会话。
数据库使用 `PRAGMA user_version` 标识版本，后续变更需新增迁移；新版数据库不能用旧应用打开。
备份时先 `docker compose stop web`，完整复制数据卷内容，再 `docker compose start web`；
恢复需停止服务并恢复两个数据库，保留容器用户写权限。不要移除数据卷。
升级前备份，再运行 `docker compose up -d --build`。验证原账户仍可登录、搜索、退出，
并确认退出后的旧令牌返回 401。

同步 Python 搜索模块，读取游游亭 WSR、Lycee、ChaosTCG、WS、PM 搜索结果。
需要 Python 3.11 或更新版本。

```powershell
python -m pip install -e ".[test]"
python -m pytest
```

## 使用

### Docker 英文 Web 界面

启动 Docker Desktop（Linux containers）。首次启动先将 `.env.example` 中的登录配置合并到本地 `.env`（保留已有 key）；Origin 必须包含实际访问端口。在项目目录运行：

```powershell
docker compose up -d --build
docker compose ps
docker compose logs -f web
```

打开 http://localhost:8000。服务仅映射到本机地址，容器使用非 root 用户，
自带 `/api/health` 健康检查。停止用 `docker compose stop`，再次启动用
`docker compose start`；更新源码后运行 `docker compose up -d --build`。
代码和静态资源打包在镜像中，用户与汇率数据库保存于持久数据卷。

如果 Windows 保留了 8000 端口，可在 PowerShell 设置 `$env:TCG_PORT = "18080"`，
然后执行启动命令并访问 http://localhost:18080；容器内部端口仍为 8000。
也可将 `TCG_PORT=18080` 写入本地 `.env`，使后续 Compose 命令沿用该端口。
项目网络使用 `10.203.0.0/24`，避免依赖已耗尽的 Docker 默认地址池；
若与本地网络冲突，可通过 `.env` 中的 `TCG_SUBNET` 指定其他空闲子网。

在 Search 页面输入关键词并选择游戏，自动轮询全部分页。Stop 保留已加载结果；
已发送的源站请求可能继续至完成或超时。每个游戏失败后仍会搜索其他游戏。
筛选支持游戏、库存、价格范围、名称或编号；排序作用于全部已加载数据，
未知库存数量始终放末尾。表格先显示 100 条，Show more 继续展开。
界面使用英文，卡牌名称保留原文，不显示源站分页信息。

API：`GET /api/search?game=wsr&keyword=OS01&page=1`，返回分页数据及 `game`。
参数错误为 422，源站超时为 504，其他源站或解析失败为 502。

开发测试（Node.js 仅用于可选前端逻辑测试，运行网站不需要）：

```powershell
python -m pip install -e ".[test,web]"
python -m pytest
node --test tests/web_logic.test.mjs
```

### 外部接口：日元汇率转换

`tcg_toolkit.external` 提供 RapidAPI 汇率客户端，目前支持 JPY → CNY、CAD，USD 已停用。
在项目目录的本地 `.env` 中设置 `RAPIDAPI_KEY`（该文件已被 Git 忽略）。
本地 Python 从当前工作目录读取 `.env`，同名进程环境变量优先；Docker Compose
将 key 注入容器环境，无需复制 `.env` 到镜像。更新配置或代码后运行
`docker compose up -d --build`。

两个请求预设（`amount` 为日元金额，默认 1，允许 0）：

```text
GET /api/currency/convert?to=CNY&amount=750
GET /api/currency/convert?to=CAD&amount=750
```

返回 `from`、`to`、`amount` 和转换金额 `result`，不额外舍入。
参数错误返回 422，缺少 key 返回 503，上游超时返回 504，其他上游错误返回 502。
首次转换获取 CNY、CAD 各自的 1 JPY 汇率，并保存获取时间（UTC Unix 时间戳）。
24 小时内直接使用本地汇率乘以日元金额，超过 24 小时在下一次转换时刷新。
默认数据文件为当前工作目录的 `data/currency.sqlite3`，可用环境变量
`TCG_CURRENCY_CACHE` 指定路径。Docker 使用 `currency-data` 数据卷，重建容器后保留缓存。

每种货币的请求尝试时间在外部调用前写入文件；共用同一数据文件的并发请求和
服务重启不会绕过限制，每种货币 24 小时内最多尝试一次，总计最多两次。
失败也占用当次额度；没有有效汇率时返回错误，不使用过期数据，24 小时后才能重试。
有效缓存不需要 key；需要刷新但缺少 key 时返回 503。请保留数据文件以维持调用额度记录。

```python
from tcg_toolkit.external import CurrencyClient

with CurrencyClient() as currency:
    result = currency.convert_jpy(750, "CNY")
    print(result)
```

### CLI 关键词搜索

```powershell
python -m tcg_toolkit wsr OS01
python -m tcg_toolkit "01" -g ws -g pm --clean
python -m tcg_toolkit lycee LO --page 2
python -m tcg_toolkit chaos YZ --all
python -m tcg_toolkit OS01 --game wsr --clean
python -m tcg_toolkit YZ -g wsr -g lycee -g chaos --all --clean
```

安装后也可使用 `tcg-search wsr OS01`。含空格的关键词请使用引号。
默认输出单页 JSON；`--all` 从 `--page` 指定页开始遍历，每页输出一行 JSON。
输出使用 UTF-8。退出码：成功为 0，搜索失败为 1，参数错误为 2。
遍历失败时已输出的页面会保留，错误写入标准错误流。

`--clean` 使用英文表头和状态提示，展示编号、原始名称、日元价格及库存；标题仅标明游戏和结果条数，不展示分页信息。
重复 `--game`（简写 `-g`）可依次搜索多个游戏，使用同一个关键词；重复游戏只搜索一次。
多游戏的默认输出为每页一行 JSON，额外带顶层 `game` 字段（空结果也能辨认来源）。
某个游戏搜索失败后继续搜索其他游戏，最终退出码为 1。旧的单游戏命令仍可使用。

### Python 调用

```python
import json
from tcg_toolkit import WSRSearcher, LyceeSearcher, ChaosTCGSearcher, WSSearcher, PMSearcher

with WSRSearcher() as searcher:
    page = searcher.search_page("OS01")
    print(json.dumps(page.to_dict(), ensure_ascii=False, indent=2))

with LyceeSearcher() as searcher:
    page = searcher.search_page("LO", page=2)
    print(page.next_page, page.has_next)

with ChaosTCGSearcher(page_interval=1.0, timeout=30.0) as searcher:
    for page in searcher.iter_pages("YZ"):
        print(page.page, len(page.items))
    # 也可逐商品遍历；每次新遍历会重新发起请求。
    items = list(searcher.iter_results("YZ"))
```

`iter_pages` 和 `iter_results` 是惰性迭代器，支持 `start_page=2`。
只有继续迭代才请求下一页；连续分页间隔默认 1 秒，单次请求超时默认 30 秒。
不自动重试，不按卡号去重，保留页面顺序和缺货商品。结果反映各页请求时的状态。

## 返回数据

商品 `SearchItem` 包含 `game`、`name`、`card_number`、整数日元 `price`、
固定 `currency="JPY"`、`stock_status`、`stock_quantity`、`stock_text`、`product_url`。
`game` 使用 `Game` 字符串枚举：`wsr`、`lycee`、`chaos`、`ws`、`pm`。

`StockStatus` 值为 `in_stock`、`out_of_stock`、`unknown`。
具体库存 `N 点` 返回数量；`◯` 表示有货但数量未知（`None`）；`×` 表示缺货（`0`）。
未知或缺失库存文案返回 `unknown` 和 `None`，`stock_text` 保留清理空白后的原文。

`SearchPage` 包含 `items`、`keyword`、`page`、`next_page` 和派生属性 `has_next`。
两个数据类均提供 `to_dict()`，可直接交给 `json.dumps()`。

## 错误与扩展

- 参数错误：`ValueError`。关键词会去除首尾空白，页码必须为正整数。
- HTTP 错误或超时：`SearchRequestError`。
- 页面结构或核心字段异常：`SearchParseError`。
- 活动页不匹配、下一页无效等：`SearchPaginationError`，继承 `SearchParseError`。

搜索异常均带 `game`、`keyword`、`page`、`url`。合法无结果返回空列表；
遍历中发生异常会向调用方抛出，之前已产出的结果仍可使用。
请求页大于 1 而响应没有分页信息时，不能确认该页有效，会抛出分页异常。

`BaseSearcher` 统一请求和分页；子类配置 `game`、`search_path`，可覆盖
`parse_page`、`parse_item`、`parse_stock`、`parse_pagination` 扩展解析。
`client=httpx.Client(...)` 可注入客户端；注入的客户端由调用方关闭。
搜索器实例用于顺序调用，支持 `with` 和 `close()`。

离线测试使用真实页面片段及 `httpx.MockTransport`，运行测试不访问网站。
本阶段只读取搜索页，不请求商品详情，不提供数据库、HTTP 服务或界面。

商品结果新增可选 `image_url`，来自搜索页商品图片，返回绝对 HTTP(S) 地址；缺失时为 `null`，不影响其他字段。Web 列表和网格均显示懒加载图片，缺失或加载失败时显示 `No image`。源站提供的 noimage 占位图地址原样保留。

Web UI 支持 English / 简体中文切换，首次按浏览器语言选择并保存用户偏好。静态及动态文案集中在 src/tcg_toolkit/static/locales.js，i18n.js 负责插值、英文回退及页面更新；切换语言保留搜索结果、筛选和视图。卡牌名称与编号保持原文。

搜索历史保存在当前浏览器 localStorage 中，每次有效提交记录关键词（去除首尾空白后按原文去重，重复搜索移到最新），保留最后 10 个不同关键词。旧历史自动去重，下拉中的“清空历史”按钮会同时清空本地存储，不影响当前关键词或搜索结果。搜索框聚焦显示最新记录在前的下拉列表，选择后填入关键词，保留当前搜索器选择；支持方向键、Enter 和 Esc。

Web UI 的显示货币支持 JPY、CNY、CAD。选择外币时通过已有汇率接口获取 1 JPY 汇率，再统一换算当前和后续结果；保留日元原价。筛选仍以 JPY 为单位，排序按原价进行。加载期间或接口失败回退显示 JPY。首次进入不调用汇率接口，后端的缓存和限流逻辑保持不变。

搜索结果 `rarity` 返回源站稀有度，优先读取商品分组标题，缺失时从图片 alt 中提取，无法识别为 null。列表和网格图片左上角显示三角角标；稀有度筛选选项随已加载结果生成，可与其他筛选组合，支持未知稀有度。

### 我的收藏

登录后可在搜索结果的列表或网格中点击“收藏”，通过侧栏“我的收藏”查看、取消收藏。
每个账号拥有独立收藏夹，数据保存在 `TCG_USER_DB` 指定的服务器 SQLite 数据库中，
重新登录或更换浏览器后仍可访问。启动时自动将数据库版本 1 升级到 2，保留已有用户和会话。

收藏夹支持单张刷新和“刷新全部”。刷新使用卡号查询对应游戏，再按商品链接精确匹配，
更新价格、库存等卡牌信息；刷新全部按顺序执行，卡牌之间间隔一秒。
页面显示进度、每张卡的结果及最后成功刷新时间。上游超时、解析失败或找不到商品时保留原信息，
不会自动删除收藏或将商品标记为缺货。切换页面保留搜索结果；收藏夹沿用搜索页选择的显示货币和列表／网格模式。

接口均需要登录，写操作需要可信 Origin 和 `Content-Type: application/json`：

- `GET /api/favorites`：返回 `{items: [...]}`，按收藏时间倒序排列。
- `POST /api/favorites`：提交 `SearchItem` 格式快照，返回收藏记录；重复收藏返回原记录。
- `DELETE /api/favorites/{id}`：取消当前账号的收藏，返回 204；请求 JSON body 为 `{}`。
- `POST /api/favorites/{id}/refresh`：请求 JSON body 为 `{}`，返回更新后的收藏记录。

收藏记录包含 `id`、`item`、`created_at` 和 `refreshed_at`；时间为 Unix 秒，尚未刷新的 `refreshed_at` 为 null。
读取或修改其他账号的收藏返回 404。商品未找到返回 404（`refresh_product_missing`），
上游请求或解析失败返回 502，超时返回 504；这些失败不改动已存快照。
