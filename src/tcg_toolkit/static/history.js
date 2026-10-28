const KEY = 'tcg.searchHistory';
export function readHistory(storage) {
  try {
    const value = JSON.parse(storage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter(item => typeof item === 'string').reduce(appendHistory, []) : [];
  } catch { return []; }
}
export function appendHistory(history, keyword) {
  const value = keyword.trim();
  return value ? [...history.filter(item => item !== value), value].slice(-10) : history;
}
export function saveHistory(storage, history) {
  try { storage.setItem(KEY, JSON.stringify(history)); } catch { /* Search still works when storage is unavailable. */ }
}
