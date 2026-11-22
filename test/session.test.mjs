import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, loadSession, saveSession, clearSession, validateState, SESSION_KEY } from '../dist/src/session.js';
import { PRESETS, DEVICES } from '../dist/src/data.js';
const mockStorage = () => { const data = new Map(); return { getItem:k => data.get(k) ?? null, setItem:(k,v) => data.set(k,v), removeItem:k => data.delete(k) }; };
test('Survey and result survive a refresh in the same tab', () => {
  const storage = mockStorage();
  const state = { ...freshState(), view:'survey', answers:{ identity:'unknown' }, questionIndex:1 };
  assert.equal(saveSession(storage,state),true);
  assert.deepEqual(loadSession(storage),state);
  const preset = PRESETS[0];
  const result = { ...freshState(), view:'assistant', context:preset.context, answers:preset.answers, baselineAnswers:{ ...preset.answers }, skipped:['updates'], activeAction:'autojoin', preset:preset.id };
  saveSession(storage,result);
  assert.deepEqual(loadSession(storage),result);
  for (const device of DEVICES) {
    const deviceState = { ...result, context:{ ...result.context, device:device.id } };
    saveSession(storage,deviceState);
    assert.deepEqual(loadSession(storage),deviceState);
  }
  clearSession(storage);
  assert.deepEqual(loadSession(storage),freshState());
});
test('Blocked storage, invalid JSON and obsolete model versions fall back safely', () => {
  const blocked = { getItem(){throw Error('blocked');}, setItem(){throw Error('blocked');}, removeItem(){throw Error('blocked');} };
  assert.deepEqual(loadSession(blocked),freshState());
  assert.equal(saveSession(blocked,freshState()),false);
  assert.equal(clearSession(blocked),false);
  const storage = mockStorage();
  for (const value of ['{broken',JSON.stringify({ ...freshState(),version:0 }),JSON.stringify({ ...freshState(),view:'result' })]) {
    storage.setItem(SESSION_KEY,value); assert.deepEqual(loadSession(storage),freshState());
  }
});
test('Tampered state cannot inject markup, invent values or expose an incomplete result', () => {
  const state = freshState();
  const invalid = [
    { ...state,context:{ ...state.context,place:'<img onerror=alert(1)>' } },
    { ...state,answers:{ identity:'<script>' } },
    { ...state,answers:{ extra:'data' } },
    { ...state,questionIndex:-1 }, { ...state,questionIndex:8 },
    { ...state,view:'result' }, { ...state,activeAction:'invented' },
    { ...state,skipped:['invented'] }, { ...state,preset:'invented' },
  ];
  for (const value of invalid) assert.equal(validateState(value),null);
  assert.deepEqual(validateState({ ...state,unexpected:'discard this' }),state);
});
