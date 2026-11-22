import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePortalUrl } from '../dist/src/portal.js';
import { HISTORY_KEY, loadHistory, saveHistory, removeHistoryItem, clearHistory } from '../dist/src/history.js';

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

