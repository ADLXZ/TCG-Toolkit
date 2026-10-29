// Inventory lookup source policy; ChaosTCG uses marketplace snapshots.
export function lookupSource(game, word) {
  const code = game.trim().toLowerCase();
  if (code === 'chaostcg' || code === 'chaos') return {
    marketplace: true, url: '/api/search?game=chaos&page=1&keyword=' + encodeURIComponent(word)
  };
  if (['lycee', 'ws', 'wsr', 'pm'].includes(code)) return {
    marketplace: false, url: '/api/official/' + code + '/search?word=' + encodeURIComponent(word)
  };
  return null;
}
export function lookupItems(source, items) {
  return source.marketplace ? items.map(item => ({game: 'ChaosTCG', card_number: item.card_number,
    name: item.name, rarity: item.rarity || '', image_url: item.image_url,
    source: 'yuyutei', is_official: false})) : items;
}
