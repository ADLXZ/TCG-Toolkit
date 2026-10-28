import {createCards, filterCards, summarizeCards} from './cards.js';
import {t, getLanguage} from './i18n.js';
const $ = id => document.getElementById(id);
const fields = ['game', 'card_number', 'rarity', 'name', 'quantity', 'notes'];
let filters = {query: '', game: '', rarity: ''}, pendingDelete = null;
const inventory = createCards(render);
function node(tag, text = '', className = '') {const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el;}
function icon(name) {return node('i', '', `bi ${name}`);}
const number = value => value.toLocaleString(getLanguage());
const editorOpen = () => $('card-dialog').open;
function options(id, field) {
  const select = $(id), value = filters[field];
  const labels = new Map(inventory.state.records.map(row => [row[field].toLowerCase(), row[field]]));
  const all = node('option', t('cards_all')); all.value = '';
  select.replaceChildren(all, ...[...labels.values()].sort().map(label => {const option = node('option', label); option.value = label; return option;}));
  if (value && ![...select.options].some(option => option.value === value)) {const option = node('option', value); option.value = value; select.append(option);}
  select.value = value;
}
function chips(groups) {
  return groups.map(group => {
    const chip = node('li', '', 'stat-chip');
    chip.append(node('span', group.label, 'stat-chip-label'), node('span', t('cards_totals', {kinds: number(group.kinds), quantity: number(group.quantity)}), 'stat-chip-value'));
    return chip;
  });
}
function iconButton(name, label, handler, disabled) {
  const button = node('button', '', 'icon-button row-action'); button.type = 'button';
  button.append(icon(name)); button.setAttribute('aria-label', label); button.title = label;
  button.disabled = disabled; button.addEventListener('click', handler);
  return button;
}
function openEditor(id = '') {
  inventory.edit(id);
  if (!editorOpen()) $('card-dialog').showModal();
  $('card-game').focus();
}
function render() {
  const state = inventory.state, open = editorOpen();
  // Editor dialog
  for (const field of fields) {
    const input = $('card-' + field);
    if (input.value !== String(state.draft[field])) input.value = state.draft[field];
    input.disabled = state.busy;
  }
  $('card-dialog-title').textContent = t(state.editing ? 'cards_edit_title' : 'cards_add');
  $('cards-save').disabled = !state.ready || state.busy || state.loading;
  $('cards-save').querySelector('.bi').className = `bi ${state.busy ? 'bi-arrow-repeat spin' : 'bi-check-lg'}`;
  $('cards-cancel').disabled = state.busy;
  $('card-dialog-error').textContent = open && state.error ? t(state.error) : '';
  $('cards-existing').hidden = !open || !state.duplicate;
  // Page status: loading, or errors that happened outside the editor (load, delete).
  $('cards-status').textContent = state.loading ? t('cards_loading') : !open && state.error ? t(state.error) : '';
  $('cards-retry').hidden = state.ready || !state.error || state.loading;
  $('cards-add').disabled = !state.ready;
  options('cards-game-filter', 'game'); options('cards-rarity-filter', 'rarity');
  const rows = filterCards(state.records, filters), stats = summarizeCards(rows);
  $('cards-stats').hidden = !state.ready || !state.records.length;
  $('cards-kinds').textContent = number(stats.kinds);
  $('cards-quantity-total').textContent = number(stats.quantity);
  $('cards-by-game').replaceChildren(...chips(stats.games));
  $('cards-by-rarity').replaceChildren(...chips(stats.rarities));
  $('cards-count').hidden = !state.ready;
  $('cards-count').textContent = t('counts', {matching: number(rows.length), loaded: number(state.records.length)});
  $('cards-filters').hidden = !state.ready || !state.records.length;
  $('cards-rows').replaceChildren(...rows.map(row => {
    const tr = document.createElement('tr');
    const cell = (child, className = '') => {const td = node('td', '', className); td.append(child); tr.append(td);};
    cell(node('span', row.game, 'game-tag')); cell(row.card_number, 'mono'); cell(node('span', row.rarity, 'rarity-tag'));
    cell(row.name, 'cards-name'); cell(number(row.quantity), `numeric${row.quantity ? '' : ' muted'}`); cell(row.notes, 'cards-notes');
    const actions = node('div', '', 'row-actions'), locked = state.busy || state.loading;
    actions.append(iconButton('bi-pencil', t('cards_edit'), () => openEditor(row.id), locked),
      iconButton('bi-trash3', t('cards_delete'), () => confirmDelete(row), locked));
    cell(actions, 'action-col');
    return tr;
  }));
  $('cards-table').hidden = !rows.length;
  $('cards-empty').hidden = !state.ready || rows.length > 0;
  $('cards-empty').querySelector('h3').textContent = t(state.records.length ? 'no_matching_results' : 'cards_empty_all');
}
function confirmDelete(row) {
  pendingDelete = row.id;
  $('cards-delete-message').textContent = t('cards_confirm_delete', {name: row.name});
  $('cards-delete-dialog').showModal();
}
for (const field of fields) $('card-' + field).addEventListener('input', event => {
  inventory.state.draft[field] = field === 'quantity' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value;
});
$('cards-form').addEventListener('submit', async event => {
  event.preventDefault();
  await inventory.save();
  if (!inventory.state.error) $('card-dialog').close();
});
$('cards-add').addEventListener('click', () => openEditor());
$('cards-cancel').addEventListener('click', () => $('card-dialog').close());
$('card-dialog-close').addEventListener('click', () => $('card-dialog').close());
// Esc closes the dialog natively; block it while a save is in flight.
$('card-dialog').addEventListener('cancel', event => { if (inventory.state.busy) event.preventDefault(); });
$('card-dialog').addEventListener('close', () => { if (!inventory.state.busy) inventory.edit(); });
$('cards-retry').addEventListener('click', () => inventory.load());
$('cards-existing').addEventListener('click', () => openEditor(inventory.state.duplicate));
$('cards-delete-cancel').addEventListener('click', () => $('cards-delete-dialog').close());
$('cards-delete-confirm').addEventListener('click', () => { $('cards-delete-dialog').close(); if (pendingDelete) inventory.remove(pendingDelete); });
$('cards-delete-dialog').addEventListener('close', () => { pendingDelete = null; });
for (const [id, field] of [['cards-query', 'query'], ['cards-game-filter', 'game'], ['cards-rarity-filter', 'rarity']]) {
  $(id).addEventListener(field === 'query' ? 'input' : 'change', event => {filters[field] = event.target.value; render();});
}
$('language').addEventListener('change', render);
export function clearCards() {
  filters = {query: '', game: '', rarity: ''}; $('cards-query').value = '';
  $('card-dialog').close(); $('cards-delete-dialog').close(); inventory.clear();
}
export function activateCards(api) {clearCards(); inventory.activate(api);}
