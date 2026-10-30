import {API_BASE_URL} from './api-config.js';
let direct = false;
export const isLocalFrontend = () => !API_BASE_URL;
export function setDirectSearch(value) { direct = !API_BASE_URL && value === true; }
export const TOKEN_KEY = 'tcg.session';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}
export function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (direct) headers.set('X-TCG-Direct', '1');
  return fetch(API_BASE_URL + path, {...options, headers, credentials: 'omit'});
}
