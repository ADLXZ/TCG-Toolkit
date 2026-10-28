import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const data = new Map();
globalThis.localStorage = {getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k)};
const source = (await readFile(new URL('../src/tcg_toolkit/static/api.js', import.meta.url), 'utf8')).replace("import {API_BASE_URL} from './api-config.js';", "const API_BASE_URL = 'https://api.example.com';");
const {apiRequest, setToken, getToken} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('persistent Bearer and API origin apply to every request without cookies', async () => {
  setToken('session-token');
  assert.equal(getToken(), 'session-token');
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.example.com/api/auth/me');
    assert.equal(options.headers.get('Authorization'), 'Bearer session-token');
    assert.equal(options.credentials, 'omit');
    return {status:200};
  };
  await apiRequest('/api/auth/me');
  setToken(null); assert.equal(getToken(), null);
});
