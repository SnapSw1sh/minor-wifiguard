// Optional browser QA: supply PLAYWRIGHT_MODULE and CHROME_PATH when using a system runtime.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { QUESTIONS } from '../dist/src/data.js';
const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const browser = await chromium.launch({ headless:true, ...(process.env.CHROME_PATH ? { executablePath:process.env.CHROME_PATH } : {}) });
const output = fileURLToPath(new URL('../artifacts/',import.meta.url));
await mkdir(output,{ recursive:true });
const context = await browser.newContext({ viewport:{ width:1366,height:940 },locale:'ru-RU' });
const page = await context.newPage();
const errors = [];
const requests = [];
page.on('pageerror',error => errors.push(error.message));
page.on('request',request => requests.push(request.url()));
const url = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const action = name => page.locator(`[data-action="${name}"]:visible`).first();
const score = async expected => assert.equal(await page.locator('.risk-gauge strong').first().innerText(),String(expected));
const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Horizontal page overflow');
async function preset(id) { await action('examples').click(); await page.locator(`dialog [data-action="preset"][data-id="${id}"]`).click(); }
async function confirm(id,value) {
  await page.locator(`[data-action="select-action"][data-id="${id}"]`).click();
  await page.locator('.verification label').filter({ has:page.locator(`input[value="${value}"]`) }).click();
  await action('confirm-change').click();
}
try {
  await page.goto(url);
  await page.waitForSelector('.hero');
  assert.equal(await page.locator('input[name="device"]').count(),4);
  await page.locator('label.device-card').filter({ has:page.locator('input[value="macos"]') }).click();
  await noOverflow();
  await page.screenshot({ path:`${output}/home-desktop.png`,fullPage:true });
  await action('start').click();
  assert.equal(await action('next').isDisabled(),true);
  for (let i=0;i<QUESTIONS.length;i++) {
    await page.locator('label.option').filter({ has:page.locator('input[value="unknown"]') }).click();
    if (i===0) {
      await page.screenshot({ path:`${output}/survey-desktop.png`,fullPage:true });
      await page.reload();
      assert.equal(await page.locator('input[value="unknown"]').isChecked(),true);
    }
    await action('next').click();
  }
  await score(50);
  assert.ok((await page.locator('.context-chips').innerText()).includes('macOS'));
  assert.ok((await page.locator('.advice-panel').innerText()).includes('Общий доступ к файлам'));
  await action('assistant').click();
  for (const [id,expected] of [['encryption','Подробнее'],['updates','Safari обновляется вместе с macOS'],['autojoin','Автоматически подключаться к этой сети']]) {
    await page.locator(`[data-action="select-action"][data-id="${id}"]`).click();
    assert.ok((await page.locator('.instruction-list').innerText()).includes(expected));
  }
  await page.reload();
  assert.ok((await page.locator('.context-chips').innerText()).includes('macOS'));
  await page.screenshot({ path:`${output}/macos-assistant-desktop.png`,fullPage:true });
  await action('result').click();
  await action('edit').click();
  assert.equal(await page.locator('input[value="unknown"]').isChecked(),true);
  await page.locator('label.option').filter({ has:page.locator('input[value="verified"]') }).click();
  await action('next').click();
  await action('previous').click();
  assert.equal(await page.locator('input[value="verified"]').isChecked(),true);
  for(let i=0;i<QUESTIONS.length;i++) await action('next').click();
  await score(43);
  await preset('cafe'); await score(43);
  await page.screenshot({ path:`${output}/result-desktop.png`,fullPage:true });
  await action('assistant').click();
  await page.locator('[data-action="select-action"][data-id="encryption"]').click();
  assert.equal(await action('confirm-change').isDisabled(),true);
  await action('skip').click();
  assert.ok((await page.locator('.assistant-score').innerText()).includes('43'));
  await confirm('identity','verified');
  await confirm('updates','current');
  await confirm('autojoin','off');
  await confirm('vpn','active');
  await page.reload();
  assert.ok((await page.locator('.assistant-score').innerText()).includes('10'));
  await page.screenshot({ path:`${output}/assistant-desktop.png`,fullPage:true });
  await action('result').click(); await score(10);
  assert.ok((await page.locator('.comparison').innerText()).includes('Было 43 → стало 10'));
  await preset('airport'); await score(75);
  assert.ok(await page.locator('.critical-box').isVisible());
  await action('assistant').click();
  assert.equal(await page.locator('.assistant-card').getAttribute('data-current'),'portal');
  await action('disconnect').click(); await action('confirm-disconnect').click();
  assert.ok((await page.locator('.ended-score').innerText()).includes('75'));
  await page.reload(); assert.ok(await page.locator('.ended-card').isVisible());
  await preset('mall'); await score(0);
  await action('assistant').click(); assert.ok((await page.locator('.empty-state').innerText()).includes('Все изменения учтены'));
  await action('new').click(); await action('confirm-new').click();
  assert.ok(await page.locator('.hero').isVisible());
  assert.ok(!await page.locator('.resume-banner').count());
  await page.setViewportSize({ width:375,height:812 });
  for (const width of [320,375,768,1024]) {
    await page.setViewportSize({ width,height:812 });
    await noOverflow();
    assert.ok(await page.locator('label.device-card').filter({ has:page.locator('input[value="macos"]') }).isVisible());
  }
  await page.setViewportSize({ width:375,height:812 });
  await noOverflow();
  await page.screenshot({ path:`${output}/home-mobile.png`,fullPage:true });
  await preset('airport'); await noOverflow();
  await page.screenshot({ path:`${output}/result-mobile.png`,fullPage:true });
  await action('assistant').click(); await noOverflow();
  await page.screenshot({ path:`${output}/assistant-mobile.png`,fullPage:true });
  await page.locator('.assistant-sidebar [data-action="method"]').click(); assert.ok(await page.locator('dialog').isVisible());
  await page.keyboard.press('Escape'); assert.equal(await page.locator('dialog').isVisible(),false);
  await action('result').click();
  await action('new').click(); await action('confirm-new').click();
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => document.activeElement !== document.body));
  await page.evaluate(() => sessionStorage.setItem('wifiguard.session.v1','{"view":"<script>"}'));
  await page.reload(); assert.ok(await page.locator('.hero').isVisible());
  const blocked = await browser.newContext({ viewport:{ width:390,height:844 } });
  await blocked.addInitScript(() => Object.defineProperty(window,'sessionStorage',{ get(){throw new Error('Storage blocked for test');} }));
  const blockedPage = await blocked.newPage(); await blockedPage.goto(url);
  await blockedPage.waitForSelector('.memory-note');
  await blockedPage.locator('[data-action="start"]').click();
  assert.ok(await blockedPage.locator('.question-panel').isVisible());
  await blocked.close();
  assert.deepEqual(errors,[]);
  assert.ok(requests.every(request => new URL(request).origin === new URL(url).origin), 'Unexpected external request');
  console.log('Browser QA passed: four device choices, macOS guidance/persistence, full questionnaire, edits, skip, 43→10, critical 75, disconnect, safe 0, reset, keyboard, corrupt/blocked storage, desktop/mobile, no external requests.');
  console.log(`Screenshots: ${output}`);
} finally { await browser.close(); }
