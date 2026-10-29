import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
const source = await readFile(new URL('../src/tcg_toolkit/static/card-sources.js', import.meta.url), 'utf8');
const {lookupSource, lookupItems} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('ChaosTCG uses the existing authenticated marketplace search', () => {
  const config = lookupSource('ChaosTCG', 'AB/001');
  assert.equal(config.url, '/api/search?game=chaos&page=1&keyword=AB%2F001');
  assert.equal(config.marketplace, true);
  const items = lookupItems(config, [{game: 'chaos', card_number: 'AB/001', name: 'Card', rarity: null, stock_quantity: 9, price: 100}]);
  assert.equal(items[0].game, 'ChaosTCG');
  assert.equal(items[0].is_official, false);
  assert.equal(items[0].source, 'yuyutei');
  assert.equal(items[0].rarity, '');
  assert.equal('quantity' in items[0], false);
  assert.equal('price' in items[0], false);
});
test('official games keep their sources; other games have no lookup', () => {
  for (const game of ['WS', 'WSR', 'Lycee', 'PM']) {
    const config = lookupSource(game, 'test');
    assert.equal(config.marketplace, false);
    assert.equal(config.url, `/api/official/${game.toLowerCase()}/search?word=test`);
    const items = [{game}]; assert.equal(lookupItems(config, items), items);
  }

  assert.equal(lookupSource('Unknown', 'test'), null);
});
