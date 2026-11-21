import { QUESTIONS } from './data.js';

export function riskLevel(score) {
  if (!Number.isFinite(score) || score < 0 || score > 100) throw new RangeError('Балл должен быть от 0 до 100');
  if (score < 25) return { id: 'low', label: 'Низкий риск', text: 'Основные меры соблюдены. Сохраняйте внимание к сайту и поведению сети.' };
  if (score < 50) return { id: 'moderate', label: 'Умеренный риск', text: 'Есть условия, которые стоит проверить или изменить перед важными действиями.' };
  if (score < 75) return { id: 'high', label: 'Высокий риск', text: 'Сначала разберитесь с факторами риска. Для важных данных выберите доверенное подключение.' };
  return { id: 'critical', label: 'Критический риск', text: 'Приостановите передачу данных и начните с критических предупреждений ниже.' };
}

export function evaluateAssessment(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new TypeError('Нужен объект ответов');
  const factors = QUESTIONS.map(q => {
    const selected = q.options.find(o => o.id === answers[q.id]);
    if (!selected) throw new TypeError(`Нет допустимого ответа: ${q.id}`);
    return { id: q.id, name: q.short, weight: q.weight, answer: selected.id, label: selected.label, severity: selected.severity, contribution: q.weight * selected.severity, critical: selected.critical, unknown: selected.id === 'unknown' };
  });
  const baseScore = Math.round(factors.reduce((sum, f) => sum + f.contribution, 0));
  const criticalSigns = factors.filter(f => f.critical).map(f => f.id);
  const score = Math.max(baseScore, criticalSigns.length ? 75 : 0);
  return { score, baseScore, level: riskLevel(score), factors, criticalSigns, unknownCount: factors.filter(f => f.unknown).length, floorApplied: score > baseScore };
}

export function replaceAnswer(answers, id, value) {
  const q = QUESTIONS.find(q => q.id === id);
  if (!q || !q.options.some(o => o.id === value)) throw new TypeError('Недопустимое изменение ответа');
  return { ...answers, [id]: value };
}
