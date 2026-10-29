// User centre: YuYu-Tei session credentials for the cart. Values are written to
// this tab's sessionStorage by the client and never read back into the form.
import {t, getLanguage} from './i18n.js';
const $ = id => document.getElementById(id);

export function bindCartSettings(client, cart) {
  let statusKey = '', parameters = {}, verifying = false;
  function render() {
    const configured = cart.state.configured;
    $('cart-settings-state').textContent = t(configured ? 'cart_configured' : 'cart_not_configured');
    $('cart-settings-state').classList.toggle('on', configured);
    $('cart-clear').disabled = !configured || verifying;
    $('cart-save').disabled = verifying;
    if (verifying && !cart.state.loading) {
      verifying = false;
      const error = cart.state.error;
      statusKey = error || 'cart_verified';
      parameters = {quantity: (cart.state.totalQuantity ?? 0).toLocaleString(getLanguage())};
      $('cart-save').disabled = false; $('cart-clear').disabled = !configured;
    }
    $('cart-settings-status').textContent = statusKey ? t(statusKey, parameters) : '';
    $('cart-settings-status').classList.toggle('error', Boolean(cart.state.error) && statusKey === cart.state.error);
  }
  $('cart-settings-form').addEventListener('submit', event => {
    event.preventDefault();
    const cookie = $('cart-cookie').value.trim(), csrf = $('cart-csrf').value.trim();
    if (!cookie || !csrf) { statusKey = 'cart_invalid_input'; render(); return; }
    try {
      client.saveCredentials({cookie, csrf_token: csrf});
    } catch (error) {
      statusKey = error.message === 'credential_storage_unavailable' ? 'cart_storage_unavailable' : 'cart_failed';
      render(); return;
    }
    $('cart-cookie').value = ''; $('cart-csrf').value = '';
    verifying = true; statusKey = 'cart_verifying';
    cart.refresh();
  });
  $('cart-clear').addEventListener('click', () => {
    try { client.clearCredentials(); } catch { /* signed out: nothing stored */ }
    verifying = false; statusKey = 'cart_cleared';
    cart.refresh();
  });
  // Signing out or switching account must not leave the previous status behind.
  function reset() {
    statusKey = ''; verifying = false;
    $('cart-cookie').value = ''; $('cart-csrf').value = '';
  }
  return {render, reset};
}
