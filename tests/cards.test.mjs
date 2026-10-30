import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = await readFile(new URL('../src/tcg_toolkit/static/cards.js', import.meta.url), 'utf8');
const {createCards, filterCards, summarizeCards} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const card = {id: 'one', game: 'WS', card_number: 'ABC-001', rarity: 'SR', name: 'First', quantity: 2, notes: 'Keep'};
const reply = (data, status = 200) => ({ok: status < 400, status, json: async () => data});

test('SEV language brands stay separate in filters and quantity statistics', () => {
  const rows = [{...card, game: 'SEV', rarity: 'SP', quantity: 2},
    {...card, id: 'english', game: 'SEV EN', rarity: 'SP', quantity: 5}];
  assert.deepEqual(filterCards(rows, {game: 'sev'}), [rows[0]]);
  assert.deepEqual(filterCards(rows, {game: 'sev en'}), [rows[1]]);
  assert.deepEqual(summarizeCards(rows).games, [
    {label: 'SEV', kinds: 1, quantity: 2}, {label: 'SEV EN', kinds: 1, quantity: 5}]);
});

test('filters and grouped statistics include zero stock without counting its type', () => {
  const rows = [card, {...card, id: 'two', game: 'Custom', name: 'Other', rarity: 'R', quantity: 0}, {...card, id: 'three', quantity: 3}];
  const stats = summarizeCards(rows);
  assert.equal(stats.kinds, 2); assert.equal(stats.quantity, 5);
  assert.deepEqual(stats.games, [{label: 'WS', kinds: 2, quantity: 5}, {label: 'Custom', kinds: 0, quantity: 0}]);
  assert.equal(filterCards(rows, {query: ' abc ', game: 'ws', rarity: 'sr'}).length, 2);
  assert.equal(filterCards(rows, {query: 'other'}).length, 1);
  assert.deepEqual(summarizeCards([]), {kinds: 0, quantity: 0, games: [], rarities: []});
});
test('duplicate and failed saves preserve draft; failed deletion preserves data', async () => {
  const cards = createCards(() => {}); let failure = 409;
  await cards.activate(async (_, options) => options.method === 'GET' ? reply({items: [card]}) : reply({detail: {id: 'one'}}, failure));
  cards.state.draft = {...card, name: 'Unsaved'};
  await cards.save();
  assert.equal(cards.state.error, 'cards_duplicate'); assert.equal(cards.state.duplicate, 'one');
  assert.equal(cards.state.draft.name, 'Unsaved');
  cards.edit(cards.state.duplicate); assert.equal(cards.state.editing, 'one'); assert.equal(cards.state.draft.name, 'First');
  failure = 500; cards.state.draft.notes = 'Draft'; await cards.save();
  assert.equal(cards.state.draft.notes, 'Draft'); assert.equal(cards.state.records[0].notes, 'Keep');
  await cards.remove('one'); assert.deepEqual(cards.state.records, [card]);
});
test('save updates quantity and delete updates statistics', async () => {
  const cards = createCards(() => {});
  await cards.activate(async (_, options) => options.method === 'GET' ? reply({items: [card]}) : options.method === 'DELETE' ? reply(null, 204) : reply({...card, ...JSON.parse(options.body)}));
  cards.edit('one'); cards.state.draft.quantity = 4; await cards.save();
  assert.equal(summarizeCards(cards.state.records).quantity, 4);
  assert.equal(cards.state.editing, '');
  await cards.remove('one'); assert.equal(summarizeCards(cards.state.records).quantity, 0);
});
test('old account load and mutation responses cannot repopulate state', async () => {
  const cards = createCards(() => {}); let resolve;
  const loading = cards.activate(() => new Promise(r => {resolve = r;}));
  await cards.activate(async () => reply({items: []}));
  resolve(reply({items: [card]})); await loading;
  assert.deepEqual(cards.state.records, []);
  await cards.activate(async (_, options) => options.method === 'GET' ? reply({items: [card]}) : new Promise(r => {resolve = r;}));
  cards.edit('one'); const saving = cards.save(); cards.clear();
  resolve(reply(card)); await saving;
  assert.deepEqual(cards.state.records, []); assert.equal(cards.state.draft.name, ''); assert.equal(cards.state.ready, false);
});

test('thumbnail survives editing and save, and resets for a new card', async () => {
  const saved = {...card, image_url: 'https://example.com/card.png'};
  let submitted;
  const cards = createCards(() => {});
  await cards.activate(async (_, options) => {
    if (options.method === 'GET') return reply({items: [saved]});
    submitted = JSON.parse(options.body); return reply({...saved, ...submitted});
  });
  cards.edit(saved.id); assert.equal(cards.state.draft.image_url, saved.image_url);
  cards.state.draft.quantity = 6; await cards.save();
  assert.equal(submitted.image_url, saved.image_url);
  assert.equal(cards.state.records[0].image_url, saved.image_url);
  assert.equal(cards.state.draft.image_url, '');
});
