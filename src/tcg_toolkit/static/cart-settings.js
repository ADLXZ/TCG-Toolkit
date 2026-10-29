// User centre: YuYu-Tei session credentials for the cart. Values are written to
// this tab's sessionStorage by the client and never read back into the form.
import {t, getLanguage} from './i18n.js';
import {parseCurlCredentials} from './curl-credentials.js';
const $ = id => document.getElementById(id);

export function bindCartSettings(client, cart) {
  let statusKey = '', parameters = {}, verifying = false;
  function render() {
    let configured = false;
    try { configured = client.hasCredentials(); } catch { /* signed out */ }
    $('cart-settings-state').textContent = t(configured ? 'cart_configured' : 'cart_not_configured');
    $('cart-settings-state').classList.toggle('on', configured);
    $('cart-clear').disabled = !configured || verifying;
    $('cart-save').disabled = verifying;
    $('cart-curl-save').disabled = verifying;
    if (verifying && !cart.state.loading) {
      verifying = false;
      const error = cart.state.error;
      statusKey = error || 'cart_verified';
      parameters = {quantity: (cart.state.totalQuantity ?? 0).toLocaleString(getLanguage())};
      $('cart-curl-save').disabled = false;
      $('cart-save').disabled = false; $('cart-clear').disabled = !configured;
    }
    $('cart-settings-status').textContent = statusKey ? t(statusKey, parameters) : '';
    $('cart-settings-status').classList.toggle('error', Boolean(cart.state.error) && statusKey === cart.state.error);
  }
  $('cart-curl-save').addEventListener('click', () => {
    try {
      const credentials = parseCurlCredentials($('cart-curl').value);
      client.saveCredentials(credentials);
      reset();
      cart.clear({syncCredentials: true});
      statusKey = 'cart_curl_saved';
    } catch (error) {
      statusKey = error.message === 'cart_curl_invalid' ? 'cart_curl_invalid'
        : error.message === 'credential_storage_unavailable' ? 'cart_storage_unavailable' : 'cart_failed';
    }
    render();
  });
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
    $('cart-cookie').value = ''; $('cart-csrf').value = ''; $('cart-curl').value = '';
    verifying = true; statusKey = 'cart_verifying';
    cart.refresh();
  });
  $('cart-clear').addEventListener('click', () => {
    try { client.clearCredentials(); } catch { /* signed out: nothing stored */ }
    reset(); statusKey = 'cart_cleared';
    cart.refresh();
  });
  // Signing out or switching account must not leave the previous status behind.
  function reset() {
    statusKey = ''; verifying = false;
    $('cart-cookie').value = ''; $('cart-csrf').value = ''; $('cart-curl').value = '';
  }
  return {render, reset};
}
