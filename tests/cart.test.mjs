import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../src/tcg_toolkit/static/cart.js', import.meta.url), 'utf8');
const {cartTarget, cartErrorKey, createCart} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const target = {gid: 56, ver: 'OS01', cid: '10044', kizu: 0};
const row = (quantity, type = 'normal', extra = {}) => ({...target, type, quantity, unit_price: 30, ...extra});
const cartOf = items => ({items, total_quantity: items.reduce((s, i) => s + i.quantity, 0),
  subtotal: items.reduce((s, i) => s + i.quantity * i.unit_price, 0), complete: true, warnings: []});
function fakeClient(overrides = {}) {
  const calls = [];
  return {calls, hasCredentials: () => true,
    query: async () => { calls.push(['query']); return cartOf([row(2)]); },
    add: async (card, key) => { calls.push(['add', card, key]); return {after_quantity: 3}; },
    setQuantity: async (card, quantity) => { calls.push(['set', card, quantity]); return {cart: cartOf(quantity ? [row(quantity)] : [])}; },
    ...overrides};
}

test('cart target prefers hidden fields and falls back to the product URL', () => {
  assert.deepEqual(cartTarget({cart: {...target, kizu: 1}}), {...target, kizu: 1});
  assert.deepEqual(cartTarget({game: 'lycee', product_url: 'https://yuyu-tei.jp/sell/lo/card/bd5.0/123'}),
    {gid: 34, ver: 'bd5.0', cid: '123', kizu: 0});
  assert.equal(cartTarget({game: 'ws', product_url: 'https://yuyu-tei.jp/sell/pm/card/a/1'}), null);
  assert.equal(cartTarget({game: 'ws', product_url: 'https://evil.example/sell/ws/card/a/1'}), null);
});

test('refresh reads quantities; unconfigured cart sends nothing', async () => {
  const client = fakeClient();
  const cart = createCart(client);
  await cart.refresh();
  assert.equal(cart.quantity(target), 2);
  assert.equal(cart.state.totalQuantity, 2);
  const empty = createCart(fakeClient({hasCredentials: () => { throw new Error('authentication_required'); },
    query: async () => assert.fail('No query without credentials')}));
  await empty.refresh();
  assert.equal(empty.state.configured, false);
});

test('increase adds one with a fresh idempotency key and keeps reserved rows separate', async () => {
  const client = fakeClient({query: async () => cartOf([row(2), row(1, 'reserved')]),
    add: async (card, key) => { client.calls.push(['add', card, key]); return {after_quantity: 4}; }});
  let n = 0;
  const cart = createCart(client, () => {}, () => `key-${++n}`);
  await cart.refresh();
  await cart.increase(target, {price: 30});
  assert.deepEqual(client.calls.at(-1), ['add', {...target, counter: 1}, 'key-1']);
  assert.equal(cart.quantity(target), 4);
  assert.equal(cart.state.subtotal, 120);
  await cart.increase({...target, cid: '1'}, {price: 50, name: 'New', game: 'lycee'});
  assert.equal(client.calls.at(-1)[2], 'key-2');
});

test('decrease lowers the normal row to an absolute target', async () => {
  const client = fakeClient();
  const cart = createCart(client);
  await cart.refresh();
  await cart.decrease(target);
  assert.deepEqual(client.calls.at(-1), ['set', {...target, type: 'normal'}, 1]);
  assert.equal(cart.quantity(target), 1);
  await cart.decrease(target);
  assert.equal(cart.quantity(target), 0);
  const before = client.calls.length;
  await cart.decrease(target);
  assert.equal(client.calls.length, before, 'Nothing to lower');
});

test('uncertain failures show a message and re-read the cart; double clicks are ignored', async () => {
  let release;
  const client = fakeClient({add: () => new Promise((_, reject) => { release = () => {
    const error = new Error('cart_request_failed'); error.status = 504;
    error.detail = {type: 'yuyutei_timeout', outcome: 'unknown'}; reject(error);
  }; })});
  const cart = createCart(client, () => {}, () => 'key');
  await cart.refresh();
  const first = cart.increase(target);
  await cart.increase(target);
  assert.equal(cart.isBusy(target), true);
  release(); await first;
  assert.equal(cart.message(target), 'cart_unverified');
  assert.deepEqual(client.calls.map(c => c[0]), ['query', 'query']);
});

test('error keys never expose upstream text', () => {
  assert.equal(cartErrorKey({detail: {type: 'yuyutei_cart_rejected', code: 'ERROR1', outcome: 'partial'}}), 'cart_partial');
  assert.equal(cartErrorKey({detail: {type: 'yuyutei_credentials_rejected'}}), 'cart_credentials_rejected');
  assert.equal(cartErrorKey({detail: 'invalid_yuyutei_request'}), 'cart_invalid_credentials');
  assert.equal(cartErrorKey({message: 'yuyutei_credentials_missing'}), 'cart_need_credentials');
  assert.equal(cartErrorKey({detail: {type: 'something_new'}}), 'cart_failed');
});

test('clear drops replies from the previous account', async () => {
  let resolve;
  const cart = createCart(fakeClient({query: () => new Promise(r => { resolve = r; })}));
  const pending = cart.refresh();
  cart.clear();
  resolve(cartOf([row(5)])); await pending;
  assert.equal(cart.quantity(target), 0);
  assert.equal(cart.state.loading, false);
});


test('credential import resets stale cart and enables refresh without querying', () => {
  const client = fakeClient();
  const cart = createCart(client);
  cart.clear({syncCredentials: true});
  assert.equal(cart.state.configured, true);
  assert.equal(cart.state.totalQuantity, null);
  assert.deepEqual(client.calls, []);
});

test('a product new to the cart keeps the search details for the cart page', async () => {
  const client = fakeClient({query: async () => cartOf([]),
    add: async () => ({after_quantity: 1})});
  const cart = createCart(client, () => {}, () => 'key');
  await cart.refresh();
  await cart.increase(target, {price: 30, name: 'Card', game: 'lycee', product_url: 'https://yuyu-tei.jp/sell/lo/card/OS01/10044'});
  assert.deepEqual(cart.state.rows.map(r => [r.name, r.game, r.quantity, r.type]), [['Card', 'lo', 1, 'normal']]);
});

test('adding to a product that only has reserved rows re-reads the cart', async () => {
  const client = fakeClient({query: async () => { client.calls.push(['query']); return cartOf([row(1, 'reserved')]); }});
  const cart = createCart(client, () => {}, () => 'key');
  await cart.refresh();
  await cart.increase(target);
  assert.deepEqual(client.calls.map(c => c[0]), ['query', 'add', 'query']);
  assert.equal(cart.state.rows.length, 1);
});

test('cart page lowers or removes the exact row type', async () => {
  const removed = [];
  const client = fakeClient({query: async () => cartOf([row(2), row(3, 'reserved')]),
    remove: async card => { removed.push(card); return {cart: cartOf([row(2)])}; }});
  const cart = createCart(client);
  await cart.refresh();
  await cart.decrease(target, 'reserved');
  assert.deepEqual(client.calls.at(-1), ['set', {...target, type: 'reserved'}, 2]);
  await cart.refresh();
  await cart.remove(target, 'reserved');
  assert.deepEqual(removed, [{...target, type: 'reserved'}]);
  assert.equal(cart.quantity(target), 2);
});
