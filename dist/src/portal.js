const HTTP_PORTS = new Set(['80', '443']);

function isIpAddress(hostname) {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return true;
  return hostname.includes(':');
}

function normalizeOfficialDomain(value) {
  const input = String(value ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!input) return { value: '', hostname: null, error: '' };
  try {
    const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`;
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || !url.hostname || isIpAddress(url.hostname)) {
      return { value: input, hostname: null, error: 'Укажите домен без пути, порта, логина и пароля.' };
    }
    return { value: input, hostname: url.hostname.toLowerCase().replace(/\.$/, ''), error: '' };
  } catch {
    return { value: input, hostname: null, error: 'Официальный домен не удалось распознать.' };
  }
}

export function analyzePortalUrl(input, officialDomain = '') {
  const raw = String(input ?? '').trim();
  const official = normalizeOfficialDomain(officialDomain);
  const result = { input: raw, valid: false, url: null, hostname: '', displayHost: '', protocol: '', checks: [], official: { input: official.value, valid: Boolean(official.hostname), match: null, hostname: official.hostname, error: official.error }, summary: '' };
  if (!raw) { result.summary = 'Введите ссылку для проверки.'; return result; }
  let url;
  try { url = new URL(raw); } catch { result.summary = 'Ссылка не похожа на корректный URL.'; return result; }
  result.url = url;
  result.valid = url.protocol === 'http:' || url.protocol === 'https:';
  result.protocol = url.protocol.replace(':', '').toUpperCase();
  result.hostname = url.hostname;
  result.displayHost = url.host;
  if (!result.valid) { result.summary = 'Разрешены только ссылки HTTP и HTTPS.'; return result; }
  const idn = /xn--/i.test(url.hostname) || /[^\x00-\x7F]/.test(raw);
  const ip = isIpAddress(url.hostname);
  const unusualPort = Boolean(url.port) && !HTTP_PORTS.has(url.port);
  const checks = [
    { id: 'protocol', tone: url.protocol === 'https:' ? 'good' : 'note', title: url.protocol === 'https:' ? 'Используется HTTPS' : 'Используется HTTP', text: url.protocol === 'https:' ? 'Соединение с сайтом шифруется, но HTTPS сам по себе не подтверждает владельца сайта.' : 'HTTP не шифрует соединение с сайтом. Это повод не вводить важные данные, но не доказательство вредоносности.' },
    { id: 'host', tone: 'good', title: `Настоящий хост: ${url.hostname}`, text: 'Именно это имя хоста сообщает URL API; путь и отображаемый текст страницы могут быть другими.' },
    { id: 'at', tone: url.username || url.password ? 'warning' : 'good', title: url.username || url.password ? 'В адресе есть символ @' : 'Символ @ не найден', text: url.username || url.password ? 'Часть перед @ — данные пользователя, а настоящий хост находится после @. Такой адрес может вводить в заблуждение.' : 'Признак обманчивого адреса с данными пользователя перед хостом не найден.' },
    { id: 'ip', tone: ip ? 'warning' : 'good', title: ip ? 'Используется IP-адрес' : 'Используется доменное имя', text: ip ? 'IP-адрес сам по себе не доказывает угрозу, но его стоит сверить с официальными материалами заведения.' : 'Имя домена само по себе не доказывает, что сайт принадлежит заведению.' },
    { id: 'port', tone: unusualPort ? 'warning' : 'good', title: unusualPort ? `Необычный порт: ${url.port}` : 'Порт выглядит обычно', text: unusualPort ? 'Нестандартный порт не доказывает вредоносность, но требует дополнительной проверки источника ссылки.' : 'Используется стандартный порт или порт не указан.' },
    { id: 'idn', tone: idn ? 'note' : 'good', title: idn ? 'Обнаружен международный домен (IDN/Punycode)' : 'Признак IDN/Punycode не обнаружен', text: idn ? 'Это может быть обычный национальный домен и не обязательно является угрозой. Особенно внимательно сверяйте написание с официальным источником.' : 'Специальных признаков международного домена не найдено.' },
  ];
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (official.hostname) {
    const match = host === official.hostname || host.endsWith(`.${official.hostname}`);
    result.official.match = match;
    checks.push({ id: 'official', tone: match ? 'good' : 'warning', title: match ? 'Домен совпадает с официальным' : 'Домен не совпадает с официальным', text: match ? `Хост ${host} совпадает с ${official.hostname} или является его поддоменом.` : `Хост ${host} не является ${official.hostname} и не является его поддоменом. Сверьте адрес вручную.` });
  } else if (official.error) checks.push({ id: 'official', tone: 'warning', title: 'Официальный домен не проверен', text: official.error });
  result.checks = checks;
  result.summary = 'Проверка завершена. Это локальный анализ структуры адреса, а не подтверждение безопасности сайта.';
  return result;
}

