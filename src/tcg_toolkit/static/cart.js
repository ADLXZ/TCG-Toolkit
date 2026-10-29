// YuYu-Tei cart state for search results: per-product quantities, +1 / −1 actions.
// The shop is the source of truth; every change is reported back by the server.
const GAME_IDS = {ws: 7, chaos: 8, pm: 11, lycee: 34, wsr: 56};
const GAME_PATHS = {ws: 'ws', chaos: 'chaos', pm: 'pm', lycee: 'lo', wsr: 'wsr'};

// Prefer the hidden cart_* fields; older snapshots fall back to the product URL,
// whose /card/<ver>/<cid> path is the same identity the cart page links to.
export function cartTarget(item) {
  if (item.cart) return item.cart;
  try {
    const url = new URL(item.product_url);
    const match = url.hostname === 'yuyu-tei.jp' && url.pathname.match(/^\/sell\/([A-Za-z0-9_-]+)\/card\/([A-Za-z0-9_.-]+)\/([0-9]+)$/);
    if (match && match[1] === GAME_PATHS[item.game]) return {gid: GAME_IDS[item.game], ver: match[2], cid: match[3], kizu: 0};
  } catch { /* not a product URL */ }
  return null;
}
export const productKey = target => JSON.stringify([target.gid, target.ver, target.cid, target.kizu]);

export function cartErrorKey(error) {
  if (error?.message === 'yuyutei_credentials_missing') return 'cart_need_credentials';
  const detail = error?.detail, type = typeof detail === 'string' ? detail : detail?.type;
  if (detail?.outcome === 'partial') return 'cart_partial';
  return ({yuyutei_credentials_rejected: 'cart_credentials_rejected', yuyutei_cart_rejected: 'cart_rejected',
    yuyutei_quantity_mismatch: 'cart_unverified', yuyutei_timeout: 'cart_unverified',
    yuyutei_cart_item_not_found: 'cart_out_of_date', yuyutei_cart_item_ambiguous: 'cart_ambiguous',
    invalid_yuyutei_request: 'cart_invalid_credentials',
    cart_operation_pending: 'cart_unverified'})[type]
    ?? (detail?.outcome === 'unknown' ? 'cart_unverified' : 'cart_failed');
}

// randomUUID needs a secure context; plain-HTTP deployments still have getRandomValues.
const randomKey = () => globalThis.crypto.randomUUID?.()
  ?? [...globalThis.crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');

export function createCart(client, onChange = () => {}, newKey = randomKey) {
  // generation: signed-in user; reads: latest cart query (older replies are dropped).
  let generation = 0, reads = 0;
  const state = {configured: false, loading: false, error: '', rows: [], totalQuantity: null,
    subtotal: null, complete: true, busy: new Set(), messages: new Map()};
  function apply(cart) {
    state.rows = cart.items; state.totalQuantity = cart.total_quantity;
    state.subtotal = cart.subtotal; state.complete = cart.complete;
  }
  function configured() {
    try { return client.hasCredentials(); } catch { return false; }
  }
  function clear() {
    generation++;
    Object.assign(state, {configured: false, loading: false, error: '', rows: [], totalQuantity: null,
      subtotal: null, complete: true, busy: new Set(), messages: new Map()});
    onChange();
  }
  async function refresh() {
    const current = generation, read = ++reads;
    state.configured = configured(); state.error = '';
    if (!state.configured) { state.rows = []; state.totalQuantity = state.subtotal = null; onChange(); return; }
    state.loading = true; onChange();
    try {
      const cart = await client.query();
      if (current === generation && read === reads) apply(cart);
    } catch (error) {
      if (current === generation && read === reads && error.name !== 'AbortError') state.error = cartErrorKey(error);
    }
    if (current === generation && read === reads) { state.loading = false; onChange(); }
  }
  const rowsFor = target => state.rows.filter(row => productKey(row) === productKey(target));
  const quantity = target => rowsFor(target).reduce((sum, row) => sum + row.quantity, 0);
  async function operate(target, action) {
    const key = productKey(target), current = generation;
    if (state.busy.has(key)) return;
    state.busy.add(key); state.messages.delete(key); onChange();
    let resync = false;
    try {
      await action();
      // This reply is newer than any query still in flight.
      reads++; state.loading = false; state.error = '';
    } catch (error) {
      if (current !== generation || error.name === 'AbortError') return;
      state.messages.set(key, cartErrorKey(error));
      // The outcome may differ from what we believe: read the real cart again.
      resync = error.status !== 422 && error.message !== 'yuyutei_credentials_missing';
    } finally {
      if (current === generation) { state.busy.delete(key); onChange(); }
    }
    if (resync && current === generation) await refresh();
  }
  function increase(target, unitPrice = 0) {
    return operate(target, async () => {
      const result = await client.add({...target, counter: 1}, newKey());
      // Reflect the verified count locally instead of re-reading the whole cart.
      const rows = rowsFor(target), others = rows.filter(row => row.type !== 'normal');
      const normal = rows.find(row => row.type === 'normal');
      const own = result.after_quantity - others.reduce((sum, row) => sum + row.quantity, 0);
      if (normal) normal.quantity = own;
      else state.rows.push({...target, type: 'normal', quantity: own, unit_price: unitPrice});
      if (state.complete) {
        state.totalQuantity = state.rows.reduce((sum, row) => sum + row.quantity, 0);
        state.subtotal = state.rows.reduce((sum, row) => sum + row.quantity * row.unit_price, 0);
      }
    });
  }
  function decrease(target) {
    const rows = rowsFor(target);
    // Normal rows first; reserved rows of the same card are lowered once it is gone.
    const row = rows.find(item => item.type === 'normal') ?? rows[0];
    if (!row) return Promise.resolve();
    return operate(target, async () => {
      const result = await client.setQuantity({...target, type: row.type}, row.quantity - 1);
      apply(result.cart);
    });
  }
  return {state, refresh, clear, quantity, increase, decrease,
    isBusy: target => state.busy.has(productKey(target)),
    message: target => state.messages.get(productKey(target))};
}
