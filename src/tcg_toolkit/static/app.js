import {t, applyLanguage, setLanguage, getLanguage} from './i18n.js';
import {selectItems, loadResults} from './logic.js';
import {readHistory, appendHistory, saveHistory} from './history.js';
const $ = id => document.getElementById(id);
const checked = name => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(el => el.value);
const gameKeys = {"wsr": "wsr", "lycee": "lycee", "chaos": "chaostcg"};
const gameLabel = game => t(gameKeys[game]);
let items = [], limit = 100, controller = null, batch = 0, started = false;
const stockKeys = {"in_stock": "in_stock", "out_of_stock": "out_of_stock", "unknown": "unknown"};
const stockIcons = {in_stock: 'bi-check-circle-fill', out_of_stock: 'bi-x-circle', unknown: 'bi-question-circle'};
let view = localStorage.getItem('view') === 'grid' ? 'grid' : 'list';
const el = (tag, className = '', text = '') => {const node = document.createElement(tag); node.className = className; node.textContent = text; return node;};
const icon = name => el('i', `bi ${name}`);
let history = readHistory(localStorage);
function closeHistory() { $('search-history').hidden = true; $('keyword').setAttribute('aria-expanded', 'false'); }
function showHistory() {
  const list = $('history-items');
  list.replaceChildren(...[...history].reverse().map(keyword => {
    const row = el('div', 'history-row');
    const button = el('button', 'history-item'); button.type = 'button'; button.title = keyword;
    button.append(icon('bi-clock-history'), el('span', 'history-text', keyword));
    button.addEventListener('click', () => { $('keyword').value = keyword; $('keyword').focus(); closeHistory(); validateSearch(); });
    const remove = el('button', 'history-delete'); remove.type = 'button';
    remove.append(icon('bi-x-lg'));
    remove.title = t('history_delete', {keyword});
    remove.setAttribute('aria-label', remove.title);
    remove.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      history = history.filter(value => value !== keyword);
      saveHistory(localStorage, history);
      $('keyword').focus(); showHistory();
    });
    row.append(button, remove);
    return row;
  }));
  $('history-empty').hidden = history.length > 0;
  $('history-clear').disabled = history.length === 0;
  $('search-history').hidden = false; $('keyword').setAttribute('aria-expanded', 'true');
}
$('keyword').addEventListener('focus', showHistory);
$('history-clear').addEventListener('click', () => {
  history = []; saveHistory(localStorage, history);
  $('keyword').focus(); showHistory();
});
$('keyword').addEventListener('click', showHistory);
$('keyword').addEventListener('keydown', event => {
  if (event.key === 'ArrowDown') {event.preventDefault(); showHistory(); $('history-items').querySelector('button')?.focus();}
  if (event.key === 'Escape') closeHistory();
});
$('search-history').addEventListener('keydown', event => {
  const buttons = [...$('history-items').querySelectorAll('button')];
  const index = buttons.indexOf(document.activeElement);
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
  }
  if (event.key === 'Escape') { $('keyword').focus(); closeHistory(); }
});
document.addEventListener('pointerdown', event => {if (!event.target.closest('#keyword-wrapper')) closeHistory();});
$('keyword-wrapper').addEventListener('focusout', event => {if (!$('keyword-wrapper').contains(event.relatedTarget)) closeHistory();});
let statusKey = '', statusIcon = '', errors = [];
function setStatus(key, iconName = '') {
  statusKey = key; statusIcon = iconName;
  const text = key ? t(key) : '';
  $('status').replaceChildren(...(iconName ? [icon(iconName)] : []), text);
}
function validateSearch() {
  const message = !$('keyword').value.trim() ? t('enter_a_keyword') : !checked('source').length ? t('select_at_least_one_game') : '';
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
  const confirm = event => {
    event.preventDefault();
    if (!link.hasAttribute('href')) return;
    $('detail-name').textContent = item.name;
    $('detail-url').textContent = link.href;
    $('detail-confirm').href = link.href;
    $('detail-dialog').showModal();
  };
  link.addEventListener('click', confirm);
  link.addEventListener('auxclick', event => {if (event.button === 1) confirm(event);});
  return link;
}
function stockBadge(item) {
  const badge = el('span', `badge ${item.stock_status}`);
  badge.append(icon(stockIcons[item.stock_status]),
    t(stockKeys[item.stock_status]) + (item.stock_quantity === null ? '' : ` (${item.stock_quantity})`));
  return badge;
}
function cardImage(item) {
  const frame = el('span', 'card-image');
  const fallback = el('span', 'image-fallback', t('no_image'));
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
  cell(el('span', 'game-tag', gameLabel(item.game))); cell(item.card_number, 'mono'); cell(product);
  cell(`¥${item.price.toLocaleString('en-US')}`, 'numeric'); cell(stockBadge(item));
  return row;
}
function gridCard(item) {
  const card = el('article', `card ${item.stock_status}`);
  const top = el('div', 'card-top'); top.append(el('span', 'game-tag', gameLabel(item.game)), el('span', 'mono', item.card_number));
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
  $('filter-error').textContent = invalid ? t('invalid_price_range') : '';
  const matches = invalid ? [] : selectItems(items, {games: checked('filter-game'), stock: $('stock').value,
    min, max, text: $('text-filter').value, sort: $('sort').value});
  $('counts').textContent = t('counts', {matching: matches.length.toLocaleString(getLanguage()), loaded: items.length.toLocaleString(getLanguage())});
  $('counts').title = t('counts_hint', {matching: matches.length.toLocaleString(getLanguage()), loaded: items.length.toLocaleString(getLanguage())});
  const shown = matches.slice(0, limit);
  const fragment = document.createDocumentFragment();
  fragment.append(...shown.map(view === 'grid' ? gridCard : tableRow));
  $('rows').replaceChildren(...(view === 'list' ? [fragment] : []));
  $('grid-view').replaceChildren(...(view === 'grid' ? [fragment] : []));
  $('list-view').hidden = view !== 'list' || !matches.length;
  $('grid-view').hidden = view !== 'grid' || !matches.length;
  $('empty').hidden = matches.length > 0;
  $('empty').querySelector('h3').textContent = invalid ? t('check_the_price_range') : items.length ? t('no_matching_results')
    : controller ? t('searching') : started ? t('no_results_found') : t('no_results');
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
  history = appendHistory(history, $('keyword').value); saveHistory(localStorage, history); closeHistory();
  controller?.abort(); const current = ++batch;
  const active = new AbortController(); controller = active;
  items = []; started = true; resetFilters(); errors = []; renderErrors();
  setStatus('searching', 'bi-arrow-repeat'); $('stop').hidden = false;
  const failed = await loadResults({games: checked('source'), keyword: $('keyword').value.trim(), signal: active.signal,
    fetchPage: async (game, keyword, page, signal) => {
      const response = await fetch(`/api/search?${new URLSearchParams({game, keyword, page})}`, {signal});
      const data = await response.json();
      if (!response.ok) {
        const key = response.status === 504 ? 'the_source_timed_out' : response.status === 422 ? 'invalid_search_parameters' : ['SearchParseError', 'SearchPaginationError'].includes(data.detail?.type) ? 'could_not_read_the_source_results' : 'could_not_retrieve_results_from_the_source';
        const error = new Error(); error.translationKey = key; throw error;
      }
      return data;
    },
    onPage: result => {if (current === batch) {items.push(...result.items); render();}},
    onError: (game, error) => {if (current === batch) {errors.push({game, key: error.translationKey || 'unable_to_search_this_game'}); renderErrors();}}, wait});
  if (current !== batch) return;
  controller = null; $('stop').hidden = true;
  if (active.signal.aborted) setStatus('stopped', 'bi-stop-circle'); else if (failed) setStatus('incomplete', 'bi-exclamation-triangle'); else setStatus('done', 'bi-check2');
  render();
});
$('stop').addEventListener('click', () => {controller?.abort(); setStatus('stopped', 'bi-stop-circle'); $('stop').hidden = true;});
$('keyword').addEventListener('input', validateSearch);
document.querySelectorAll('[name="source"]').forEach(el => el.addEventListener('change', validateSearch));
document.querySelectorAll('.filters input, .filters select').forEach(el => el.addEventListener('input', () => {limit = 100; render();}));
$('reset').addEventListener('click', resetFilters);
$('more').addEventListener('click', () => {limit += 100; render();});
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
function renderErrors() {
  $('errors').replaceChildren(...errors.map(({game, key}) => {
    const p = el('p'); p.append(icon('bi-exclamation-triangle'), t('game_error', {game: gameLabel(game), message: t(key)})); return p;
  }));
}
function refreshLanguage() {
  applyLanguage(document); $('language').value = getLanguage();
  setStatus(statusKey, statusIcon); renderErrors(); validateSearch(); render();
}
$('language').addEventListener('change', () => {setLanguage($('language').value); refreshLanguage();});
$('detail-cancel').addEventListener('click', () => $('detail-dialog').close());
$('detail-confirm').addEventListener('click', () => $('detail-dialog').close());
$('detail-dialog').addEventListener('close', () => $('detail-confirm').removeAttribute('href'));
refreshLanguage(); setView(view);
