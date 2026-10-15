import {chromium,expect} from '@playwright/test';
import {mkdtemp,readFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {startStaticServer} from './serve.mjs';
import {mkdir} from 'node:fs/promises';
const root=fileURLToPath(new URL('.',import.meta.url));
const output=await mkdtemp('/tmp/omf-auditor-browser-');
const profile=await mkdtemp(output+'/profile-');
await mkdir(output+'/home');await mkdir(output+'/tmp');
let server;
const context=await chromium.launchPersistentContext(profile,{
  ...(process.env.OMF_CHROMIUM_EXECUTABLE?{executablePath:process.env.OMF_CHROMIUM_EXECUTABLE}:{}),
  headless:true,viewport:{width:1512,height:982},acceptDownloads:true,
  env:{PATH:process.env.PATH,HOME:output+'/home',TMPDIR:output+'/tmp'},
  args:['--disable-background-networking','--no-first-run','--disable-crash-reporter','--crash-dumps-dir='+output]
});
const page=context.pages()[0]||await context.newPage(),errors=[],network=[];
const watchPage=p=>{p.on('dialog',dialog=>dialog.accept());p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});};
context.pages().forEach(watchPage);context.on('page',watchPage);
const check=(label)=>console.log('PASS '+label);
async function importText(name,text) {
  await page.locator('#file-input').setInputFiles({name,mimeType:'application/yaml',buffer:Buffer.from(text)});
  await expect(page.locator('#busy')).toBeHidden();
}
try {
  await context.setOffline(true);
  await page.goto(pathToFileURL(root+'/omf-auditor.html').href);
  await expect(page.locator('main h1')).toContainText('一次连贯审查');
  await page.screenshot({path:output+'/preview-welcome.png'});
  check('standalone HTML opens with browser offline');
  await page.locator('main [data-action="demo"]').click();
  await expect(page.locator('#file-count')).toHaveText('7');
  await expect(page.locator('#issue-count')).toHaveText('0');
  await expect(page.locator('main h1')).toHaveText('合同');
  await expect(page.locator('#review-note')).toBeEnabled();
  await page.locator('main .record-card').filter({hasText:'提交合同'}).first().locator('summary').click();
  await expect(page.locator('main .record-card[open]')).toContainText('前置条件');
  await page.screenshot({path:output+'/preview-object.png'});
  check('demo import, object aggregation and lazy linked definition');
  const readingLink=page.locator('main .record-card[open]').first().locator('.card-actions a[data-go]');
  await readingLink.scrollIntoViewIfNeeded();
  const readingOffset=await readingLink.evaluate(el=>el.getBoundingClientRect().top-document.querySelector('main').getBoundingClientRect().top);
  await readingLink.click();await expect(page.locator('main h1')).toHaveText('提交合同');
  await expect(page.locator('main')).toHaveAttribute('aria-busy','false');
  await page.goBack();await expect(page.locator('main h1')).toHaveText('合同');
  await expect(page.locator('main')).toHaveAttribute('aria-busy','false');
  await expect.poll(()=>readingLink.evaluate(el=>Math.abs(el.getBoundingClientRect().top-document.querySelector('main').getBoundingClientRect().top-readingOffset))).toBeLessThan(2);
  check('Back restores the expanded card and actual clicked-anchor viewport position');
  await page.locator('#search').fill('RULE-CONTRACT-CLOSE');
  await expect(page.locator('.nav-record')).toHaveCount(1);
  await page.locator('.nav-record').click();
  await expect(page.locator('main h1')).toHaveText('收款足额校验');
  await page.locator('main .field').filter({has:page.locator('dt',{hasText:'规则表达式'})}).first().locator('dt .source-link').first().click();
  await expect(page.locator('.source-meta code')).toContainText('expression');
  await expect(page.locator('.source-line.highlight').first()).toContainText('expression: |');
  await page.locator('#review-status').selectOption('changes');
  await page.locator('#review-note').fill('请确认累计收款与本次收款的口径。');
  const downloading=page.waitForEvent('download');
  await page.locator('.header-actions [data-action="export"]').click();
  const download=await downloading;await download.saveAs(output+'/review-export-test.json');
  const report=JSON.parse(await readFile(output+'/review-export-test.json','utf8'));
  await page.locator('#save-export').click();
  assert.equal(report.reviews.find(r=>r.id==='RULE-CONTRACT-CLOSE').status,'changes');
  assert.match(report.files[0].sha256,/^[a-f0-9]{64}$/);
  check('search, exact source navigation, notes and JSON export');
  await page.locator('#search').fill('');
  await page.locator('.nav-record').filter({hasText:'收款驱动合同关闭'}).click();
  await expect(page.locator('main .step')).toHaveCount(4);
  await page.screenshot({path:output+'/preview-scenario.png'});
  await page.locator('[data-tab="refs"]').click();
  await expect(page.locator('main .reference-row')).not.toHaveCount(0);
  await page.locator('[data-page="matrix"]').click();
  await expect(page.locator('#matrix-body')).toContainText('OWN');
  await page.locator('[data-page="files"]').click();
  await expect(page.locator('.file-card')).toHaveCount(7);
  check('scenario steps, reference panel, permission matrix and file inventory');
  await importText('broken.yaml','behaviors: [');
  await expect(page.locator('#banner.error')).toContainText('当前工作区未改动');
  await expect(page.locator('#file-count')).toHaveText('7');
  await importText('missing.yaml','behaviors: [{id: Broken, name: 缺失对象, ownerEntity: NOT-IMPORTED}]');
  await expect(page.locator('#file-count')).toHaveText('8');
  await page.locator('[data-page="issues"]').click();
  await expect(page.locator('main')).toContainText('NOT-IMPORTED');
  check('failed import is atomic; appended missing references are visible');
  await importText('hostile.yaml','aggregates: [{id: hostile, name: "<img src=x onerror=alert(1)>", lifecycle: [draft]}]');
  await page.locator('#search').fill('hostile');
  await page.locator('.nav-record').click();
  await expect(page.locator('main h1')).toHaveText('<img src=x onerror=alert(1)>');
  assert.equal(await page.locator('main img').count(),0);
  check('imported markup is inert text');
  await page.setViewportSize({width:390,height:844});
  await page.locator('#source-toggle').click();
  await page.screenshot({path:output+'/preview-mobile.png'});
  assert.deepEqual(network,[]);assert.deepEqual(errors,[]);
  console.log('PASS no external network requests; no uncaught browser errors');
  // Native-browser release gate; intentionally separate from the JSDOM/worker_threads substitute.
  await context.setOffline(false);server=await startStaticServer();
  const shared=await context.newPage();await shared.goto(server.url);
  await shared.locator('main [data-action="demo"]').click();await expect(shared.locator('main h1')).toHaveText('合同');
  const originURL=shared.url(),originText=await shared.locator('main').innerText();
  const opened=context.waitForEvent('page');
  await shared.locator('.nav-record').first().click({modifiers:['ControlOrMeta']});
  const joined=await opened;await joined.waitForLoadState();await expect(joined.locator('main h1')).toHaveText('合同');
  assert.equal(shared.url(),originURL);assert.equal(await shared.locator('main').innerText(),originText);
  await shared.close();await expect(joined.locator('#review-note')).toBeEnabled();
  await joined.locator('#review-note').fill('创建页关闭后继续审阅');await expect(joined.locator('#sync-status')).toHaveText('已同步');
  const getting=joined.waitForEvent('download');await joined.locator('.header-actions [data-action="export"]').click();
  const complete=await getting;await complete.saveAs(output+'/shared-review.json');
  const v2=JSON.parse(await readFile(output+'/shared-review.json','utf8'));assert.equal(v2.format,'omf-auditor-review-v2');assert.equal(v2.completeness.complete,true);
  await joined.locator('#save-export').click();await expect(joined.locator('#export-status')).toHaveText('无未导出审阅');
  check('native modified link, SharedWorker join, creator close, continued editing and explicit saved download');
} catch(error) {
  console.error('BROWSER ERRORS',errors);
  console.error((await page.locator('body').innerText()).slice(0,4000));
  await page.screenshot({path:output+'/test-failure.png'});
  throw error;
} finally {await context.close();await server?.close();}
