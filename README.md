# TCG Toolkit

同步 Python 搜索模块，读取游游亭 WSR、Lycee、ChaosTCG 搜索结果。
需要 Python 3.11 或更新版本。

```powershell
python -m pip install -e ".[test]"
python -m pytest
```

## 使用

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
