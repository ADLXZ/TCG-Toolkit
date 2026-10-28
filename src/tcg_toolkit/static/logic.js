export function selectItems(items, filters) {
  const text = filters.text.trim().toLocaleLowerCase();
  const result = items.filter(item => filters.games.includes(item.game)
    && (!filters.stock || item.stock_status === filters.stock)
    && (filters.min === null || item.price >= filters.min)
    && (filters.max === null || item.price <= filters.max)
    && (!text || `${item.name} ${item.card_number}`.toLocaleLowerCase().includes(text)));
  if (filters.sort === 'original') return result;
  const [key, direction] = filters.sort.split(':');
  const collator = new Intl.Collator('en', {numeric: true, sensitivity: 'base'});
  return result.sort((a, b) => {
    if (a[key] === null) return b[key] === null ? 0 : 1;
    if (b[key] === null) return -1;
    const difference = typeof a[key] === 'number' ? a[key] - b[key] : collator.compare(a[key], b[key]);
    return direction === 'desc' ? -difference : difference;
  });
}

export async function loadResults({games, keyword, signal, fetchPage, onPage, onError, wait}) {
  const queue = games.map(game => ({game, page: 1}));
  let failed = false;
  while (queue.length && !signal.aborted) {
    const {game, page} = queue.shift();
    try {
      const result = await fetchPage(game, keyword, page, signal);
      if (signal.aborted) break;
      onPage(result);
      if (result.next_page !== null) queue.push({game, page: result.next_page});
    } catch (error) {
      if (signal.aborted) break;
      failed = true;
      onError(game, error);
    }
    if (queue.length && !signal.aborted) await wait(signal);
  }
  return failed;
}
