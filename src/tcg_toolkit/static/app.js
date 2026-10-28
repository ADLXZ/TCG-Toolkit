import {t, applyLanguage, setLanguage, getLanguage} from './i18n.js';
import {selectItems, loadResults, priceSteps, sliderIndex, sliderBound} from './logic.js';
import {readHistory, appendHistory, saveHistory} from './history.js';
import {fetchRate, formatPrice} from './currency.js';
const $ = id => document.getElementById(id);
const checked = name => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(el => el.value);
const gameKeys = {"wsr": "wsr", "lycee": "lycee", "chaos": "chaostcg"};
const gameLabel = game => t(gameKeys[game]);
let items = [], limit = 100, controller = null, batch = 0, started = false;
let steps = [], priceMin = null, priceMax = null;
const stockKeys = {"in_stock": "in_stock", "out_of_stock": "out_of_stock", "unknown": "unknown"};
const stockIcons = {in_stock: 'bi-check-circle-fill', out_of_stock: 'bi-x-circle', unknown: 'bi-question-circle'};
let view = localStorage.getItem('view') === 'grid' ? 'grid' : 'list';
const el = (tag, className = '', text = '') => {const node = document.createElement(tag); node.className = className; node.textContent = text; return node;};
const icon = name => el('i', `bi ${name}`);
let displayCurrency = 'JPY', exchangeRate = 1, currencyStatus = null, currencyRequest = 0;
function priceDisplay(item) {
  const price = el('span', 'converted-price');
  price.append(el('span', '', formatPrice(item.price, displayCurrency, exchangeRate, getLanguage())));
  if (displayCurrency !== 'JPY') price.append(el('small', 'original-price', formatPrice(item.price, 'JPY', 1, getLanguage())));
  return price;
}
function renderCurrencyStatus() { $('currency-status').textContent = t('currency_fetched_at', {time: currencyStatus ? new Date(currencyStatus * 1000).toLocaleString(getLanguage()) : '—'}); }
$('currency').addEventListener('change', async () => {
  const target = $('currency').value, request = ++currencyRequest;
  displayCurrency = 'JPY'; exchangeRate = 1;
  currencyStatus = null;
  renderCurrencyStatus(); render();
  try {
    let fetchedAt = null;
    const rate = await fetchRate(target, fetch, value => { fetchedAt = value; });
    if (request !== currencyRequest) return;
    displayCurrency = target; exchangeRate = rate;
    currencyStatus = fetchedAt;
  } catch {
    if (request !== currencyRequest) return;
    $('currency').value = 'JPY'; currencyStatus = null;
  }
  renderCurrencyStatus(); render();
});
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
function rarityBadge(item) {
  if (!item.rarity) return '';
  const badge = el('span', 'rarity-tag', item.rarity); badge.title = t('rarity_value', {rarity: item.rarity});
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
  cell(el('span', 'game-tag', gameLabel(item.game))); cell(rarityBadge(item)); cell(item.card_number, 'mono'); cell(product);
  cell(priceDisplay(item), 'numeric'); cell(stockBadge(item));
  return row;
}
function gridCard(item) {
  const card = el('article', `card ${item.stock_status}`);
  const tags = el('div', 'card-tags'); tags.append(el('span', 'game-tag', gameLabel(item.game)), rarityBadge(item));
  const top = el('div', 'card-top'); top.append(tags, el('span', 'mono', item.card_number));
  const bottom = el('div', 'card-bottom'); bottom.append(priceDisplay(item), stockBadge(item));
  card.append(top, cardImage(item), cardLink(item, 'card-name'), bottom);
  return card;
}
function resetFilters() {
  for (const id of ['text-filter', 'stock', 'rarity']) $(id).value = '';
  priceMin = priceMax = null;
  $('sort').value = 'original';
  document.querySelectorAll('[name="filter-game"]').forEach(el => {el.checked = true;});
  limit = 100;
  render();
}
function syncPriceSlider() {
  steps = priceSteps(items);
  const last = Math.max(steps.length - 1, 0);
  for (const id of ['price-min', 'price-max']) { $(id).max = last; $(id).disabled = steps.length < 2; }
  $('price-min').value = sliderIndex(steps, priceMin, 'min');
  $('price-max').value = sliderIndex(steps, priceMax, 'max');
  updatePriceSlider();
}
function updatePriceSlider() {
  const last = Number($('price-max').max), lo = Number($('price-min').value), hi = Number($('price-max').value);
  const percent = index => last ? index / last * 100 : 0;
  $('price-fill').style.left = `${percent(lo)}%`;
  $('price-fill').style.right = `${100 - (last ? percent(hi) : 100)}%`;
  // Keep the min thumb reachable when both thumbs meet at the right end.
  $('price-min').classList.toggle('on-top', lo > last / 2);
  const format = price => formatPrice(price, displayCurrency, exchangeRate, getLanguage());
  $('price-label').textContent = priceMin === null && priceMax === null ? t('any_price') : `${format(steps[lo])} – ${format(steps[hi])}`;
  $('price-range').classList.toggle('active', priceMin !== null || priceMax !== null);
}
function render() {
  const selectedRarity = $('rarity').value;
  const rarities = [...new Set(items.map(item => item.rarity).filter(Boolean))].sort();
  const options = [new Option(t('all'), ''), ...rarities.map(value => new Option(value, value))];
  if (items.some(item => !item.rarity)) options.push(new Option(t('unknown'), '__unknown__'));
  $('rarity').replaceChildren(...options); $('rarity').value = selectedRarity;
  syncPriceSlider();
  const matches = selectItems(items, {games: checked('filter-game'), stock: $('stock').value, rarity: $('rarity').value,
    min: priceMin, max: priceMax, text: $('text-filter').value, sort: $('sort').value});
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
  $('empty').querySelector('h3').textContent = items.length ? t('no_matching_results')
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
document.querySelectorAll('.filters input:not([type=range]), .filters select').forEach(el => el.addEventListener('input', () => {limit = 100; render();}));
for (const edge of ['min', 'max']) {
  $(`price-${edge}`).addEventListener('input', () => {
    const lo = $('price-min'), hi = $('price-max');
    if (Number(lo.value) > Number(hi.value)) { if (edge === 'min') lo.value = hi.value; else hi.value = lo.value; }
    priceMin = sliderBound(steps, Number(lo.value), 'min');
    priceMax = sliderBound(steps, Number(hi.value), 'max');
    limit = 100; render();
  });
}
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
  setStatus(statusKey, statusIcon); renderErrors(); renderCurrencyStatus(); validateSearch(); render();
}
$('language').addEventListener('change', () => {setLanguage($('language').value); refreshLanguage();});
$('detail-cancel').addEventListener('click', () => $('detail-dialog').close());
$('detail-confirm').addEventListener('click', () => $('detail-dialog').close());
$('detail-dialog').addEventListener('close', () => $('detail-confirm').removeAttribute('href'));
refreshLanguage(); setView(view);
