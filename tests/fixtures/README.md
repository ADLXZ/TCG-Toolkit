# 页面片段

2026-10-27 从 `https://yuyu-tei.jp/sell/{game}/s/search` 获取：

- `wsr_1.html`：`search_word=OS01`。
- `lo_1.html`、`lo_2.html`：`search_word=LO`，第一页和第二页。
- `chaos_1.html`、`chaos_2.html`：`search_word=YZ`，第一页和末页。
- `empty.html`：WSR，`search_word=ZZZ_NO_MATCH_927481`。

保留真实商品节点（前两件及每种库存文案的样例）、分页栏和无结果提示，
以最小 main/cards-list 容器包裹。删去了页面导航等无关内容。
这些片段用于离线解析测试，不代表当前价格或库存。

2026-10-29 从 `https://yuyu-tei.jp/sell/wsr/card/OS01/10240` 获取：

- `product_wsr.html`：商品页标题（稀有度 + 名称）和印刷编号，删去库存、购物车控件和推荐商品。
