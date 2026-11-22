export const HISTORY_KEY = 'wifiguard.history.v1';
const MAX_ITEMS = 10;

function validItem(item) {
  return item && typeof item === 'object' && typeof item.id === 'string' && typeof item.date === 'string' && Number.isFinite(Date.parse(item.date)) && Number.isFinite(item.score) && item.score >= 0 && item.score <= 100 && ['low', 'moderate', 'high', 'critical'].includes(item.levelId) && typeof item.levelLabel === 'string' && ['Кафе', 'Метро', 'Торговый центр', 'Аэропорт', 'Вокзал'].includes(item.place) && ['Android', 'iPhone', 'Windows', 'macOS'].includes(item.device) && ['Сайты и видео', 'Личные аккаунты', 'Рабочие данные'].includes(item.purpose);
}

export function loadHistory(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(validItem).slice(0, MAX_ITEMS) : [];
  } catch { return []; }
}

export function saveHistory(storage, item) {
  try {
    const history = [item, ...loadHistory(storage).filter(old => old.id !== item.id)].filter(validItem).slice(0, MAX_ITEMS);
    storage.setItem(HISTORY_KEY, JSON.stringify(history));
    return true;
  } catch { return false; }
}

export function removeHistoryItem(storage, id) {
  try { storage.setItem(HISTORY_KEY, JSON.stringify(loadHistory(storage).filter(item => item.id !== id))); return true; } catch { return false; }
}

export function clearHistory(storage) {
  try { storage.removeItem(HISTORY_KEY); return true; } catch { return false; }
}

