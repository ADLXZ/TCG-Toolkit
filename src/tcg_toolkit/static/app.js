import {selectItems, loadResults} from './logic.js';
const $ = id => document.getElementById(id);
const checked = name => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(el => el.value);
const labels = {wsr: 'WSR', lycee: 'Lycee', chaos: 'ChaosTCG'};
let items = [], limit = 100, controller = null, batch = 0, started = false;
const stockLabels = {in_stock: 'In stock', out_of_stock: 'Out of stock', unknown: 'Unknown'};
const stockIcons = {in_stock: 'bi-check-circle-fill', out_of_stock: 'bi-x-circle', unknown: 'bi-question-circle'};
let view = localStorage.getItem('view') === 'grid' ? 'grid' : 'list';
const el = (tag, className = '', text = '') => {const node = document.createElement(tag); node.className = className; node.textContent = text; return node;};
const icon = name => el('i', `bi ${name}`);
function setStatus(text, iconName = '') {
  $('status').replaceChildren(...(iconName ? [icon(iconName)] : []), text);
}
function validateSearch() {
  const message = !$('keyword').value.trim() ? 'Enter a keyword' : !checked('source').length ? 'Select at least one game' : '';
  $('search-button').title = message;
  $('search-button').disabled = Boolean(message);
}
function setView(next) {
  view = next; localStorage.setItem('view', view);
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
  render();
}
function cardLink(item, className = '') {
  const link = el('a', className, item.name);
  const url = new URL(item.product_url, location.origin);
  if (url.protocol === 'https:' && url.hostname === 'yuyu-tei.jp') link.href = url.href;
  link.target = '_blank'; link.rel = 'noopener noreferrer';
  return link;
}
function stockBadge(item) {
  const badge = el('span', `badge ${item.stock_status}`);
  badge.append(icon(stockIcons[item.stock_status]),
    stockLabels[item.stock_status] + (item.stock_quantity === null ? '' : ` (${item.stock_quantity})`));
  return badge;
}
function cardImage(item) {
  const frame = el('span', 'card-image');
  const fallback = el('span', 'image-fallback', 'No image');
  frame.append(fallback);
  if (!item.image_url) return frame;
  let url;
  try { url = new URL(item.image_url); } catch { return frame; }
  if (!['http:', 'https:'].includes(url.protocol)) return frame;
  const image = document.createElement('img');
  image.alt = item.name; image.loading = 'lazy'; image.decoding = 'async';
  image.addEventListener('load', () => { fallback.hidden = true; });
  image.addEventListener('error', () => { image.hidden = true; fallback.hidden = false; }, {once: true});
  image.src = url.href;
  frame.append(image);
  return frame;
}
function tableRow(item) {
  const row = document.createElement('tr');
  const cell = (child, className = '') => {const td = el('td', className); td.append(child); row.append(td);};
  const product = el('div', 'product-summary'); product.append(cardImage(item), cardLink(item));
  cell(el('span', 'game-tag', labels[item.game])); cell(item.card_number, 'mono'); cell(product);
  cell(`¥${item.price.toLocaleString('en-US')}`, 'numeric'); cell(stockBadge(item));
  return row;
}
function gridCard(item) {
  const card = el('article', `card ${item.stock_status}`);
  const top = el('div', 'card-top'); top.append(el('span', 'game-tag', labels[item.game]), el('span', 'mono', item.card_number));
  const bottom = el('div', 'card-bottom'); bottom.append(el('span', 'price', `¥${item.price.toLocaleString('en-US')}`), stockBadge(item));
  card.append(top, cardImage(item), cardLink(item, 'card-name'), bottom);
  return card;
}
function resetFilters() {
  for (const id of ['text-filter', 'stock', 'min', 'max']) $(id).value = '';
  $('sort').value = 'original';
  document.querySelectorAll('[name="filter-game"]').forEach(el => {el.checked = true;});
  limit = 100;
  render();
}
function render() {
  const min = $('min').value === '' ? null : Number($('min').value);
  const max = $('max').value === '' ? null : Number($('max').value);
  const invalid = !$('min').validity.valid || !$('max').validity.valid
    || [min, max].some(n => n !== null && (!Number.isInteger(n) || n < 0))
    || (min !== null && max !== null && min > max);
  $('filter-error').textContent = invalid ? 'Invalid price range' : '';
  const matches = invalid ? [] : selectItems(items, {games: checked('filter-game'), stock: $('stock').value,
    min, max, text: $('text-filter').value, sort: $('sort').value});
  $('counts').textContent = `${matches.length.toLocaleString()} / ${items.length.toLocaleString()}`;
  $('counts').title = `${matches.length.toLocaleString()} matching of ${items.length.toLocaleString()} loaded`;
  const shown = matches.slice(0, limit);
  const fragment = document.createDocumentFragment();
  fragment.append(...shown.map(view === 'grid' ? gridCard : tableRow));
  $('rows').replaceChildren(...(view === 'list' ? [fragment] : []));
  $('grid-view').replaceChildren(...(view === 'grid' ? [fragment] : []));
  $('list-view').hidden = view !== 'list' || !matches.length;
  $('grid-view').hidden = view !== 'grid' || !matches.length;
  $('empty').hidden = matches.length > 0;
  $('empty').querySelector('h3').textContent = invalid ? 'Check the price range' : items.length ? 'No matching results'
    : controller ? 'Searching…' : started ? 'No results found' : 'No results';
  $('more').hidden = matches.length <= limit;
}
function wait(signal) {
  return new Promise(resolve => {
    const done = () => {clearTimeout(timer); signal.removeEventListener('abort', done); resolve();};
    const timer = setTimeout(done, 1000);
    signal.addEventListener('abort', done, {once: true});
    if (signal.aborted) done();
  });
}
$('search-form').addEventListener('submit', async event => {
  event.preventDefault(); validateSearch(); if ($('search-button').disabled) return;
  controller?.abort(); const current = ++batch;
  const active = new AbortController(); controller = active;
  items = []; started = true; resetFilters(); $('errors').replaceChildren();
  setStatus('Searching…', 'bi-arrow-repeat'); $('stop').hidden = false;
  const failed = await loadResults({games: checked('source'), keyword: $('keyword').value.trim(), signal: active.signal,
    fetchPage: async (game, keyword, page, signal) => {
      const response = await fetch(`/api/search?${new URLSearchParams({game, keyword, page})}`, {signal});
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail?.message || 'Unable to search this game.');
      return data;
    },
    onPage: result => {if (current === batch) {items.push(...result.items); render();}},
    onError: (game, error) => {if (current === batch) {const p = el('p'); p.append(icon('bi-exclamation-triangle'), `${labels[game]}: ${error.message}`); $('errors').append(p);}}, wait});
  if (current !== batch) return;
  controller = null; $('stop').hidden = true;
  if (active.signal.aborted) setStatus('Stopped', 'bi-stop-circle'); else if (failed) setStatus('Incomplete', 'bi-exclamation-triangle'); else setStatus('Done', 'bi-check2');
  render();
});
$('stop').addEventListener('click', () => {controller?.abort(); setStatus('Stopped', 'bi-stop-circle'); $('stop').hidden = true;});
$('keyword').addEventListener('input', validateSearch);
document.querySelectorAll('[name="source"]').forEach(el => el.addEventListener('change', validateSearch));
document.querySelectorAll('.filters input, .filters select').forEach(el => el.addEventListener('input', () => {limit = 100; render();}));
$('reset').addEventListener('click', resetFilters);
$('more').addEventListener('click', () => {limit += 100; render();});
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
validateSearch(); setView(view);
