import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const moduleURL = async name => `data:text/javascript;base64,${Buffer.from(await readFile(new URL('../src/tcg_toolkit/static/'+name, import.meta.url))).toString('base64')}`;
const {createAuthenticatedRequest} = await import(await moduleURL('auth-client.js'));
const {loadResults} = await import(await moduleURL('logic.js'));
const {readHistory, saveHistory} = await import(await moduleURL('history.js'));
test('401 aborts all subsequent search pages', async () => {
  const controller = new AbortController(); let calls = 0, expired = 0;
  const api = createAuthenticatedRequest(() => {expired++; controller.abort();}, async () => {calls++; return {status: 401};});
  await loadResults({games: ['wsr','lycee'], keyword: 'test', signal: controller.signal,
    fetchPage: () => api.fetch('/api/search'), onPage: () => assert.fail('page after expiry'),
    onError: () => assert.fail('error after expiry'), wait: async () => {}});
  assert.equal(calls, 1); assert.equal(expired, 1);
});
test('responses from previous sessions are rejected', async () => {
  let resolve;
  const api = createAuthenticatedRequest(() => assert.fail('old expiry'), () => new Promise(r => {resolve = r;}));
  const pending = api.fetch('/api/search'); api.invalidate(); resolve({status: 200});
  await assert.rejects(pending, {name: 'AbortError'});
});
test('history is isolated and anonymous history remains unassigned', () => {
  const data = new Map(); const storage = {getItem: k => data.get(k), setItem: (k,v) => data.set(k,v)};
  saveHistory(storage, ['legacy']); saveHistory(storage, ['alice'], 'a'); saveHistory(storage, ['bob'], 'b');
  assert.deepEqual(readHistory(storage, 'a'), ['alice']); assert.deepEqual(readHistory(storage, 'b'), ['bob']);
  assert.deepEqual(readHistory(storage, 'c'), []); assert.deepEqual(readHistory(storage), ['legacy']);
});
