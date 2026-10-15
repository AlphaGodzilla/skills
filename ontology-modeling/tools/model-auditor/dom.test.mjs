import {JSDOM,VirtualConsole,ResourceLoader} from 'jsdom';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {installDOMPrimitives} from './dom-runtime.test-helper.mjs';
const htmlPath=fileURLToPath(new URL('./omf-auditor.html',import.meta.url));
const html=await readFile(htmlPath,'utf8'),output=await mkdtemp('/tmp/omf-auditor-dom-');
const errors=[],requests=[],downloads=[];
class NoNetwork extends ResourceLoader {fetch(url) {requests.push(url);throw new Error('Network prohibited: '+url);}}
const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>errors.push(e.message));
let acceptConfirm=true;
const dom=new JSDOM(html,{url:pathToFileURL(htmlPath).href,
  runScripts:'dangerously',resources:new NoNetwork(),pretendToBeVisual:true,virtualConsole,
  beforeParse(w) {
    installDOMPrimitives(w);
    w.confirm=()=>acceptConfirm;
    w.URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:local-review';};
    w.URL.revokeObjectURL=()=>{};
    w.HTMLAnchorElement.prototype.click=function(){if(!this.download)this.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));};
  }});
const {window:w}=dom,d=w.document,$=s=>d.querySelector(s),$$=s=>[...d.querySelectorAll(s)];
const sleep=()=>new Promise(resolve=>setTimeout(resolve,10));
async function until(fn) {for(let i=0;i<150;i++){if(fn())return;await sleep();}throw new Error('Condition timed out');}
async function settle(){await sleep();await until(()=>$('main').getAttribute('aria-busy')!=='true'&&$('#record-list').getAttribute('aria-busy')!=='true'&&$('#busy').hidden&&!$('button:disabled'));await sleep();}
const click=async selector=>{assert.ok($(selector),'Missing '+selector);$(selector).click();await settle();};
async function input(selector,value){const el=$(selector);assert.ok(el);if(selector.startsWith('#review-'))await until(()=>!el.disabled);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));await settle();}
async function importFile(name,text) {
  const el=$('#file-input');
  Object.defineProperty(el,'files',{value:[new File([text],name)],configurable:true});
  el.dispatchEvent(new w.Event('change',{bubbles:true}));await until(() => $('#busy').hidden);await settle();
}
const check=label=>console.log('PASS '+label);
try {
  await until(()=>{if($('#banner.error'))throw new Error($('#banner.error').textContent);return $('main h1')&&$('main').getAttribute('aria-busy')==='false';});
  assert.match($('main h1').textContent,/一次连贯审查/);
  check('single embedded HTML boots without external resource requests');
  await click('main [data-action="demo"]');
  await until(() => $('#file-count').textContent==='7');
  assert.equal($('#issue-count').textContent,'0');assert.equal($('main h1').textContent,'合同');
  const card=$$('main .record-card').find(el=>el.textContent.includes('提交合同'));
  card.open=true;await until(()=>card.dataset.loaded==='1');
  assert.match(card.textContent,/前置条件/);
  check('demo import and object aggregated card lazy expansion');
  await input('#search','RULE-CONTRACT-CLOSE');assert.equal($$('.nav-record').length,1);
  await click('.nav-record');assert.equal($('main h1').textContent,'收款足额校验');
  const expression=$$('main .field').find(el=>el.querySelector('dt')?.textContent.includes('规则表达式'));
  expression.querySelector('.source-link').click();
  await settle();
  assert.match($('.source-meta code').textContent,/expression/);
  assert.match($('.source-line.highlight').textContent,/expression: \|/);
  await input('#review-status','changes');await input('#review-note','请确认收款口径。');
  await click('.header-actions [data-action="export"]');await sleep();
  const report=JSON.parse(await downloads[0].text());
  assert.equal(report.reviews.find(r=>r.id==='RULE-CONTRACT-CLOSE').status,'changes');
  assert.match(report.files[0].sha256,/^[a-f0-9]{64}$/);
  await click('#save-export');
  check('search, source line navigation, note editing and exported fingerprints');
  await input('#search','');$$('.nav-record').find(el=>el.textContent.includes('收款驱动合同关闭')).click();
  await settle();
  assert.equal($$('main .step').length,4);await click('[data-tab="refs"]');
  assert.ok($$('main .reference-row').length>0);
  await click('[data-page="matrix"]');assert.match($('#matrix-body').textContent,/OWN/);
  await click('[data-page="files"]');assert.equal($$('.file-card').length,7);
  check('scenario steps, reference navigation, permission matrix, file inventory');
  await importFile('broken.yaml','behaviors: [');
  assert.match($('#banner.error').textContent,/当前工作区未改动/);
  assert.equal($('#file-count').textContent,'7');
  await importFile('missing.yaml','behaviors: [{id: Broken, ownerEntity: NOT-IMPORTED}]');
  assert.equal($('#file-count').textContent,'8');await click('[data-page="issues"]');
  assert.match($('main').textContent,/NOT-IMPORTED/);
  check('failed import rollback and progressive append with missing reference warnings');
  await importFile('hostile.yaml','aggregates: [{id: hostile, name: "<img src=x onerror=alert(1)>", lifecycle: [draft]}]');
  await input('#search','hostile');await click('.nav-record');
  assert.equal($('main h1').textContent,'<img src=x onerror=alert(1)>');assert.equal($$('main img').length,0);
  check('untrusted model markup rendered as text');
  await input('#review-note','unexported');acceptConfirm=false;
  await importFile('cancelled.yaml','rules: [{id: Cancel}]');
  assert.equal($('#file-count').textContent,'9');assert.equal($('#review-note').value,'unexported');
  acceptConfirm=true;
  check('unsaved review confirmation can cancel import without losing notes');
  const attributes=Array.from({length:60},(_,i)=>`      - {name: attr${i}, type: String}`).join('\n');
  const behaviors=Array.from({length:130},(_,i)=>`  - {id: BIG_B${i}, ownerEntity: BIG, name: BIG 行为${i}}`).join('\n');
  await importFile('large.yaml',`aggregates:\n  - id: BIG\n    name: BIG 对象\n    lifecycle: [draft]\n    attributes:\n${attributes}\nbehaviors:\n${behaviors}\n`);
  await input('#search','BIG');assert.equal($$('.nav-record').length,100);
  await click('[data-action="more-list"]');assert.equal($$('.nav-record').length,131);
  $$('.nav-record').find(el=>el.textContent.includes('BIG 对象')).click();
  await settle();
  assert.equal($$('main .record-card').length,40);
  await click('[data-context-more]');assert.equal($$('main .record-card').length,80);
  await click('[data-context-more]');await click('[data-context-more]');assert.equal($$('main .record-card').length,130);
  const attrs=$$('main .field').find(el=>el.querySelector('dt')?.textContent.includes('属性'));
  attrs.querySelector('[data-more]').click();await settle();attrs.querySelector('[data-more]').click();await settle();
  assert.equal(attrs.querySelectorAll('.list-row').length,60);
  await click('[data-tab="refs"]');assert.equal($$('main .reference-row').length,80);
  await click('[data-incoming-more]');assert.equal($$('main .reference-row').length,130);
  await click('[data-source-page="120"]');assert.equal($('#line-input').value,'121');
  await input('#line-input','5');await click('[data-action="line"]');assert.equal($('#line-input').value,'5');
  check('sidebar, object context, nested arrays, incoming references and source all paginate without loss');
  await click('#inspector [data-action="source"]');assert.ok($('#workspace').classList.contains('hide-inspector'));
  await click('#source-toggle');assert.ok(!$('#workspace').classList.contains('hide-inspector'));
  check('source drawer has an accessible close button and can reopen');
  assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
  check('zero external resource requests and zero uncaught DOM errors');
  await writeFile(output+'/dom-test-result.json',JSON.stringify({passed:true,requests,errors,definitions:$('#model-count').textContent},null,2));
} catch(error){console.error('DOM STATE', $('#banner')?.textContent, $('main')?.textContent.slice(0,300),errors);throw error;} finally {w.dispatchEvent(new w.Event('pagehide'));w.close();}
