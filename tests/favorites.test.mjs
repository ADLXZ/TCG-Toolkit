import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = await readFile(new URL('../src/tcg_toolkit/static/favorites.js', import.meta.url));
const {createFavorites, cardKey} = await import(`data:text/javascript;base64,${source.toString('base64')}`);
const item = {game: 'wsr', product_url: 'https://yuyu-tei.jp/sell/wsr/card/a'};
const row = {id: 'one', item, refreshed_at: null};
const response = (data, status = 200) => ({ok: status < 400, status, json: async () => data});

test('add/remove share state; repeated clicks cannot duplicate requests', async () => {
  let resolve, writes = 0, notifications = 0;
  const model = createFavorites(() => notifications++);
  await model.activate(async (url, options) => options.method === 'GET' ? response({items: []}) : (writes++, new Promise(r => {resolve = r;})));
  const pending = model.toggle(item);
  await model.toggle(item);
  assert.equal(writes, 1); assert.ok(model.state.busy.has(cardKey(item)));
  resolve(response(row)); await pending;
  assert.deepEqual(model.find(item), row);
  const removing = model.toggle(item); resolve(response(null, 204)); await removing;
  assert.equal(model.find(item), undefined); assert.ok(notifications > 2);
});

test('refresh all continues after failure and retains failed snapshot', async () => {
  const other = {id: 'two', item: {...item, product_url: item.product_url + '2'}};
  let active = 0, pauses = 0;
  const model = createFavorites(() => {}, async () => {pauses++;});
  await model.activate(async (url, options) => {
    if (options.method === 'GET') return response({items: [row, other]});
    assert.equal(active++, 0); await Promise.resolve(); active--;
    return url.includes('/one/') ? response({detail: 'refresh_product_missing'}, 404) : response({...other, refreshed_at: 123});
  });
  await model.refreshAll();
  assert.deepEqual(model.state.records[0], row);
  assert.equal(model.state.records[1].refreshed_at, 123);
  assert.equal(model.state.messages.get(cardKey(item)), 'favorite_missing');
  assert.equal(model.state.done, 2); assert.equal(pauses, 1); assert.equal(model.state.running, false);
});

test('old response bodies cannot restore previous account data', async () => {
  let resolve;
  const model = createFavorites(() => {});
  const pending = model.activate(async () => ({ok: true, status: 200, json: () => new Promise(r => {resolve = r;})}));
  await Promise.resolve();
  await model.activate(async () => response({items: []}));
  resolve({items: [row]}); await pending;
  assert.deepEqual(model.state.records, []);
});

test('session expiry clears refresh queue and ignores in-flight result', async () => {
  let writes = 0;
  const model = createFavorites(() => {});
  await model.activate(async (url, options) => {
    if (options.method === 'GET') return response({items: [row, {...row, id: 'two'}]});
    writes++; model.clear(); throw new DOMException('Expired', 'AbortError');
  });
  await model.refreshAll();
  assert.equal(writes, 1); assert.deepEqual(model.state.records, []); assert.equal(model.state.running, false);
});
