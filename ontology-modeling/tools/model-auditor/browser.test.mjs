import {chromium,expect} from '@playwright/test';
import {mkdtemp,readFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('.',import.meta.url));
const output=await mkdtemp('/tmp/omf-auditor-browser-');
const profile=await mkdtemp(output+'/profile-');
const context=await chromium.launchPersistentContext(profile,{
  ...(process.env.OMF_CHROMIUM_EXECUTABLE?{executablePath:process.env.OMF_CHROMIUM_EXECUTABLE}:{}),
  headless:true,viewport:{width:1512,height:982},acceptDownloads:true,
  args:['--disable-background-networking','--no-first-run','--disable-crash-reporter','--crash-dumps-dir='+output]
});
const page=context.pages()[0]||await context.newPage(),errors=[],network=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if (/^https?:/.test(r.url())) network.push(r.url());});
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
  await page.locator('main .record-card').filter({hasText:'提交合同'}).first().locator('summary').click();
  await expect(page.locator('main .record-card[open]')).toContainText('前置条件');
  await page.screenshot({path:output+'/preview-object.png'});
  check('demo import, object aggregation and lazy linked definition');
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
} catch(error) {
  console.error('BROWSER ERRORS',errors);
  console.error((await page.locator('body').innerText()).slice(0,4000));
  await page.screenshot({path:output+'/test-failure.png'});
  throw error;
} finally {await context.close();}
