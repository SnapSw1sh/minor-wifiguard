import { PLACES, DEVICES, PURPOSES, QUESTIONS, PRESETS, MODEL_VERSION } from './data.js';
export const SESSION_KEY = 'wifiguard.session.v1';
export function freshState() {
  return { version: MODEL_VERSION, view: 'home', context: { place: 'cafe', device: 'android', purpose: 'browse' }, answers: {}, baselineAnswers: null, questionIndex: 0, activeAction: null, skipped: [], preset: null };
}
function validAnswers(value, complete = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Object.keys(value).some(k => !QUESTIONS.some(q => q.id === k))) return false;
  return QUESTIONS.every(q => !Object.hasOwn(value, q.id) ? !complete : q.options.some(o => o.id === value[q.id]));
}
export function validateState(value) {
  if (!value || value.version !== MODEL_VERSION || !['home', 'survey', 'result', 'assistant', 'ended', 'portal', 'history'].includes(value.view)) return null;
  const c = value.context;
  if (!c || !PLACES.some(p => p.id === c.place) || !DEVICES.some(d => d.id === c.device) || !PURPOSES.some(p => p.id === c.purpose)) return null;
  if (!validAnswers(value.answers) || (value.baselineAnswers !== null && !validAnswers(value.baselineAnswers, true))) return null;
  if (['result', 'assistant', 'ended'].includes(value.view) && (!validAnswers(value.answers, true) || !value.baselineAnswers)) return null;
  if (!Number.isInteger(value.questionIndex) || value.questionIndex < 0 || value.questionIndex >= QUESTIONS.length) return null;
  const validId = id => QUESTIONS.some(q => q.id === id);
  if (value.activeAction !== null && !validId(value.activeAction)) return null;
  if (!Array.isArray(value.skipped) || value.skipped.some(id => !validId(id))) return null;
  if (value.preset !== null && !PRESETS.some(p => p.id === value.preset)) return null;
  return { version: MODEL_VERSION, view: value.view, context: { place: c.place, device: c.device, purpose: c.purpose }, answers: { ...value.answers }, baselineAnswers: value.baselineAnswers ? { ...value.baselineAnswers } : null, questionIndex: value.questionIndex, activeAction: value.activeAction, skipped: [...new Set(value.skipped)], preset: value.preset };
}
export function loadSession(storage) {
  try { const value = storage?.getItem(SESSION_KEY); return value ? validateState(JSON.parse(value)) ?? freshState() : freshState(); }
  catch { return freshState(); }
}
export function saveSession(storage, state) {
  try { storage.setItem(SESSION_KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}
export function clearSession(storage) {
  try { storage.removeItem(SESSION_KEY); return true; }
  catch { return false; }
}
