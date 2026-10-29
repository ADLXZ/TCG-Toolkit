// Cart page and the +/− stepper shared with search results. Everything shown is
// what YuYu-Tei last reported; app.js owns the view toggle, prices and links.
import {t, getLanguage} from './i18n.js';
import {cardImage, rarityBadge} from './card-view.js';
import {productKey} from './cart.js';
const $ = id => document.getElementById(id);
const el = (tag, className = '', text = '') => {const node = document.createElement(tag); node.className = className; node.textContent = text; return node;};
const icon = name => el('i', `bi ${name}`);
const number = value => value.toLocaleString(getLanguage());
// Cart rows name games by their shop path; the rest of the UI uses search game keys.
const GAME_KEYS = {lo: 'lycee'}, KNOWN_GAMES = ['wsr', 'lycee', 'chaos', 'ws', 'pm'];
const targetOf = row => ({gid: row.gid, ver: row.ver, cid: row.cid, kizu: row.kizu});

export function cartStepper(cart, target, {quantity, onIncrease, onDecrease, increaseKey = 'cart_increase',
  canIncrease = true, canDecrease = true}) {
  const box = el('div', 'cart-controls'), busy = cart.isBusy(target);
  const pending = busy || (cart.state.loading && !cart.state.rows.length);
  const stepper = el('div', `cart-stepper${quantity ? ' active' : ''}`); stepper.setAttribute('role', 'group');
  stepper.setAttribute('aria-label', t('cart_quantity_label', {quantity}));
  const button = (iconName, key, disabled, action) => {
    const node = el('button', 'cart-step'); node.type = 'button'; node.append(icon(iconName));
    node.setAttribute('aria-label', t(key)); node.title = t(key); node.disabled = disabled;
    node.addEventListener('click', action); return node;
  };
  const count = el('span', 'cart-qty');
  if (busy) count.append(icon('bi-arrow-repeat spin')); else count.textContent = number(quantity);
  stepper.append(button('bi-dash-lg', 'cart_decrease', pending || !quantity || !canDecrease, onDecrease), count,
    button('bi-plus-lg', increaseKey, pending || !canIncrease, onIncrease));
  box.append(stepper);
  const message = cart.message(target);
  if (message) { const note = el('span', 'cart-note'); note.setAttribute('role', 'status'); note.append(icon('bi-exclamation-circle'), t(message)); box.append(note); }
  return box;
}

export function createCartPage({cart, details, amountDisplay, gameLabel, cardLink, currentView}) {
  let pendingRemove = null;
  // Number and rarity come with rows added from search; others are looked up once.
  function info(row) {
    return row.card_number ? {status: 'done', card_number: row.card_number, rarity: row.rarity ?? null}
      : details.get(targetOf(row));
  }
  function item(row) {
    const known = info(row), rarity = known.rarity ?? null;
    // Cart names read "<rarity> <name>"; the rarity is shown as its own badge.
    const name = rarity && row.name.startsWith(rarity + ' ') ? row.name.slice(rarity.length + 1) : row.name;
    return {...row, name, rarity, card_number: known.card_number ?? '', game: GAME_KEYS[row.game] ?? row.game, price: row.unit_price};
  }
  function tags(row, {withRarity = false} = {}) {
    const box = el('div', 'card-tags'), shown = item(row);
    box.append(el('span', 'game-tag', KNOWN_GAMES.includes(shown.game) ? gameLabel(shown.game) : shown.game));
    if (withRarity) box.append(rarityBadge(shown));
    if (row.type === 'reserved') box.append(el('span', 'cart-tag', t('cart_reserved')));
    if (row.kizu) box.append(el('span', 'cart-tag', t('cart_damaged')));
    return box;
  }
  function cardNumber(row) {
    const known = info(row);
    if (known.status === 'done') return el('span', 'mono', known.card_number);
    const pending = el('span', 'mono muted');
    if (known.status === 'loading') { pending.append(icon('bi-arrow-repeat spin')); pending.title = t('cart_details_loading'); }
    else { pending.textContent = '—'; pending.title = t('cart_details_failed'); }
    return pending;
  }
  function stepper(row) {
    const target = targetOf(row);
    // Lowering re-reads the row's removal control, so rows without one stay read-only.
    return cartStepper(cart, target, {quantity: row.quantity, canDecrease: row.removable,
      onDecrease: () => cart.decrease(target, row.type), onIncrease: () => cart.increase(target, row)});
  }
  function removeButton(row) {
    const button = el('button', 'icon-button row-action'); button.type = 'button';
    button.append(icon('bi-trash3'));
    button.setAttribute('aria-label', t('cart_remove')); button.title = t(row.removable ? 'cart_remove' : 'cart_not_removable');
    button.disabled = !row.removable || cart.isBusy(targetOf(row));
    button.addEventListener('click', () => {
      pendingRemove = row;
      $('cart-remove-message').textContent = t('cart_confirm_remove', {name: item(row).name, quantity: number(row.quantity)});
      $('cart-remove-dialog').showModal();
    });
    return button;
  }
  function tableRow(row) {
    const tr = document.createElement('tr');
    const cell = (child, className = '') => {const td = el('td', className); td.append(child); tr.append(td);};
    const shown = item(row), product = el('div', 'product-summary'); product.append(cardImage(shown), cardLink(shown));
    cell(tags(row)); cell(rarityBadge(shown)); cell(cardNumber(row)); cell(product);
    cell(amountDisplay(row.unit_price), 'numeric'); cell(stepper(row), 'cart-col');
    cell(amountDisplay(row.unit_price * row.quantity), 'numeric cart-line-total'); cell(removeButton(row), 'action-col');
    return tr;
  }
  function gridCard(row) {
    const card = el('article', 'card');
    const top = el('div', 'card-top'); top.append(tags(row, {withRarity: true}), cardNumber(row));
    const bottom = el('div', 'card-bottom');
    const total = el('span', 'cart-line-total'); total.append(el('span', 'cart-line-label', t('cart_line_subtotal')), amountDisplay(row.unit_price * row.quantity));
    bottom.append(amountDisplay(row.unit_price), total);
    const actions = el('div', 'card-cart'); actions.append(stepper(row), removeButton(row));
    const shown = item(row);
    card.append(top, cardImage(shown), cardLink(shown, 'card-name'), bottom, actions);
    return card;
  }
  function emptyState(state) {
    const link = (key, href) => { const a = el('a', 'cart-empty-link', t(key)); a.href = href; return a; };
    if (!state.configured) return [t('cart_need_credentials'), link('cart_go_setup', '#account')];
    if (state.loading) return [t('cart_loading')];
    if (state.error) return [t(state.error)];
    if (!state.complete) return [t('cart_summary_incomplete')];
    return [t('cart_empty'), link('cart_go_search', '#search')];
  }
  function render() {
    const state = cart.state, rows = state.rows, view = currentView();
    const has = rows.length > 0;
    $('cart-stats').hidden = !state.configured || (!has && !state.complete);
    $('cart-kinds').textContent = number(rows.length);
    $('cart-quantity-total').textContent = state.totalQuantity === null ? '—' : number(state.totalQuantity);
    $('cart-subtotal').replaceChildren(state.subtotal === null ? '—' : amountDisplay(state.subtotal));
    $('cart-count').hidden = !has; $('cart-count').textContent = number(rows.length);
    $('cart-status').textContent = state.loading && has ? t('cart_loading') : state.error && has ? t(state.error) : '';
    $('cart-warning').hidden = state.complete;
    $('cart-page-refresh').disabled = !state.configured || state.loading;
    $('cart-page-refresh').querySelector('.bi').classList.toggle('spin', state.loading);
    $('cart-rows').replaceChildren(...(view === 'list' ? rows.map(tableRow) : []));
    $('cart-grid').replaceChildren(...(view === 'grid' ? rows.map(gridCard) : []));
    $('cart-table').hidden = view !== 'list' || !has;
    $('cart-grid').hidden = view !== 'grid' || !has;
    $('cart-empty').hidden = has;
    if (!has) {
      const [message, action] = emptyState(state);
      $('cart-empty').querySelector('h3').textContent = message;
      $('cart-empty-action').replaceChildren(...(action ? [action] : []));
    }
    if (pendingRemove && !rows.some(row => productKey(row) === productKey(pendingRemove) && row.type === pendingRemove.type))
      $('cart-remove-dialog').close();
  }
  $('cart-page-refresh').addEventListener('click', () => { details.retryFailed(); cart.refresh(); });
  $('cart-remove-cancel').addEventListener('click', () => $('cart-remove-dialog').close());
  $('cart-remove-confirm').addEventListener('click', () => {
    const row = pendingRemove; $('cart-remove-dialog').close();
    if (row) cart.remove(targetOf(row), row.type);
  });
  $('cart-remove-dialog').addEventListener('close', () => { pendingRemove = null; });
  return {render, close: () => $('cart-remove-dialog').close()};
}
