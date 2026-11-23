const unavailable = 'Браузер не предоставляет эти данные';

export function readNetworkInformation(navigatorLike = globalThis.navigator) {
  const connection = navigatorLike?.connection ?? navigatorLike?.mozConnection ?? navigatorLike?.webkitConnection;
  const value = (key, format = String) => connection && connection[key] !== undefined && connection[key] !== null ? { value: format(connection[key]), source: 'Определено автоматически' } : { value: unavailable, source: 'Определено автоматически' };
  return [
    { id: 'type', label: 'Тип соединения', ...value('type') },
    { id: 'effectiveType', label: 'Оценка типа соединения', ...value('effectiveType') },
    { id: 'downlink', label: 'Приблизительная скорость', ...value('downlink', v => `${v} Мбит/с`) },
    { id: 'rtt', label: 'Оценка задержки браузера', ...value('rtt', v => `${v} мс`) },
    { id: 'saveData', label: 'Режим экономии данных', ...value('saveData', v => v ? 'включён' : 'выключен') },
  ];
}

export async function checkServerAvailability(fetchLike = globalThis.fetch, performanceLike = globalThis.performance, endpoint = '/health') {
  const start = typeof performanceLike?.now === 'function' ? performanceLike.now() : Date.now();
  try {
    if (typeof fetchLike !== 'function') throw new Error('fetch unavailable');
    const response = await fetchLike(endpoint, { method: 'GET', cache: 'no-store', credentials: 'same-origin' });
    const end = typeof performanceLike?.now === 'function' ? performanceLike.now() : Date.now();
    return { available: response.ok, status: response.status, latencyMs: Math.max(0, Math.round(end - start)), source: 'Определено автоматически', error: response.ok ? '' : `Сервер ответил с кодом ${response.status}.` };
  } catch {
    return { available: false, status: null, latencyMs: null, source: 'Определено автоматически', error: 'Не удалось получить ответ от сервера WiFiGuard.' };
  }
}

export const CONNECTION_PROTECTION_OPTIONS = [
  { id: 'modern', label: 'WPA2/WPA3 или другая современная защита' },
  { id: 'open', label: 'Открытая сеть без защиты' },
  { id: 'legacy', label: 'WEP или старый WPA' },
  { id: 'unknown', label: 'Не знаю' },
];

