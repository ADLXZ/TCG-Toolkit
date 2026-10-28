# TCG Toolkit

同步 Python 搜索模块，读取游游亭 WSR、Lycee、ChaosTCG 搜索结果。
需要 Python 3.11 或更新版本。

```powershell
python -m pip install -e ".[test]"
python -m pytest
```

## 使用

### Docker 英文 Web 界面

启动 Docker Desktop（Linux containers），在项目目录运行：

```powershell
docker compose up -d --build
docker compose ps
docker compose logs -f web
```

打开 http://localhost:8000。服务仅映射到本机地址，容器使用非 root 用户，
自带 `/api/health` 健康检查。停止用 `docker compose stop`，再次启动用
`docker compose start`；更新源码后运行 `docker compose up -d --build`。
代码和静态资源打包在镜像中，没有数据卷或数据库。

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

### CLI 关键词搜索

```powershell
python -m tcg_toolkit wsr OS01
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
from tcg_toolkit import WSRSearcher, LyceeSearcher, ChaosTCGSearcher

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
`game` 使用 `Game` 字符串枚举：`wsr`、`lycee`、`chaos`。

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
