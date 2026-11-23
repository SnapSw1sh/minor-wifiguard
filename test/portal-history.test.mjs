import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePortalUrl } from '../dist/src/portal.js';
import { HISTORY_KEY, loadHistory, saveHistory, removeHistoryItem, clearHistory } from '../dist/src/history.js';
import { checkServerAvailability, readNetworkInformation } from '../dist/src/connection.js';

class MemoryStorage {
  #data = new Map();
  getItem(key) { return this.#data.get(key) ?? null; }
  setItem(key, value) { this.#data.set(key, String(value)); }
  removeItem(key) { this.#data.delete(key); }
}

test('portal URL analysis handles protocols and malformed URLs', () => {
  assert.equal(analyzePortalUrl('https://login.example.test/connect').valid, true);
  assert.equal(analyzePortalUrl('http://login.example.test/connect').checks.find(c => c.id === 'protocol').tone, 'note');
  assert.equal(analyzePortalUrl('ftp://example.test').valid, false);
  assert.equal(analyzePortalUrl('not a URL').valid, false);
});

test('portal analysis identifies misleading @ host, IP and unusual port', () => {
  const result = analyzePortalUrl('http://login.example@evil.test:8080/login');
  assert.equal(result.hostname, 'evil.test');
  assert.equal(result.checks.find(c => c.id === 'at').tone, 'warning');
  assert.equal(result.checks.find(c => c.id === 'ip').tone, 'good');
  assert.equal(result.checks.find(c => c.id === 'port').tone, 'warning');
  const ip = analyzePortalUrl('https://192.0.2.10/login');
  assert.equal(ip.checks.find(c => c.id === 'ip').tone, 'warning');
});

test('official domain matches itself and real subdomains only', () => {
  assert.equal(analyzePortalUrl('https://login.example.test', 'example.test').official.match, true);
  assert.equal(analyzePortalUrl('https://example.test.evil.test', 'example.test').official.match, false);
  assert.equal(analyzePortalUrl('https://evil.test', 'example.test').official.match, false);
});

test('IDN and punycode are reported without declaring a threat', () => {
  const result = analyzePortalUrl('https://xn--e1afmkfd.xn--p1ai');
  const check = result.checks.find(c => c.id === 'idn');
  assert.equal(check.tone, 'note');
  assert.match(check.text, /не обязательно/);
});

test('history stores at most ten validated assessment results and supports deletion', () => {
  const storage = new MemoryStorage();
  const base = { date: new Date().toISOString(), place: 'Кафе', device: 'Android', purpose: 'Сайты и видео', score: 10, levelId: 'low', levelLabel: 'Низкий риск' };
  for (let i = 0; i < 12; i++) saveHistory(storage, { ...base, id: String(i) });
  assert.equal(loadHistory(storage).length, 10);
  assert.equal(loadHistory(storage)[0].id, '11');
  storage.setItem(HISTORY_KEY, JSON.stringify([{ id: 'bad', score: 999 }]));
  assert.deepEqual(loadHistory(storage), []);
  saveHistory(storage, { ...base, id: 'ok' });
  removeHistoryItem(storage, 'ok');
  assert.deepEqual(loadHistory(storage), []);
  saveHistory(storage, { ...base, id: 'ok' });
  clearHistory(storage);
  assert.deepEqual(loadHistory(storage), []);
});

test('connection data uses Network Information API when available and explains unavailable data', () => {
  const available = readNetworkInformation({ connection: { type: 'wifi', effectiveType: '4g', downlink: 12.5, rtt: 40, saveData: false } });
  assert.equal(available.find(item => item.id === 'type').value, 'wifi');
  assert.equal(available.find(item => item.id === 'rtt').source, 'Определено автоматически');
  const unavailable = readNetworkInformation({});
  assert.equal(unavailable.every(item => item.value === 'Браузер не предоставляет эти данные'), true);
});

test('connection check measures same-origin server availability and handles failure', async () => {
  let now = 100;
  const ok = await checkServerAvailability(async (url, options) => { assert.equal(url, '/health'); assert.equal(options.credentials, 'same-origin'); now = 137; return { ok: true, status: 200 }; }, { now: () => now });
  assert.deepEqual(ok, { available: true, status: 200, latencyMs: 37, source: 'Определено автоматически', error: '' });
  const failed = await checkServerAvailability(async () => { throw new Error('offline'); }, { now: () => 1 });
  assert.equal(failed.available, false);
  assert.equal(failed.latencyMs, null);
});

