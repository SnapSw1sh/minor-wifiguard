import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, PRESETS, DEVICES } from '../dist/src/data.js';
import { evaluateAssessment, replaceAnswer, riskLevel } from '../dist/src/assessment.js';
import { getRecommendations, contextAdvice } from '../dist/src/guidance.js';

const safe = Object.fromEntries(QUESTIONS.map(q => [q.id, q.options.find(o => o.severity === 0).id]));
const risky = Object.fromEntries(QUESTIONS.map(q => [q.id, q.options.find(o => o.severity === 1).id]));
test('Safe, unsafe and unknown profiles have the agreed results', () => {
  assert.equal(evaluateAssessment(safe).score, 0);
  assert.equal(evaluateAssessment(risky).score, 100);
  const unknown = evaluateAssessment(Object.fromEntries(QUESTIONS.map(q => [q.id, 'unknown'])));
  assert.equal(unknown.score, 50);
  assert.equal(unknown.unknownCount, 8);
  assert.equal(unknown.criticalSigns.length, 0);
});
test('Level boundaries are inclusive and exhaustive', () => {
  for (const [score, level] of [[0,'low'],[24,'low'],[25,'moderate'],[49,'moderate'],[50,'high'],[74,'high'],[75,'critical'],[100,'critical']]) assert.equal(riskLevel(score).id, level);
  for (const score of [-1,101,NaN,Infinity]) assert.throws(() => riskLevel(score), RangeError);
});
test('A single critical sign cannot be diluted by safe answers', () => {
  for (const [id, answer, contribution] of [['portal','suspicious',15],['certificate','proceed',20]]) {
    const result = evaluateAssessment({ ...safe, [id]: answer });
    assert.equal(result.score, 75);
    assert.equal(result.baseScore, contribution);
    assert.equal(result.floorApplied, true);
    assert.deepEqual(result.criticalSigns, [id]);
  }
  assert.equal(evaluateAssessment({ ...safe, portal:'suspicious', certificate:'proceed' }).score,75);
});
test('Only the total is rounded; public Wi-Fi is compatible with protected HTTPS', () => {
  assert.equal(evaluateAssessment({ ...safe, identity:'unknown', vpn:'unknown' }).score,10);
  assert.equal(evaluateAssessment({ ...safe, encryption:'open' }).score,10);
  assert.equal(evaluateAssessment({ ...safe, vpn:'off' }).score,5);
});
test('All combinations stay bounded; making an answer safer never increases score', () => {
  let examined = 0;
  function visit(index, answers) {
    if (index === QUESTIONS.length) {
      const result = evaluateAssessment(answers);
      assert.ok(result.score >= 0 && result.score <= 100);
      assert.ok(Number.isInteger(result.score));
      for (const q of QUESTIONS) {
        const better = replaceAnswer(answers,q.id,safe[q.id]);
        assert.ok(evaluateAssessment(better).score <= result.score, q.id);
      }
      examined++; return;
    }
    const q = QUESTIONS[index];
    for (const o of q.options) visit(index+1, { ...answers, [q.id]:o.id });
  }
  visit(0,{});
  assert.equal(examined,11664);
});
test('Missing or invented answers are rejected, not scored as safe', () => {
  for (const value of [null,[],{}, { ...safe, vpn:'invented' }]) assert.throws(() => evaluateAssessment(value), TypeError);
  assert.throws(() => replaceAnswer(safe,'unknown','off'),TypeError);
  assert.throws(() => replaceAnswer(safe,'vpn','invented'),TypeError);
});
test('Examples are reproducible, and changing a factor preserves the baseline', () => {
  assert.deepEqual(PRESETS.map(p => evaluateAssessment(p.answers).score),[43,75,0]);
  const baseline = { ...PRESETS[0].answers };
  let current = replaceAnswer(baseline,'identity','verified');
  current = replaceAnswer(current,'updates','current');
  current = replaceAnswer(current,'autojoin','off');
  current = replaceAnswer(current,'vpn','active');
  assert.equal(evaluateAssessment(current).score,10);
  assert.equal(evaluateAssessment(baseline).score,43);
  assert.equal(baseline.identity,'unknown');
});
test('Guidance prioritizes critical signs and covers each supported OS', () => {
  for (const device of DEVICES) {
    const context = { place:'cafe', device:device.id, purpose:'work' };
    const recommendations = getRecommendations(evaluateAssessment(risky),context);
    assert.equal(recommendations[0].critical,true);
    assert.ok(recommendations.every(r => r.steps.length === 3 && r.steps.every(s => typeof s === 'string' && s.length > 30)));
    assert.ok(contextAdvice(context).messages.some(s => s.includes('политику организации')));
  }
  assert.deepEqual(getRecommendations(evaluateAssessment(safe),PRESETS[0].context),[]);
});
