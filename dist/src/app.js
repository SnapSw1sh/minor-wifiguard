import { QUESTIONS, PLACES, DEVICES, PURPOSES, SOURCES, PRESETS } from './data.js';
import { evaluateAssessment, replaceAnswer } from './assessment.js';
import { getRecommendations, contextAdvice } from './guidance.js';
import { freshState, loadSession, saveSession, clearSession } from './session.js';
import { analyzePortalUrl } from './portal.js';
import { loadHistory, saveHistory, removeHistoryItem, clearHistory } from './history.js';
import { checkServerAvailability, readNetworkInformation, CONNECTION_PROTECTION_OPTIONS } from './connection.js';

const paths = {
  wifi: '<path d="M2 8.5a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 15.5a5.5 5.5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/>',
  shield: '<path d="m12 3 8 3v6c0 5-4 8-8 10-4-2-8-5-8-10V6Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  coffee: '<path d="M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5ZM17 9h2a3 3 0 0 1 0 6h-2M3 22h16M7 3v2M12 2v3"/>',
  train: '<rect x="5" y="3" width="14" height="16" rx="4"/><path d="M5 10h14M8 19l-2 3M16 19l2 3M12 3v7M8 15h1M15 15h1"/>',
  station: '<path d="m3 9 9-6 9 6M5 8v13h14V8M9 21v-7h6v7M2 21h20"/><circle cx="12" cy="9" r="2"/>',
  bag: '<path d="M5 7h14l2 14H3ZM9 8V6a3 3 0 0 1 6 0v2"/>',
  plane: '<path d="m22 3-7 9 2 8-3 1-4-6-5 4-3-1 5-7-4-5 2-2 6 3 9-6Z"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4M11 18h2"/>',
  laptop: '<rect x="4" y="3" width="16" height="13" rx="2"/><path d="m4 16-3 4h22l-3-4M9 20h6"/>',
  browser: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.1M10 6.5h.1M8 13h8M8 16h5"/>',
  alert: '<path d="m10.3 4-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01"/>',
  key: '<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9M16 16l3-3M19 19l3-3"/>',
  refresh: '<path d="M20 8a9 9 0 0 0-15-3L2 8M2 3v5h5M4 16a9 9 0 0 0 15 3l3-3M22 21v-5h-5"/>',
  toggle: '<rect x="2" y="6" width="20" height="12" rx="6"/><circle cx="15" cy="12" r="3"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  chart: '<path d="M4 3v18h18M9 16v-4M14 16V8M19 16V5"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] ?? paths.info}</svg>`;
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const number = value => String(value).replace('.', ',');
const main = document.querySelector('#main');
const dialog = document.querySelector('#info-dialog');
const dialogContent = document.querySelector('#dialog-content');
let storage;
try { storage = window.sessionStorage; } catch { /* The app remains usable without storage. */ }
let state = loadSession(storage);
let localStorageForHistory;
try { localStorageForHistory = window.localStorage; } catch { /* History remains unavailable without localStorage. */ }
let notice = '';
let storageUnavailable = false;
let connectionCheck = null;
let connectionDraft = { protection: '', work: '' };

function persist() { storageUnavailable = !saveSession(storage, state); }
function contextLabels() { return [PLACES.find(p => p.id === state.context.place).name, DEVICES.find(p => p.id === state.context.device).name, PURPOSES.find(p => p.id === state.context.purpose).name]; }
function steps(active) { return `<div class="steps" aria-label="Этапы оценки">${['Контекст','Опрос','Результат','Помощник'].map((label, i) => `<span class="step ${i === active ? 'active' : i < active ? 'done' : ''}" ${i === active ? 'aria-current="step"' : ''}>${label}</span>`).join('')}</div>`; }
function chips() { return `<div class="context-chips">${contextLabels().map(s => `<span class="tag tag-neutral">${esc(s)}</span>`).join('')}</div>`; }
function demoBanner() { return state.preset ? `<div class="demo-banner">${icon('play')}<span>Учебный пример. Ответы подготовлены заранее, реальная сеть не проверялась.</span><button class="nav-button" data-action="new">Новая оценка</button></div>` : ''; }
function gauge(assessment, mini = false) { return `<div class="risk-gauge level-${assessment.level.id} ${mini ? 'mini-gauge' : ''}" style="--score:${assessment.score}" role="img" aria-label="${assessment.score} из 100. ${assessment.level.label}"><strong>${assessment.score}</strong><span>из 100</span></div>`; }
function examples() { return `<div class="example-grid">${PRESETS.map(p => { const a = evaluateAssessment(p.answers); return `<article class="example-card"><div class="example-top"><div class="feature-icon">${icon(p.icon)}</div><span class="tag tag-neutral">${esc(p.subtitle)}</span></div><h3>${p.title}</h3><p>${p.description}</p><button class="text-button" data-action="preset" data-id="${p.id}"><span>Открыть пример</span><span class="level-${a.level.id}"><span class="level-badge">${a.score} / 100</span></span></button></article>`; }).join('')}</div>`; }
function renderHome() {
  const sample = evaluateAssessment(PRESETS[0].answers);
  return `<div class="container">
    ${Object.keys(state.answers).length && state.view !== 'ended' ? `<div class="resume-banner"><span>У вас есть сохранённая в этой вкладке оценка.</span><button class="button button-small button-outline" data-action="resume">Продолжить</button></div>` : ''}
    <section class="hero"><div class="hero-copy"><span class="eyebrow">${icon('shield')} Спокойнее в любой сети</span><h1>Публичный Wi-Fi.<br><em>Понятный уровень риска.</em></h1><p>Узнайте, на что обратить внимание при подключении, и получите простой план защиты своих данных.</p><div class="hero-actions"><button class="button" data-action="setup">Оценить подключение</button><button class="button button-outline" data-action="connection">Проверить моё подключение</button><span>8 вопросов<br>около 3 минут</span></div><div class="hero-footnote">${icon('lock')} Без регистрации. Ваши ответы остаются в браузере.</div></div>
    <div class="hero-visual" aria-label="Иллюстрация учебного примера оценки"><div class="orbit"></div><div class="orbit second"></div><span class="visual-dot"></span><div class="preview-card"><div class="preview-card-top"><span>Подключение в кафе</span>${icon('wifi')}</div><small>Пример оценки по ответам</small>${gauge(sample, true)}<div class="preview-label">${sample.level.label}</div><div class="preview-bar"></div><p class="preview-sub">Есть несколько способов снизить риск</p></div><div class="floating-card float-top">${icon('shield')}<span><strong>Понятные рекомендации</strong>Под вашу ситуацию и устройство</span></div><div class="floating-card float-bottom">${icon('toggle')}<span><strong>Автоподключение включено</strong>Один из факторов этого примера</span></div></div></section>
    <section class="features-strip" id="how" aria-label="Как это работает"><div class="feature"><div class="feature-icon">${icon('list')}</div><div><strong>Расскажите о подключении</strong><p>Ответьте на короткие вопросы.<br>«Не знаю» — тоже ответ.</p></div></div><div class="feature"><div class="feature-icon">${icon('chart')}</div><div><strong>Узнайте причины риска</strong><p>У каждого балла есть объяснение.<br>Без скрытых проверок.</p></div></div><div class="feature"><div class="feature-icon">${icon('shield')}</div><div><strong>Настройте защиту</strong><p>Пройдите шаги помощника<br>и сравните результат.</p></div></div></section>
    <section class="section tools-section"><div class="section-heading"><div><span class="eyebrow">Дополнительные инструменты</span><h2>Проверьте подключение и вернитесь к результатам</h2></div></div><div class="tool-grid"><button class="panel tool-card" data-action="connection"><div class="feature-icon">${icon('wifi')}</div><h3>Проверить моё подключение</h3><p>Проверьте доступность WiFiGuard и доступные характеристики сети без определения SSID.</p></button><button class="panel tool-card" data-action="portal"><div class="feature-icon">${icon('browser')}</div><h3>Проверка ссылки</h3><p>Локально разберите URL страницы подключения, не открывая его.</p></button><button class="panel tool-card" data-action="history"><div class="feature-icon">${icon('chart')}</div><h3>История проверок</h3><p>Сохраните до 10 результатов опроса без чувствительных данных.</p></button></div></section>
    <section class="section" id="setup"><div class="section-heading"><div><span class="eyebrow">Начнём с вашей ситуации</span><h2>Где вы подключаетесь?</h2></div><p>Выберите место, устройство и задачу</p></div><div class="setup-panel"><form id="context-form"><fieldset><legend class="sr-only">Общественное место</legend><div class="place-grid">${PLACES.map(p => `<label class="choice-card place-card"><input type="radio" name="place" value="${p.id}" ${p.id === state.context.place ? 'checked' : ''}>${icon(p.icon)}<span class="selected-mark"></span><strong>${p.name}</strong><small>${p.detail}</small></label>`).join('')}</div></fieldset><div class="setup-bottom"><fieldset><legend>Ваше устройство</legend><div class="device-grid">${DEVICES.map(d => `<label class="choice-card device-card"><input type="radio" name="device" value="${d.id}" ${d.id === state.context.device ? 'checked' : ''}>${icon(d.icon)}<strong>${d.name}</strong></label>`).join('')}</div></fieldset><fieldset><legend>Что планируете делать?</legend><div class="purpose-grid">${PURPOSES.map(p => `<label class="choice-card purpose-card"><input type="radio" name="purpose" value="${p.id}" ${p.id === state.context.purpose ? 'checked' : ''}><span><strong>${p.name}</strong><small>${p.detail}</small></span></label>`).join('')}</div></fieldset></div><div class="setup-footer"><div class="privacy-line">${icon('info')}<span>Оценка основана на ответах.<br>WiFiGuard не сканирует сеть и не меняет настройки.</span></div><button type="button" class="button" data-action="start">Начать оценку</button></div></form></div></section>
    <section class="section examples-section" id="examples"><div class="section-heading"><div><span class="eyebrow">Можно сначала попробовать</span><h2>Три ситуации из жизни</h2></div><p>Подготовленные учебные примеры</p></div>${examples()}</section></div>`;
}
function renderPortal() {
  return `<div class="container page-shell"><div class="page-heading"><div class="heading-row"><div><span class="eyebrow">Локальный анализ адреса</span><h1 tabindex="-1">Проверка ссылки</h1><p>Адрес не открывается и никуда не отправляется. Проверяется только его структура в браузере.</p></div><button class="button button-outline button-small" data-action="home">На главную</button></div></div><section class="panel portal-panel"><form id="portal-form"><label class="field-label" for="portal-url">URL страницы подключения</label><input class="text-input" id="portal-url" name="portal-url" type="text" inputmode="url" autocomplete="off" placeholder="https://wifi.example.ru/login" required><label class="field-label" for="official-domain">Официальный домен (необязательно)</label><input class="text-input" id="official-domain" name="official-domain" type="text" inputmode="url" autocomplete="off" placeholder="example.ru"><p class="score-note">Введите только адреса, которые хотите разобрать. Не вводите логины, пароли, коды или другие личные данные.</p><button class="button" type="submit">Проверить ссылку</button></form><div id="portal-result" class="portal-result" aria-live="polite"></div></section></div>`;
}
function renderHistory() {
  const history = loadHistory(localStorageForHistory);
  const items = history.map(item => `<article class="history-item"><div><time datetime="${esc(item.date)}">${esc(new Date(item.date).toLocaleString('ru-RU'))}</time><h3>${esc(item.place)} · ${esc(item.device)}</h3><p>${esc(item.purpose)}</p></div><div class="history-score level-${esc(item.levelId)}"><strong>${item.score}</strong><span>/ 100 · ${esc(item.levelLabel)}</span></div><button class="text-button" data-action="remove-history" data-id="${esc(item.id)}">Удалить</button></article>`).join('');
  return `<div class="container page-shell"><div class="page-heading"><div class="heading-row"><div><span class="eyebrow">Только в этом браузере</span><h1 tabindex="-1">История проверок</h1><p>Сохраняются только результаты опроса: дата, контекст, индекс и уровень риска.</p></div><div><button class="button button-outline button-small" data-action="home">На главную</button>${history.length ? '<button class="text-button" data-action="clear-history">Очистить историю</button>' : ''}</div></div></div><section class="panel history-panel">${items || `<div class="empty-state"><div class="feature-icon">${icon('chart')}</div><h2>История пока пуста</h2><p>Завершите опрос и нажмите «Сохранить результат», чтобы добавить запись.</p></div>`}</section></div>`;
}
function connectionCharacteristic(item) { return `<div class="connection-characteristic"><div><strong>${esc(item.label)}</strong><span>${esc(item.value)}</span></div><small>Источник: ${esc(item.source)}</small></div>`; }
function renderConnection() {
  const network = readNetworkInformation();
  const server = connectionCheck;
  const protectionOptions = CONNECTION_PROTECTION_OPTIONS.map(option => `<label class="option"><input type="radio" name="connection-protection" value="${option.id}" ${connectionDraft.protection === option.id ? 'checked' : ''}><span class="radio-mark"></span><span><strong>${esc(option.label)}</strong></span></label>`).join('');
  const serverCard = server?.loading ? '<div class="connection-status"><strong>Проверяем доступность…</strong><p>Запрашивается только same-origin адрес WiFiGuard.</p></div>' : server ? `<div class="connection-status ${server.available ? 'good' : 'warning'}"><strong>${server.available ? 'Сервер доступен' : 'Сервер недоступен'}</strong><p>${server.available ? `Ответ получен примерно за ${server.latencyMs} мс.` : esc(server.error)}</p></div>` : '<p class="connection-muted">Проверка ещё не запускалась.</p>';
  return `<div class="container page-shell"><div class="page-heading"><div class="heading-row"><div><span class="eyebrow">Автоматические данные и ваши ответы</span><h1 tabindex="-1">Проверка текущего подключения</h1><p>Проверяется доступность самого WiFiGuard. Это не сканирование Wi-Fi и не подтверждение безопасности точки доступа.</p></div><button class="button button-outline button-small" data-action="home">На главную</button></div></div><section class="connection-grid"><div class="panel"><div class="panel-head"><h2>Доступность WiFiGuard</h2><span>Источник: Определено автоматически</span></div>${serverCard}<button class="button" data-action="connection-check" ${server?.loading ? 'disabled' : ''}>${server?.loading ? 'Проверяем…' : 'Проверить доступность сервера'}</button><p class="score-note">Низкая задержка или хорошая скорость не доказывают безопасность Wi-Fi и подлинность точки доступа.</p></div><div class="panel"><div class="panel-head"><h2>Доступные характеристики сети</h2><span>Network Information API</span></div>${network.map(connectionCharacteristic).join('')}<p class="score-note">Браузер не сообщает SSID, WPA2/WPA3, мощность сигнала или подлинность точки доступа через эту функцию.</p></div></section><section class="panel connection-questions"><div class="panel-head"><div><h2>Уточните текущую сеть</h2><p>Эти ответы будут использованы в существующем индексе риска.</p></div><span>Источник: Указано пользователем</span></div><fieldset><legend>Тип защиты Wi-Fi</legend><div class="answer-options">${protectionOptions}</div></fieldset><fieldset><legend>Используете сеть для рабочих данных?</legend><div class="answer-options"><label class="option"><input type="radio" name="connection-work" value="yes" ${connectionDraft.work === 'yes' ? 'checked' : ''}><span class="radio-mark"></span><span><strong>Да</strong></span></label><label class="option"><input type="radio" name="connection-work" value="no" ${connectionDraft.work === 'no' ? 'checked' : ''}><span class="radio-mark"></span><span><strong>Нет</strong></span></label><label class="option"><input type="radio" name="connection-work" value="unknown" ${connectionDraft.work === 'unknown' ? 'checked' : ''}><span class="radio-mark"></span><span><strong>Не знаю</strong></span></label></div></fieldset><button class="button" data-action="apply-connection" ${connectionDraft.protection && connectionDraft.work ? '' : 'disabled'}>Учесть ответы в оценке</button><p class="score-note">Автоматическая проверка не определяет SSID, тип шифрования Wi-Fi, сигнал или владельца сети. Для этого нужны доверенные сведения от заведения и настройки устройства.</p></section></div>`;
}
function answerOptions(q, selected, name = 'answer') {
  return `<div class="answer-options">${q.options.map(o => `<label class="option"><input type="radio" name="${name}" value="${o.id}" ${o.id === selected ? 'checked' : ''}><span class="radio-mark"></span><span><strong>${esc(o.label)}</strong><small>${esc(o.detail)}</small></span></label>`).join('')}</div>`;
}
function renderSurvey() {
  const q = QUESTIONS[state.questionIndex];
  const labels = contextLabels();
  return `<div class="container page-shell">${steps(1)}${demoBanner()}<div class="survey-layout"><section class="question-panel"><div class="question-meta"><span>Вопрос ${state.questionIndex + 1} из ${QUESTIONS.length}</span><span>${Math.round(state.questionIndex / QUESTIONS.length * 100)}% пройдено</span></div><div class="progress-track" role="progressbar" aria-label="Прогресс опроса" aria-valuemin="0" aria-valuemax="8" aria-valuenow="${state.questionIndex}"><span style="width:${state.questionIndex / QUESTIONS.length * 100}%"></span></div><span class="tag tag-blue">${q.short}</span><h1 class="question-title" id="question-title" tabindex="-1">${q.title}</h1><p class="question-caption">${q.caption}</p><fieldset aria-labelledby="question-title">${answerOptions(q, state.answers[q.id])}</fieldset><details class="help-box"><summary>Помогите разобраться</summary><p>${q.help}</p></details><div class="question-footer"><button class="button button-outline" data-action="previous">${state.questionIndex ? 'Назад' : 'К выбору места'}</button><button class="button" data-action="next" ${state.answers[q.id] ? '' : 'disabled'}>${state.questionIndex === QUESTIONS.length - 1 ? 'Посмотреть результат' : 'Далее'}</button></div></section><aside class="context-card"><h3>Ваша ситуация</h3><div class="context-line">${icon(PLACES.find(p => p.id === state.context.place).icon)}${esc(labels[0])}</div><div class="context-line">${icon(DEVICES.find(d => d.id === state.context.device).icon)}${esc(labels[1])}</div><div class="context-line">${icon('browser')}${esc(labels[2])}</div><div class="side-note">${icon('info')}<p>Не уверены в ответе? Выберите «Не знаю». Помощник объяснит, что и где можно проверить.</p></div><div class="side-note"><p>Ответы не отправляются на сервер. Не вводите пароли, коды или данные своих аккаунтов.</p></div></aside></div></div>`;
}
function comparison(a) {
  if (!state.baselineAnswers || !QUESTIONS.some(q => state.baselineAnswers[q.id] !== state.answers[q.id])) return '';
  const baseline = evaluateAssessment(state.baselineAnswers);
  const delta = baseline.score - a.score;
  return `<div class="comparison">${icon(delta > 0 ? 'shield' : 'refresh')}<div><strong>Было ${baseline.score} → стало ${a.score} из 100</strong><p>${delta > 0 ? `Снижение индекса на ${delta} по уточнённым ответам.` : delta < 0 ? 'Новые ответы выявили дополнительные факторы риска.' : 'Ответы уточнены. Общий индекс не изменился.'} Изменения настроек подтверждены вами.</p></div></div>`;
}
function criticalBox(a) {
  if (!a.criticalSigns.length) return '';
  return `<div class="critical-box" role="note"><h3>${icon('alert')}Сначала остановитесь и проверьте</h3><ul>${a.criticalSigns.map(id => `<li>${id === 'portal' ? 'Портал запрашивает секреты или установку неизвестного сертификата, профиля или приложения.' : 'Вы продолжаете работу на странице с ошибкой сертификата.'}</li>`).join('')}</ul><p>Не передавайте данные. Закройте подозрительную страницу, при необходимости отключитесь от сети.</p><p>При таком признаке итоговый индекс не ниже 75${a.floorApplied ? `, даже если сумма факторов — ${a.baseScore}` : ''}.</p></div>`;
}
function renderResult() {
  const a = evaluateAssessment(state.answers);
  const actions = getRecommendations(a, state.context);
  const advice = contextAdvice(state.context);
  const report = `<section id="print-report" class="print-report"><h1>WiFiGuard</h1><p>Учебный отчёт оценки публичного Wi-Fi</p><p>Дата проверки: ${esc(new Date().toLocaleString('ru-RU'))}</p><h2>Индекс риска: ${a.score} из 100</h2><p>Уровень: ${esc(a.level.label)}</p><h2>Основные факторы</h2><ul>${a.factors.filter(f => f.contribution > 0 || f.critical).map(f => `<li>${esc(f.name)}: ${esc(f.label)}</li>`).join('') || '<li>Факторы риска не обнаружены по ответам.</li>'}</ul><h2>Рекомендации</h2><ul>${actions.slice(0, 6).map(r => `<li>${esc(r.title)}: ${esc(r.why)}</li>`).join('') || '<li>Сохраняйте текущие полезные привычки.</li>'}</ul><p class="print-disclaimer">Предупреждение: это учебная оценка на основании ответов пользователя, а не проверка сети и не гарантия безопасности.</p></section>`;
  return `<div class="container page-shell">${steps(2)}${demoBanner()}${notice ? `<div class="notice" role="status">${icon('check')}<p>${esc(notice)}</p></div>` : ''}<div class="page-heading"><div class="heading-row"><div><span class="eyebrow">Оценка завершена</span><h1 tabindex="-1">Ваше подключение в деталях</h1><p>Посмотрите, какие ответы повлияли на результат и что можно сделать дальше.</p></div><div><button class="button button-outline button-small" data-action="new">Новая оценка</button><button class="button button-small" data-action="save-pdf">Сохранить отчёт PDF</button></div></div>${chips()}</div><div class="result-layout"><div><section class="panel"><div class="result-overview">${gauge(a)}<div class="result-summary level-${a.level.id}"><span class="level-badge">${a.level.label}</span><h2>${a.score < 25 ? 'Сохраняйте полезные привычки' : 'Сделаем подключение осознаннее'}</h2><p>${a.level.text}</p></div></div>${criticalBox(a)}${a.unknownCount ? `<div class="unknown-note">${icon('info')}<p>Ответов «Не знаю»: ${a.unknownCount}. Они учтены как неопределённость, а не как обнаруженная уязвимость.</p></div>` : ''}${comparison(a)}<p class="score-note">Учебный индекс по вашим ответам, не вероятность взлома. Даже 0 баллов не гарантируют безопасность сети. <button class="text-button" data-action="method">Как устроен расчёт</button></p></section><section class="panel factors-panel"><div class="panel-head"><h2>Из чего сложился балл</h2><span>Вклад / максимум</span></div>${a.factors.map(f => `<div class="factor ${f.critical ? 'critical' : ''}"><div class="factor-title">${f.critical ? icon('alert') : ''}${f.name}</div><strong>${number(f.contribution)} / ${f.weight}</strong><small>${esc(f.label)}</small><div class="factor-track"><span style="width:${f.severity * 100}%"></span></div></div>`).join('')}<p class="score-note">Сумма факторов: ${a.baseScore}. ${a.floorApplied ? 'Применён критический минимум 75.' : 'Сумма округлена до целого один раз.'} Веса — учебная модель команды, не отраслевой стандарт.</p></section><div class="result-actions"><button class="text-button" data-action="save-history">Сохранить результат</button><button class="text-button" data-action="edit">Уточнить ответы</button><button class="text-button" data-action="method">Методика и источники</button></div></div><aside><section class="panel action-panel"><div class="feature-icon">${icon(actions.length ? 'list' : 'shield')}</div><h2>${actions.length ? 'Ваш план защиты' : 'Основные меры соблюдены'}</h2><p>${actions.length ? `Факторов для проверки или улучшения: ${actions.length}. Пройдите шаги под ваше устройство и сравните результат.` : 'В ответах не осталось факторов, повышающих индекс. Продолжайте проверять адреса сайтов и неожиданные запросы.'}</p>${actions.slice(0, 3).map(r => `<div class="task-preview">${icon(r.critical ? 'alert' : 'check')}<span>${r.title}</span></div>`).join('')}<button class="button" data-action="assistant">${actions.length ? 'Перейти к плану защиты' : 'Посмотреть рекомендации'}</button></section><section class="panel advice-panel"><h2>Для вашей ситуации</h2>${advice.messages.map(m => `<div class="advice-item">${icon('info')}<p>${m}</p></div>`).join('')}</section></aside></div>${report}</div>`;
}
function renderAssistant() {
  const a = evaluateAssessment(state.answers);
  const actions = getRecommendations(a, state.context);
  const current = actions.find(r => r.id === state.activeAction) ?? actions.find(r => !state.skipped.includes(r.id));
  const resolved = evaluateAssessment(state.baselineAnswers).factors.filter(f => f.contribution > 0 && a.factors.find(c => c.id === f.id).contribution === 0);
  return `<div class="container page-shell">${steps(3)}${demoBanner()}${notice ? `<div class="notice" role="status">${icon('check')}<p>${esc(notice)}</p></div>` : ''}<div class="page-heading"><div class="heading-row"><div><span class="eyebrow">Пошаговый помощник</span><h1 tabindex="-1">Меньше риска, шаг за шагом</h1><p>Меняйте ответ только после проверки. Приложение не меняет настройки устройства.</p></div><button class="button button-small button-outline" data-action="result">К результату</button></div>${chips()}</div><div class="assistant-layout"><aside class="assistant-sidebar"><div class="assistant-score"><span>Текущий индекс</span><strong>${a.score}<span> / 100</span></strong></div><div class="action-list" aria-label="Действия плана">${actions.map(r => `<button class="action-item ${r.id === current?.id ? 'active' : ''} ${r.critical ? 'critical' : ''}" data-action="select-action" data-id="${r.id}" ${r.id === current?.id ? 'aria-current="step"' : ''}>${icon(r.critical ? 'alert' : QUESTIONS.find(q => q.id === r.id).icon)}<span>${r.title}<small>${state.skipped.includes(r.id) ? 'Отложено · риск сохраняется' : r.critical ? 'Критический признак' : r.unknown ? 'Нужно уточнить' : 'Можно улучшить'}</small></span></button>`).join('')}${resolved.map(r => `<div class="action-item completed">${icon('check')}<span>${r.name}<small>Ответ уточнён вами</small></span></div>`).join('')}</div><button class="text-button" data-action="method">Источники рекомендаций</button></aside>${current ? renderAction(current) : `<section class="panel empty-state"><div class="feature-icon">${icon(actions.length ? 'list' : 'shield')}</div><h2>${actions.length ? 'Остальные действия отложены' : 'Все изменения учтены'}</h2><p>${actions.length ? 'Не выполненные действия не снижают индекс. Вернитесь к любому из них через список или посмотрите общий результат.' : 'По текущим ответам факторы индекса устранены. Это не техническая проверка сети и не гарантия безопасности.'}</p>${comparison(a)}<button class="button" data-action="result">Посмотреть результат</button><div class="disconnect-line"><p>Если вы закончили пользоваться этой сетью:</p><button class="text-button" data-action="disconnect">Я отключился от сети</button></div></section>`}</div></div>`;
}
function renderAction(r) {
  const q = QUESTIONS.find(q => q.id === r.id);
  return `<section class="panel assistant-card" data-current="${r.id}"><span class="tag ${r.critical ? 'tag-neutral' : 'tag-blue'}">${r.critical ? 'Начните с этого' : DEVICES.find(d => d.id === state.context.device).name}</span><h2>${r.title}</h2><p>${r.why}</p><ol class="instruction-list">${r.steps.map(s => `<li>${s}</li>`).join('')}</ol><fieldset class="verification"><legend>${r.verification}</legend>${answerOptions(q, null, 'verification')}<p class="score-note">Сейчас учтено: ${esc(r.label)}. Выберите фактическое состояние после проверки.</p></fieldset><div class="assistant-buttons"><button class="button" data-action="confirm-change" data-id="${r.id}" disabled>Подтвердить и пересчитать</button><button class="text-button" data-action="skip" data-id="${r.id}">Не могу выполнить сейчас</button></div>${r.disconnect ? `<div class="disconnect-line"><p>Если вы прекратили пользоваться этой сетью, не отмечайте её как безопасную.</p><button class="text-button" data-action="disconnect">Я отключился от сети</button></div>` : ''}</section>`;
}
function renderEnded() {
  const score = evaluateAssessment(state.answers).score;
  return `<div class="container page-shell"><section class="panel empty-state ended-card"><div class="feature-icon">${icon('wifi')}</div><span class="eyebrow">Оценка завершена</span><h1 tabindex="-1">Вы прекратили использование сети</h1><p>Ваше подтверждение принято. Приложение само не отключает Wi-Fi и не проверяет настройки. Для другого подключения начните новую оценку.</p><div class="ended-score">Последний индекс этой сети: <strong>${score} / 100</strong>.<br>После отключения новый балл не рассчитывается.</div><button class="button" data-action="new">Оценить другую сеть</button><p class="score-note">Если вы уже передали пароль или платёжные данные подозрительному порталу, защитите аккаунт через доверенное подключение; при необходимости обратитесь в банк или ИТ-службу.</p></section></div>`;
}
function render(focus = true) {
  persist();
  const view = { home: renderHome, survey: renderSurvey, result: renderResult, assistant: renderAssistant, ended: renderEnded, portal: renderPortal, history: renderHistory, connection: renderConnection }[state.view] ?? renderHome;
  main.innerHTML = `${storageUnavailable ? '<div class="memory-note">Хранилище вкладки недоступно. Приложение работает, но после обновления страницы прогресс может потеряться.</div>' : ''}${view()}`;
  if (focus) { window.scrollTo({ top: 0, behavior: 'instant' }); const heading = main.querySelector('h1') ?? main; heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
  const labels = { home: 'Главная', survey: `Вопрос ${state.questionIndex + 1} из 8`, result: 'Результат оценки', assistant: 'План защиты', ended: 'Оценка завершена', portal: 'Проверка ссылки', history: 'История проверок', connection: 'Проверка текущего подключения' };
  document.title = `${labels[state.view]} — WiFiGuard`;
}
function showDialog(title, body) {
  dialogContent.innerHTML = `<div class="dialog-header"><h2 id="dialog-title">${title}</h2><button class="close-button" data-action="close-dialog" aria-label="Закрыть окно">${icon('close')}</button></div><div class="dialog-body">${body}</div>`;
  if (!dialog.open) dialog.showModal();
}
function showMethod() {
  showDialog('Как WiFiGuard оценивает риск', `<h3>Учебная модель, версия 1</h3><p>WiFiGuard оценивает сценарий использования публичного Wi-Fi по вашим ответам. Он не получает SSID, не проверяет шифрование, VPN или трафик, не обнаруживает злоумышленников и не меняет настройки.</p><table class="method-table"><thead><tr><th scope="col">Фактор</th><th scope="col">Вес</th></tr></thead><tbody>${QUESTIONS.map(q => `<tr><td>${q.short}</td><td>${q.weight}</td></tr>`).join('')}</tbody></table><p>Безопасный ответ: 0. «Не знаю»: половина веса. Небезопасный ответ: полный вес. Сумма округляется один раз до целого. Веса выбраны командой как объяснимая учебная эвристика и не являются научно откалиброванной вероятностью или отраслевым стандартом.</p><h3>Критические признаки</h3><p>Если портал требует секреты от другого аккаунта, банковские реквизиты или установку неизвестного сертификата / профиля / приложения, либо вы продолжаете работу при ошибке сертификата, итог не ниже 75. Пока такой признак сохраняется, остальные улучшения не отменяют критический минимум.</p><h3>Уровни индекса</h3><p>0–24: низкий. 25–49: умеренный. 50–74: высокий. 75–100: критический. Даже 0 баллов не означают гарантию безопасности. Изменение места само по себе не меняет балл. Цель работы и устройство уточняют рекомендации.</p><h3>HTTPS и VPN</h3><p>HTTPS шифрует соединение с сайтом даже в открытой сети, но фишинговый сайт тоже может использовать HTTPS. VPN даёт дополнительную защиту до своего сервера, не исправляя фишинг и ошибки сертификатов. Общий пароль Wi-Fi не доказывает безопасность сети.</p><h3>Конфиденциальность</h3><p>Ответы хранятся только в sessionStorage текущей вкладки. При недоступности хранилища используются только в памяти страницы. Нет аналитики, регистрации и отправки ответов. Хостинг может обрабатывать обычные технические сведения HTTP-запроса. Кнопка «Новая оценка» очищает текущую оценку. Исходный результат сохраняется для сравнения до начала новой оценки.</p><h3>Первоисточники</h3><ul class="source-list">${SOURCES.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${s.name}</a><small>${s.note}</small></li>`).join('')}</ul><p class="score-note">Инструкции зависят от версии системы и производителя. Используйте встроенные настройки и официальные справки. Проект KIB-42 «Династия», КТ4, ноябрь 2026.</p>`);
}
function go(view) { state.view = view; notice = ''; render(); }
function startNew() { clearSession(storage); state = freshState(); notice = ''; render(); }
document.addEventListener('submit', event => event.preventDefault());
document.addEventListener('submit', event => {
  if (event.target.id !== 'portal-form') return;
  const form = new FormData(event.target);
  const result = analyzePortalUrl(form.get('portal-url'), form.get('official-domain'));
  const output = document.querySelector('#portal-result');
  if (!output) return;
  output.innerHTML = `<div class="portal-summary ${result.valid ? '' : 'warning'}"><h2>${esc(result.summary)}</h2>${result.valid ? `<p><strong>Распознанный хост:</strong> ${esc(result.displayHost)}</p>${result.checks.map(check => `<article class="portal-check ${check.tone}"><strong>${esc(check.title)}</strong><p>${esc(check.text)}</p></article>`).join('')}` : ''}</div>`;
});
document.addEventListener('change', event => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (input.name === 'answer' && state.view === 'survey') {
    const q = QUESTIONS[state.questionIndex];
    if (!q.options.some(o => o.id === input.value)) return;
    state.answers[q.id] = input.value; persist();
    main.querySelector('[data-action="next"]').disabled = false;
  }
  if (input.name === 'verification') main.querySelector('[data-action="confirm-change"]').disabled = false;
  if (input.name === 'connection-protection') connectionDraft.protection = input.value;
  if (input.name === 'connection-work') connectionDraft.work = input.value;
  if (input.name?.startsWith('connection-')) { const apply = main.querySelector('[data-action="apply-connection"]'); if (apply) apply.disabled = !(connectionDraft.protection && connectionDraft.work); }
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  const homeLink = event.target.closest('a[href="#home"]');
  const howLink = event.target.closest('[data-nav="how"]');
  if (homeLink || howLink) {
    event.preventDefault();
    if (state.view === 'ended') { startNew(); } else { go('home'); }
    if (howLink) document.querySelector('#how').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (action === 'method') { showMethod(); return; }
  if (action === 'portal') { go('portal'); return; }
  if (action === 'history') { go('history'); return; }
  if (action === 'connection') { go('connection'); return; }
  if (action === 'home') { go('home'); return; }
  if (action === 'connection-check') {
    connectionCheck = { loading: true };
    render(false);
    checkServerAvailability().then(result => { connectionCheck = result; render(false); });
    return;
  }
  if (action === 'apply-connection') {
    if (!connectionDraft.protection || !connectionDraft.work) return;
    state.answers = { ...state.answers, encryption: connectionDraft.protection };
    state.context = { ...state.context, purpose: connectionDraft.work === 'yes' ? 'work' : 'browse' };
    if (!state.baselineAnswers && QUESTIONS.every(q => state.answers[q.id])) state.baselineAnswers = { ...state.answers };
    if (QUESTIONS.every(q => state.answers[q.id])) { state.view = 'result'; notice = 'Ответы о текущем подключении учтены в индексе риска.'; }
    else { state.questionIndex = QUESTIONS.findIndex(q => !state.answers[q.id]); state.view = 'survey'; notice = 'Ответы о текущем подключении учтены. Завершите оставшиеся вопросы.'; }
    render(); return;
  }
  if (action === 'save-pdf') { window.print(); return; }
  if (action === 'save-history') {
    const a = evaluateAssessment(state.answers);
    const labels = contextLabels();
    const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, date: new Date().toISOString(), place: labels[0], device: labels[1], purpose: labels[2], score: a.score, levelId: a.level.id, levelLabel: a.level.label };
    notice = saveHistory(localStorageForHistory, item) ? 'Результат сохранён в истории этого браузера.' : 'Историю сохранить не удалось: хранилище браузера недоступно.';
    render(); return;
  }
  if (action === 'remove-history') { removeHistoryItem(localStorageForHistory, id); render(false); return; }
  if (action === 'clear-history') { clearHistory(localStorageForHistory); render(false); return; }
  if (action === 'close-dialog') { dialog.close(); return; }
  if (action === 'examples') { showDialog('Попробуйте учебный пример', `<p>Данные подготовлены заранее. Открытие примера заменит текущую оценку.</p><div style="margin-top:20px">${examples()}</div>`); return; }
  if (action === 'preset') {
    const preset = PRESETS.find(p => p.id === id);
    if (!preset) return;
    state = { ...freshState(), context: { ...preset.context }, answers: { ...preset.answers }, baselineAnswers: { ...preset.answers }, preset: id, view: 'result' };
    dialog.close(); notice = ''; render(); return;
  }
  if (action === 'setup') { if (state.view !== 'home') go('home'); document.querySelector('#setup').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (action === 'start') {
    const form = document.querySelector('#context-form');
    const values = new FormData(form);
    const context = { place: values.get('place'), device: values.get('device'), purpose: values.get('purpose') };
    state = { ...freshState(), context, view: 'survey' }; notice = ''; render(); return;
  }
  if (action === 'resume') { go(state.baselineAnswers ? 'result' : 'survey'); return; }
  if (action === 'next') {
    if (!state.answers[QUESTIONS[state.questionIndex].id]) return;
    if (state.questionIndex < QUESTIONS.length - 1) state.questionIndex++;
    else { if (!QUESTIONS.every(q => state.answers[q.id])) return; state.baselineAnswers ??= { ...state.answers }; state.view = 'result'; state.skipped = []; }
    notice = ''; render(); return;
  }
  if (action === 'previous') { if (state.questionIndex) { state.questionIndex--; render(); } else go('home'); return; }
  if (action === 'edit') { state.questionIndex = 0; go('survey'); return; }
  if (action === 'result') { go('result'); return; }
  if (action === 'assistant') {
    const actions = getRecommendations(evaluateAssessment(state.answers), state.context);
    state.activeAction = actions.find(r => !state.skipped.includes(r.id))?.id ?? actions[0]?.id ?? null;
    go('assistant'); return;
  }
  if (action === 'select-action') { state.activeAction = id; notice = ''; render(); return; }
  if (action === 'skip') {
    state.skipped = [...new Set([...state.skipped, id])];
    state.activeAction = null; notice = 'Действие отложено. Ответ и индекс риска не изменились.'; render(); return;
  }
  if (action === 'confirm-change') {
    const selected = main.querySelector('input[name="verification"]:checked');
    if (!selected) return;
    const previous = evaluateAssessment(state.answers).score;
    state.answers = replaceAnswer(state.answers, id, selected.value);
    const current = evaluateAssessment(state.answers).score;
    state.skipped = state.skipped.filter(x => x !== id);
    const actions = getRecommendations(evaluateAssessment(state.answers), state.context);
    state.activeAction = actions.find(r => r.id !== id && !state.skipped.includes(r.id))?.id ?? actions.find(r => r.id === id)?.id ?? null;
    notice = previous === current ? `Ответ уточнён. Индекс остался ${current} из 100.` : `Ответ уточнён: ${previous} → ${current} из 100. Изменение подтверждено вами.`;
    render(); return;
  }
  if (action === 'disconnect') { showDialog('Вы уже отключились от этой сети?', '<p>WiFiGuard не управляет Wi-Fi. Сначала отключитесь в настройках устройства, затем подтвердите действие. Оценка завершится с сохранением последнего балла, без искусственного снижения до нуля.</p><div class="dialog-actions"><button class="button button-danger" data-action="confirm-disconnect">Я отключился — завершить оценку</button><button class="button button-outline" data-action="close-dialog">Вернуться к плану</button></div>'); return; }
  if (action === 'confirm-disconnect') { dialog.close(); go('ended'); return; }
  if (action === 'new') { showDialog('Начать новую оценку?', '<p>Текущие ответы, исходный результат и прогресс помощника будут удалены из этой вкладки.</p><div class="dialog-actions"><button class="button" data-action="confirm-new">Начать новую оценку</button><button class="button button-outline" data-action="close-dialog">Продолжить текущую</button></div>'); return; }
  if (action === 'confirm-new') { dialog.close(); startNew(); }
});
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
render(false);
