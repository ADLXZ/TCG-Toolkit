import {apiRequest, getToken, setToken, TOKEN_KEY} from './api.js';
import {t, applyLanguage, setLanguage, getLanguage} from './i18n.js';
import {createAuthenticatedRequest} from './auth-client.js';
import {yuyuteiClient} from './yuyutei-client.js';
import {bindNavMenus, syncNavMenus} from './nav-menu.js';
const $ = id => document.getElementById(id);
let user = null, searchApp = null, registering = false, errorKey = '';
const api = createAuthenticatedRequest(() => signedOut('auth_expired'), apiRequest);
function showPage() {
  const cards = Boolean(user) && location.hash === '#cards';
  $('cards-panel').hidden = !cards;
  const favorites = Boolean(user) && location.hash === '#favorites';
  const cart = Boolean(user) && location.hash === '#cart';
  $('cart-panel').hidden = !cart;
  $('favorites-panel').hidden = !favorites;
  const account = Boolean(user) && location.hash === '#account';
  document.body.classList.toggle('signed-out', !user);
  $('auth-panel').hidden = Boolean(user);
  $('search').hidden = !user || account || favorites || cards || cart;
  $('account-panel').hidden = !account;
  $('user-bar').hidden = !user;
  $('app-nav').hidden = !user;
  $('app-settings').hidden = !user;
  document.querySelectorAll('#app-nav a, #account-link').forEach(a => {
    if (a.hash === (cards ? '#cards' : cart ? '#cart' : account ? '#account' : favorites ? '#favorites' : '#search')) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  syncNavMenus();
}
function refresh() {
  applyLanguage(document);
  syncNavMenus();  // page names in the dropdown toggles follow the language
  $('auth-language').value = getLanguage();
  $('auth-heading').textContent = t(registering ? 'auth_register' : 'auth_login');
  $('auth-submit').textContent = t(registering ? 'auth_register' : 'auth_login');
  $('auth-switch').textContent = t(registering ? 'auth_have_account' : 'auth_need_account');
  $('auth-confirm-field').hidden = !registering;
  $('auth-confirm-password').required = registering;
  $('auth-confirm-password').type = $('auth-password').type;
  updateConfirmState();
  $('auth-password').autocomplete = registering ? 'new-password' : 'current-password';
  $('auth-rules').hidden = !registering;
  const visible = $('auth-password').type === 'text';
  $('password-toggle').setAttribute('aria-pressed', String(visible));
  $('password-toggle').setAttribute('aria-label', t(visible ? 'auth_hide_password' : 'auth_show_password'));
  $('password-toggle').title = $('password-toggle').getAttribute('aria-label');
  $('password-toggle').firstElementChild.className = `bi ${visible ? 'bi-eye-slash' : 'bi-eye'}`;
  $('auth-error').textContent = errorKey ? t(errorKey) : '';
  if (user) $('account-created').textContent = new Date(user.created_at * 1000).toLocaleDateString(getLanguage(), {dateStyle: 'long'});
}
function updateConfirmState() {
  const value = $('auth-confirm-password').value;
  const match = value === $('auth-password').value;
  $('confirm-state').className = `confirm-state bi ${!value ? '' : match ? 'bi-check-circle-fill match' : 'bi-x-circle mismatch'}`;
  if (value && !match) $('auth-confirm-password').setAttribute('aria-invalid', 'true');
  else $('auth-confirm-password').removeAttribute('aria-invalid');
}
function setAvatar(name) {
  for (const id of ['user-avatar', 'account-avatar']) $(id).textContent = name.slice(0, 1).toUpperCase();
}
function signedOut(message = '', clearToken = true) {
  yuyuteiClient.deactivate({clear: clearToken});
  if (clearToken) setToken(null);
  api.invalidate(); searchApp?.clearUser(); user = null;
  registering = false; $('account-status').textContent = '';
  $('current-username').textContent = ''; $('account-username').textContent = ''; $('account-created').textContent = ''; setAvatar('');
  $('auth-password').value = ''; $('auth-confirm-password').value = ''; $('auth-password').type = 'password'; errorKey = message;
  location.hash = '#login'; showPage(); refresh();
}
async function signedIn(value) {
  const expectedToken = getToken();
  api.invalidate();
  searchApp ??= await import('./app.js');
  if (getToken() !== expectedToken) return;
  // The cart client must know the account before the search app reads its cart.
  user = value; yuyuteiClient.activateUser(user.id, api.fetch);
  searchApp.activateUser(user.id, api.fetch);
  $('account-status').textContent = '';
  $('current-username').textContent = user.username;
  $('account-username').textContent = user.username; setAvatar(user.username);
  $('auth-password').value = ''; $('auth-confirm-password').value = ''; $('auth-password').type = 'password'; errorKey = '';
  if (!['#account', '#favorites', '#cards', '#cart'].includes(location.hash)) location.hash = '#search';
  showPage(); refresh();
}
function responseError(status) {
  return ({401: 'auth_invalid', 409: 'auth_taken', 422: 'auth_validation',
    429: 'auth_limited', 403: 'auth_origin'})[status] || 'auth_unavailable';
}
$('auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (registering && $('auth-password').value !== $('auth-confirm-password').value) { errorKey = 'auth_password_mismatch'; refresh(); return; }
  $('auth-submit').disabled = true; $('auth-switch').disabled = true;
  errorKey = ''; refresh();
  try {
    const response = await apiRequest(`/api/auth/${registering ? 'register' : 'login'}`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username: $('auth-username').value, password: $('auth-password').value, ...(registering ? {confirm_password: $('auth-confirm-password').value} : {})})
    });
    if (!response.ok) {errorKey = responseError(response.status); refresh(); return;}
    const result = await response.json(); setToken(result.token); await signedIn(result.user);
  } catch { errorKey = 'auth_unavailable'; refresh(); }
  finally { $('auth-submit').disabled = false; $('auth-switch').disabled = false; }
});
$('password-toggle').addEventListener('click', () => {
  $('auth-password').type = $('auth-password').type === 'password' ? 'text' : 'password'; refresh();
});
for (const id of ['auth-password', 'auth-confirm-password']) $(id).addEventListener('input', updateConfirmState);
$('auth-switch').addEventListener('click', () => {
  registering = !registering; errorKey = ''; $('auth-password').value = ''; $('auth-confirm-password').value = ''; refresh();
});
$('logout').addEventListener('click', async () => {
  yuyuteiClient.clearCredentials();
  $('logout').disabled = true;
  api.invalidate(); searchApp?.clearUser();
  try {
    const response = await apiRequest('/api/auth/logout', {method: 'POST',
      headers: {'Content-Type': 'application/json'}, body: '{}'});
    if (!response.ok) throw new Error('logout');
    signedOut();
  } catch { $('account-status').textContent = t('auth_logout_failed'); }
  finally { $('logout').disabled = false; }
});
$('auth-language').addEventListener('change', () => {setLanguage($('auth-language').value); refresh();});
$('language').addEventListener('change', () => {setLanguage($('language').value); refresh();});
window.addEventListener('hashchange', showPage);
bindNavMenus();
refresh(); showPage();
let restoreGeneration = 0;
async function restoreSession() {
  const generation = ++restoreGeneration;
  const token = getToken();
  const destination = location.hash;
  signedOut('', false);
  if (!token) { yuyuteiClient.deactivate(); $('auth-submit').disabled = false; return; }
  $('auth-submit').disabled = true;
  try {
    const response = await apiRequest('/api/auth/me', {cache: 'no-store'});
    const value = response.ok ? await response.json() : null;
    if (generation !== restoreGeneration || token !== getToken()) return;
    if (response.ok) { location.hash = destination; await signedIn(value); }
    else if (response.status === 401) signedOut();
    else {errorKey = 'auth_unavailable'; refresh();}
  } catch {if (generation === restoreGeneration) {errorKey = 'auth_unavailable'; refresh();}}
  finally {if (generation === restoreGeneration) $('auth-submit').disabled = false;}
}
window.addEventListener('storage', event => {
  if (event.key === TOKEN_KEY || event.key === null) {
    yuyuteiClient.deactivate();
    restoreSession();
  }
});
await restoreSession();
