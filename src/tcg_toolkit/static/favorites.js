export const cardKey = item => JSON.stringify([item.game, item.product_url]);

// One state owner for search buttons and the favorites page.
export function createFavorites(onChange, pause = signal => new Promise(resolve => {
  const done = () => {clearTimeout(timer); signal.removeEventListener('abort', done); resolve();};
  const timer = setTimeout(done, 1000);
  signal.addEventListener('abort', done, {once: true});
  if (signal.aborted) done();
})) {
  let generation = 0, request, controller = new AbortController();
  const state = {records: [], busy: new Set(), messages: new Map(), ready: false, error: '', running: false, done: 0, total: 0};
  const find = item => state.records.find(row => cardKey(row.item) === cardKey(item));
  function clear() {
    generation++; controller.abort(); controller = new AbortController();
    Object.assign(state, {records: [], busy: new Set(), messages: new Map(), ready: false, error: '', running: false, done: 0, total: 0});
    onChange();
  }
  async function call(url, method, body) {
    const response = await request(url, {method, signal: controller.signal, cache: 'no-store',
      ...(method === 'GET' ? {} : {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body ?? {})})});
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      const error = new Error();
      error.key = response.status === 504 ? 'favorite_timeout' : ({refresh_product_missing: 'favorite_missing', refresh_parse_error: 'favorite_parse'})[data?.detail] || 'favorite_failed';
      throw error;
    }
    return data;
  }
  async function load() {
    const current = generation;
    state.error = ''; onChange();
    try {
      const data = await call('/api/favorites', 'GET');
      if (current !== generation) return;
      state.records = data.items; state.ready = true;
    } catch (error) {if (current === generation && error.name !== 'AbortError') state.error = 'favorite_failed';}
    if (current === generation) onChange();
  }
  async function operate(item, refresh = false) {
    const key = cardKey(item), current = generation;
    if (!state.ready || state.busy.has(key)) return;
    const saved = find(item);
    if (refresh && !saved) return;
    state.busy.add(key); state.messages.delete(key); onChange();
    try {
      const result = await call(saved ? `/api/favorites/${saved.id}${refresh ? '/refresh' : ''}` : '/api/favorites',
        saved && !refresh ? 'DELETE' : 'POST', saved ? {} : item);
      if (current !== generation) return;
      if (!saved) state.records.unshift(result);
      else if (refresh) {state.records = state.records.map(row => row.id === saved.id ? result : row); state.messages.set(key, 'favorite_updated');}
      else state.records = state.records.filter(row => row.id !== saved.id);
    } catch (error) {
      if (current === generation && error.name !== 'AbortError') state.messages.set(key, error.key || 'favorite_failed');
    } finally {
      if (current === generation) {state.busy.delete(key); onChange();}
    }
  }
  async function refreshAll() {
    if (state.running || state.busy.size || !state.ready) return;
    const current = generation, signal = controller.signal, rows = [...state.records];
    state.running = true; state.done = 0; state.total = rows.length; onChange();
    for (const row of rows) {
      if (current !== generation) return;
      await operate(row.item, true);
      if (current !== generation) return;
      state.done++; onChange();
      if (state.done < rows.length) await pause(signal);
    }
    if (current === generation) {state.running = false; onChange();}
  }
  return {state, find, clear, load, toggle: item => operate(item), refresh: item => operate(item, true), refreshAll,
    activate(api) {clear(); request = api; return load();}};
}
