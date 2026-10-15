import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Worker,MessageChannel} from 'node:worker_threads';
import {webcrypto} from 'node:crypto';
import {installDOMPrimitives} from './dom-runtime.test-helper.mjs';
import {decodeRoute} from './navigation.js';
import {JSDOM,VirtualConsole,ResourceLoader} from 'jsdom';
const html=await readFile(new URL('./omf-auditor.html',import.meta.url),'utf8');
const hostURL=new URL('./workspace-host.js',import.meta.url).href;
const delay=()=>new Promise(r=>setTimeout(r,10));
async function until(fn,label='condition'){for(let i=0;i<500;i++){if(fn())return;await delay();}throw new Error('Timeout: '+label);}
// Integration substitute: bundled HTML + JSDOM + real MessageChannels and worker_threads host.
// It does not test native SharedWorker, CSP, tab activation, or browser download behavior.
async function harness(){
  const worker=new Worker(`const {parentPort}=require('node:worker_threads');let hosts=new Map();parentPort.on('message',async m=>{const {createWorkspaceHost}=await import(${JSON.stringify(hostURL)});let host=hosts.get(m.name);if(!host){host=createWorkspaceHost({buildId:m.buildId,workspaceId:m.workspaceId,barrierTimeoutMs:1500});hosts.set(m.name,host);}host.attachPort(m.port);});`,{eval:true});
  const pages=[],errors=[],downloads=[],nativeClicks=[],workers=[];
  function open(url='http://127.0.0.1:8000/',options={}){
    const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!e.message.includes('navigation (except hash changes)'))errors.push(e.message);});
    class NoNetwork extends ResourceLoader {fetch(url){throw new Error('Unexpected network: '+url);}}
    const dom=new JSDOM(html,{url,runScripts:'dangerously',resources:new NoNetwork(),pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
      installDOMPrimitives(w);
      w.confirm=()=>true;w.URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:test';};w.URL.revokeObjectURL=()=>{};
      w.HTMLAnchorElement.prototype.click=function(){if(!this.download)this.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));};
      w.SharedWorker=class extends w.EventTarget {constructor(script,{name}){super();const [,buildId,workspaceId]=name.split(':');const channel=new MessageChannel();this.port=channel.port1;workers.push(name);if(options.delay){const add=this.port.addEventListener.bind(this.port);this.port.addEventListener=(type,listener)=>add(type,type==='message'?event=>{const ms=options.delay(event.data);if(ms)setTimeout(()=>listener(event),ms);else listener(event);}:listener);}worker.postMessage({name,buildId,workspaceId,port:channel.port2},[channel.port2]);}};
    }});pages.push(dom);dom.window.addEventListener('click',e=>{if((e.metaKey||e.ctrlKey||e.altKey||e.shiftKey||e.button===1)&&e.target.closest('a[href]')){nativeClicks.push({prevented:e.defaultPrevented,href:e.target.closest('a').href});e.preventDefault();}});return dom.window;
  }
  return {open,errors,downloads,nativeClicks,workers,async close(){for(const p of pages){p.window.dispatchEvent(new p.window.Event('pagehide'));p.window.close();}await worker.terminate();}};
}
const click=(w,s)=>{const el=w.document.querySelector(s);assert.ok(el,'Missing '+s);el.click();};
const input=(w,s,value)=>{const el=w.document.querySelector(s);assert.ok(el);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));};
const q=(w,s)=>w.document.querySelector(s);
async function ready(w){await until(()=>q(w,'[data-page="files"][href]')&&q(w,'main').getAttribute('aria-busy')!=='true','ready');}
async function demo(w){await ready(w);click(w,'main [data-action="demo"]');await until(()=>q(w,'main h1')?.textContent==='合同'&&q(w,'main').getAttribute('aria-busy')==='false'&&q(w,'#busy').hidden,'demo ready');}
async function editable(w){await until(()=>q(w,'#review-note')&&!q(w,'#review-note').disabled&&q(w,'main').getAttribute('aria-busy')==='false','editor');}
async function importText(w,name,text){const el=q(w,'#file-input');Object.defineProperty(el,'files',{value:[new File([text],name)],configurable:true});el.dispatchEvent(new w.Event('change',{bubbles:true}));await Promise.resolve();await until(()=>q(w,'#busy').hidden,'import completes');}

test('shared UI: real links join without import, modified clicks leave the origin unchanged, creator may leave',async()=>{
  const h=await harness();try{
    const a=h.open();await until(()=>{const error=a.document.querySelector('#banner.error');if(error)throw new Error(error.textContent);return a.document.querySelector('[data-page="files"][href]');},'navigation links');
    click(a,'main [data-action="demo"]');await until(()=>a.document.querySelector('#model-count').textContent!=='0','demo');
    await until(()=>a.document.querySelector('main h1')?.textContent==='合同','object');
    const link=a.document.querySelector('.nav-record[href]');assert.ok(link);
    const before=a.location.href,main=a.document.querySelector('main');main.scrollTop=123;
    for(const modifiers of [{metaKey:true},{ctrlKey:true},{shiftKey:true},{altKey:true},{button:1}]){
      link.dispatchEvent(new a.MouseEvent('click',{bubbles:true,cancelable:true,...modifiers}));
      assert.equal(a.location.href,before);assert.equal(main.scrollTop,123);
    }
    const b=h.open(link.href);await until(()=>b.document.querySelector('main h1')?.textContent==='合同','join');
    assert.equal(decodeRoute(b.location.hash).datasetVersion,1);assert.equal(b.document.querySelector('#model-count').textContent,a.document.querySelector('#model-count').textContent);
    a.dispatchEvent(new a.Event('pagehide'));a.close();
    await until(()=>!b.document.querySelector('#review-note')?.disabled,'editable');
    input(b,'#review-note','B continues');await until(()=>b.document.querySelector('#sync-status')?.textContent==='已同步'&&b.document.querySelector('#export-status')?.textContent==='尚未导出','review');
    assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});

test('shared UI: every navigation class has canonical href; modified handoff never navigates or focuses origin',async()=>{
  const h=await harness();try{
    const a=h.open();await demo(a);const seen=new Set();a.open=()=>{throw new Error('window.open forbidden');};a.focus=()=>{throw new Error('focus forbidden');};
    async function inspect(){
      const links=[...a.document.querySelectorAll('a[data-go],a[data-source],a[data-tab],a[data-page]')];
      for(const link of links){assert.ok(link.href);const route=decodeRoute(link.hash);assert.equal(route.workspaceId,decodeRoute(a.location.hash).workspaceId);
        for(const name of ['go','source','tab','page'])if(link.dataset[name])seen.add(name);
        const before=a.location.href,main=q(a,'main'),scroll=main.scrollTop;
        for(const modifiers of [{metaKey:true},{ctrlKey:true},{altKey:true},{shiftKey:true},{button:1}])link.dispatchEvent(new a.MouseEvent('click',{bubbles:true,cancelable:true,...modifiers}));
        assert.equal(a.location.href,before);assert.equal(main.scrollTop,scroll);
      }
    }
    const card=q(a,'main .record-card');card.open=true;await until(()=>card.dataset.loaded==='1');await inspect();
    for(const page of ['issues','matrix','files']){click(a,`[data-page="${page}"]`);await until(()=>q(a,'main').getAttribute('aria-busy')==='false'&&decodeRoute(a.location.hash).page===page);await inspect();}
    assert.deepEqual([...seen].sort(),['go','page','source','tab']);assert.ok(h.nativeClicks.length>20);assert.ok(h.nativeClicks.every(e=>!e.prevented));assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});

test('shared UI: remote edits preserve view, selection, scrolling and IME drafts; conflict exposes both values and explicit merge',async()=>{
  const h=await harness();try{
    const a=h.open();await demo(a);const b=h.open(q(a,'.nav-record').href);await editable(b);await editable(a);
    const note=q(b,'#review-note'),main=q(b,'main');main.scrollTop=211;q(b,'#inspector').scrollTop=71;note.focus();
    input(a,'#review-note','shared first');await until(()=>note.value==='shared first');assert.equal(q(b,'#review-note'),note);assert.equal(main.scrollTop,211);
    note.dispatchEvent(new b.CompositionEvent('compositionstart',{bubbles:true}));input(b,'#review-note','中文草稿 <img src=x onerror=alert(1)>');note.setSelectionRange(2,2);
    input(a,'#review-note','remote second');await until(()=>q(a,'#sync-status').textContent==='已同步');assert.match(note.value,/中文草稿/);assert.equal(note.selectionStart,2);
    note.dispatchEvent(new b.CompositionEvent('compositionend',{bubbles:true}));await until(()=>q(b,'#note-conflict [data-resolve="merge"]'));
    assert.match(q(b,'#note-conflict').textContent,/remote second/);assert.match(q(b,'#note-conflict').textContent,/中文草稿/);assert.equal(q(b,'#note-conflict img'),null);
    input(b,'[data-merge="note"]','merged 两份');click(b,'[data-resolve="merge"]');await until(()=>q(a,'#review-note').value==='merged 两份');
    await until(()=>q(b,'#sync-status').textContent==='已同步');assert.equal(q(b,'#review-note'),note);assert.equal(main.scrollTop,211);assert.equal(q(b,'#inspector').scrollTop,71);
    input(a,'#review-note','old acknowledgement');input(a,'#review-note','latest typing');await until(()=>note.value==='latest typing');
    input(a,'#review-status','approved');await until(()=>q(b,'#review-status').value==='approved');assert.equal(q(b,'#review-count').textContent,'1');assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});

test('shared UI: source href chooses owner, ordinary source keeps review owner/view; history and delayed responses stay local',async()=>{
  const h=await harness();try{
    const a=h.open();await demo(a);const card=[...a.document.querySelectorAll('.record-card')].find(el=>el.textContent.includes('提交合同'));card.open=true;await until(()=>card.dataset.loaded==='1');
    const source=card.querySelector('a[data-source]'),sourceRoute=decodeRoute(source.hash),owner=q(a,'.review-box').dataset.reviewOwner,main=q(a,'main');main.scrollTop=180;
    const before=a.location.href;source.click();await until(()=>decodeRoute(a.location.hash).sourceKey===sourceRoute.key&&q(a,'main').getAttribute('aria-busy')==='false');
    assert.equal(decodeRoute(a.location.hash).key,owner);assert.equal(q(a,'.review-box').dataset.reviewOwner,owner);assert.equal(main.scrollTop,180);
    const b=h.open(source.href);await editable(b);assert.equal(q(b,'.review-box').dataset.reviewOwner,sourceRoute.key);assert.match(q(b,'.source-meta').textContent,/提交合同/);
    a.history.back();await until(()=>a.location.href===before&&q(a,'main').getAttribute('aria-busy')==='false');a.history.forward();await until(()=>decodeRoute(a.location.hash).sourceKey===sourceRoute.key&&q(a,'main').getAttribute('aria-busy')==='false');
    click(a,'[data-page="issues"]');await until(()=>decodeRoute(a.location.hash).page==='issues'&&q(a,'main').getAttribute('aria-busy')==='false');
    assert.equal(q(a,'.review-box')?.dataset.reviewOwner,owner);assert.match(q(a,'.source-meta').textContent,/提交合同/);
    click(a,'[data-page="models"]');await until(()=>decodeRoute(a.location.hash).page==='models'&&q(a,'main').getAttribute('aria-busy')==='false');
    const c=h.open(q(a,'.nav-record').href,{delay:m=>m.type==='RESULT'&&m.value?.name==='合同'?150:0});
    await until(()=>q(c,'.nav-record'));const rule=[...c.document.querySelectorAll('.nav-record')].find(el=>el.textContent.includes('收款足额校验'));rule.click();
    await until(()=>q(c,'main h1')?.textContent==='收款足额校验'&&q(c,'main').getAttribute('aria-busy')==='false');
    await new Promise(resolve=>setTimeout(resolve,180));assert.equal(q(c,'main h1').textContent,'收款足额校验');assert.equal(q(a,'main h1').textContent,'合同');assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});

test('shared UI: cancelled/failed barriers unfreeze; download is complete v2 and only explicit saved snapshot advances its R',async()=>{
  const h=await harness();try{
    const a=h.open();await demo(a);const b=h.open(q(a,'.nav-record').href);await editable(b);
    const note=q(b,'#review-note');note.dispatchEvent(new b.CompositionEvent('compositionstart',{bubbles:true}));input(b,'#review-note','未完成组合');
    click(a,'.header-actions [data-action="export"]');await until(()=>q(a,'#banner.error')&&q(a,'#cancel-barrier').hidden,'export rejected');assert.equal(h.downloads.length,0);
    note.dispatchEvent(new b.CompositionEvent('compositionend',{bubbles:true}));await until(()=>q(a,'#review-note').value==='未完成组合');await editable(a);
    click(a,'.header-actions [data-action="export"]');await until(()=>h.downloads.length===1&&q(a,'#save-export').hidden===false,'complete export');
    const snapshot=JSON.parse(await h.downloads[0].text());assert.equal(snapshot.format,'omf-auditor-review-v2');assert.equal(snapshot.completeness.complete,true);assert.equal(snapshot.reviews.length,Number(q(a,'#model-count').textContent));
    await editable(b);input(b,'#review-note','download 后的新编辑');await until(()=>q(a,'#review-note').value==='download 后的新编辑');
    click(a,'#save-export');await until(()=>q(a,'#save-export').hidden);assert.equal(q(a,'#export-status').textContent,'尚未导出');
    let confirmations=0;a.confirm=()=>++confirmations===1;
    const count=q(a,'#model-count').textContent;await importText(a,'next.yaml','aggregates: [{id: NEXT}]');
    assert.equal(q(a,'#model-count').textContent,count);assert.equal(q(b,'#review-note').value,'download 后的新编辑');await editable(b);
    a.confirm=()=>true;await importText(a,'invalid.yaml','aggregates: [');await importText(a,'invalid.yaml','aggregates: [');
    assert.equal(q(a,'#model-count').textContent,count);assert.equal(q(b,'#review-note').value,'download 后的新编辑');
    assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});

test('shared UI: own prototype-named fields, complete long scalar/source paging, XSS and alias locations remain available',async()=>{
  const h=await harness();try{
    const a=h.open();await ready(a);const long='段'.repeat(9001);
    await importText(a,'合法 & 模型.yaml',`defaults: &base\n  expression: anchor-value\naggregates:\n  - id: OWN\n    lifecycle: [draft]\n    constructor: own-constructor\n    prototype: own-prototype\n    __proto__: own-proto\n    expression: ${long}\n    name: '<img src=x onerror=alert(1)>'\nrules:\n  - id: ALIAS\n    conditions: *base\n`);
    click(a,'[data-tab="fields"]');await until(()=>q(a,'main').getAttribute('aria-busy')==='false'&&q(a,'[data-tab="fields"].active'));
    for(const field of ['constructor','prototype','__proto__'])assert.ok([...a.document.querySelectorAll('main .field dt')].some(el=>el.textContent.includes(field)));
    assert.equal(q(a,'main img'),null);
    const expression=[...a.document.querySelectorAll('main .field')].find(el=>el.querySelector('dt')?.textContent.includes('规则表达式'));
    while(expression.querySelector('[data-scalar-more]')){const button=expression.querySelector('[data-scalar-more]');button.click();await until(()=>!button.isConnected);}
    assert.equal([...expression.querySelectorAll('.scalar')].map(el=>el.textContent).join(''),long);
    expression.querySelector('a[data-source]').click();await until(()=>q(a,'main').getAttribute('aria-busy')==='false'&&q(a,'.source-meta code')?.textContent.includes('expression'));
    const line=[...a.document.querySelectorAll('.source-line.highlight')].find(el=>el.textContent.includes('expression:'));
    while(line.querySelector('[data-source-column]')){const button=line.querySelector('[data-source-column]'),previous=button.dataset.sourceColumn;button.click();await until(()=>!button.isConnected||button.dataset.sourceColumn!==previous);}
    assert.match(line.querySelector('code').textContent,new RegExp(long));
    const alias=[...a.document.querySelectorAll('.nav-record')].find(el=>el.textContent.includes('ALIAS'));alias.click();await until(()=>q(a,'main h1')?.textContent==='ALIAS'&&q(a,'main').getAttribute('aria-busy')==='false');
    click(a,'[data-tab="fields"]');await until(()=>q(a,'[data-tab="fields"].active')&&q(a,'main').getAttribute('aria-busy')==='false');
    const nested=[...a.document.querySelectorAll('main a[data-source]')].find(el=>JSON.parse(el.dataset.path).join('.')==='conditions.expression');assert.ok(nested);nested.click();
    await until(()=>q(a,'.source-meta').textContent.includes('定位 L2'));assert.match(q(a,'.source-line.highlight').textContent,/anchor-value/);assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});

test('shared UI: legacy ambiguity and expired links never guess; file modifiers warn; reconnect retains non-authoritative recovery drafts',async()=>{
  const h=await harness();try{
    const a=h.open();await demo(a);const route=decodeRoute(a.location.hash);
    const bad={...route,workspaceId:'f'.repeat(64)},expired=h.open('http://127.0.0.1:8000/#audit='+encodeURIComponent(JSON.stringify(bad)));
    await until(()=>q(expired,'#banner.error'));assert.match(q(expired,'#banner.error').textContent,/WORKSPACE_EXPIRED/);assert.equal(q(expired,'#model-count').textContent,'0');
    const old='#model='+encodeURIComponent(JSON.stringify(['aggregates','DUP','dup.yaml'])),legacy=h.open('http://127.0.0.1:8000/'+old);await ready(legacy);
    await importText(legacy,'dup.yaml','aggregates: [{id: DUP}, {id: DUP}]');assert.equal(q(legacy,'.review-box'),null);assert.match(q(legacy,'#banner').textContent,/ambiguous/);
    const local=h.open('file:///tmp/omf-offline-test.html');await demo(local);const before=local.location.href;
    q(local,'.nav-record').dispatchEvent(new local.MouseEvent('click',{metaKey:true,bubbles:true,cancelable:true}));assert.equal(local.location.href,before);assert.match(q(local,'#banner').textContent,/本地服务|共享模式|serve.mjs/);
    const b=h.open(q(a,'.nav-record').href);await editable(b);const note=q(b,'#review-note');note.dispatchEvent(new b.CompositionEvent('compositionstart',{bubbles:true}));input(b,'#review-note','cached 恢复草稿');await Promise.resolve();
    b.dispatchEvent(new b.Event('pagehide'));b.dispatchEvent(new b.PageTransitionEvent('pageshow',{persisted:true}));assert.equal(note.disabled,true);
    const downloads=h.downloads.length;click(b,'#recovery-export');await until(()=>h.downloads.length>downloads);const recovery=JSON.parse(await h.downloads.at(-1).text());assert.equal(recovery.authoritative,false);assert.equal(recovery.completeness.complete,false);assert.match(JSON.stringify(recovery),/cached 恢复草稿/);
    click(b,'#reconnect');await until(()=>q(b,'#note-conflict [data-resolve="accept"]'));assert.equal(q(a,'#export-status').textContent,'无未导出审阅');
    click(b,'[data-resolve="accept"]');await editable(b);assert.equal(q(b,'#review-note').value,'');assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});

test('shared UI: a superseded search cannot replace the new route or leave the local list stuck busy',async()=>{
  const h=await harness();try{
    const a=h.open();await demo(a);
    const b=h.open(q(a,'.nav-record').href,{delay:m=>m.type==='RESULT'&&m.value?.items?.[0]?.key?150:0});await editable(b);
    const target=[...b.document.querySelectorAll('.nav-record')].find(el=>el.textContent.includes('收款足额校验'));
    input(b,'#search','CONTRACT');target.click();await until(()=>q(b,'main h1')?.textContent==='收款足额校验'&&q(b,'main').getAttribute('aria-busy')==='false');
    await until(()=>q(b,'#record-list').getAttribute('aria-busy')==='false','search retirement');assert.equal(q(b,'main h1').textContent,'收款足额校验');assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});

test('shared UI history: Back restores the clicked reading position, expanded cards and panel state; Forward is independent',async()=>{
  const h=await harness();try{
    const a=h.open();await demo(a);
    const card=[...a.document.querySelectorAll('main .record-card')].find(el=>el.textContent.includes('提交合同'));
    assert.ok(card);card.open=true;await until(()=>card.dataset.loaded==='1','expanded card');
    click(a,'#source-toggle');q(a,'main').scrollTop=417;q(a,'#record-list').scrollTop=93;
    const target=card.querySelector('.card-actions a[data-go]');assert.ok(target);target.click();
    await until(()=>q(a,'main h1')?.textContent==='提交合同'&&q(a,'main').getAttribute('aria-busy')==='false','behavior');
    q(a,'main').scrollTop=123;
    a.history.back();await until(()=>q(a,'main h1')?.textContent==='合同'&&q(a,'main').getAttribute('aria-busy')==='false','history Back');
    assert.equal(q(a,'main').scrollTop,417,JSON.stringify({banner:q(a,'#banner').textContent,history:a.history.state,cards:[...a.document.querySelectorAll('main .record-card')].map(el=>({open:el.open,loaded:el.dataset.loaded})),visibility:q(a,'main').style.visibility}));assert.equal(q(a,'#record-list').scrollTop,93);
    const restored=[...a.document.querySelectorAll('main .record-card')].find(el=>el.textContent.includes('提交合同'));
    assert.ok(restored?.open);assert.equal(restored.dataset.loaded,'1');assert.match(restored.textContent,/前置条件/);
    assert.ok(q(a,'#workspace').classList.contains('hide-inspector'));
    a.history.forward();await until(()=>q(a,'main h1')?.textContent==='提交合同'&&q(a,'main').getAttribute('aria-busy')==='false','history Forward');
    assert.equal(q(a,'main').scrollTop,123);assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});

test('shared UI history: Back rebuilds previously loaded field pages before restoring the anchor',async()=>{
  const h=await harness();try{
    const a=h.open();await ready(a);
    const fields=Array.from({length:60},(_,i)=>`    field${i}: value${i}`).join('\n');
    await importText(a,'history.yaml',`aggregates:\n  - id: A\n    name: 长定义 A\n${fields}\n  - id: B\n    name: 短定义 B\n`);
    await until(()=>q(a,'main h1')?.textContent==='长定义 A'&&q(a,'main').getAttribute('aria-busy')==='false');
    click(a,'[data-tab="fields"]');await until(()=>q(a,'main button[data-more]')&&!q(a,'main button[data-more]').disabled);
    click(a,'main button[data-more]');await until(()=>q(a,'main').textContent.includes('field40'));
    click(a,'main button[data-more]');await until(()=>q(a,'main').textContent.includes('field59'));
    q(a,'main').scrollTop=630;
    [...a.document.querySelectorAll('.nav-record')].find(el=>el.textContent.includes('短定义 B')).click();
    await until(()=>q(a,'main h1')?.textContent==='短定义 B'&&q(a,'main').getAttribute('aria-busy')==='false');
    a.history.back();await until(()=>q(a,'main h1')?.textContent==='长定义 A'&&q(a,'main').getAttribute('aria-busy')==='false','paged history Back');
    assert.ok(q(a,'main').textContent.includes('field59'),JSON.stringify({banner:q(a,'#banner').textContent,history:a.history.state,fields:q(a,'main').querySelectorAll('.field').length,visibility:q(a,'main').style.visibility}));assert.equal(q(a,'main').scrollTop,630);assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});

test('shared UI history: returning to source-only navigation keeps the review owner and both reading panes',async()=>{
  const h=await harness();try{
    const a=h.open();await demo(a);
    const card=[...a.document.querySelectorAll('main .record-card')].find(el=>el.textContent.includes('提交合同'));
    card.open=true;await until(()=>card.dataset.loaded==='1');
    card.querySelector('.card-actions a[data-source]').click();
    await until(()=>decodeRoute(a.location.hash).sourceKey&&q(a,'main').getAttribute('aria-busy')==='false');
    const route=decodeRoute(a.location.hash);q(a,'main').scrollTop=290;q(a,'.source-code').scrollTop=123;q(a,'#inspector').scrollTop=55;
    card.querySelector('.card-actions a[data-go]').click();
    await until(()=>q(a,'main h1')?.textContent==='提交合同'&&q(a,'main').getAttribute('aria-busy')==='false');
    a.history.back();await until(()=>q(a,'main h1')?.textContent==='合同'&&q(a,'main').getAttribute('aria-busy')==='false');
    assert.equal(decodeRoute(a.location.hash).key,route.key);assert.equal(decodeRoute(a.location.hash).sourceKey,route.sourceKey);
    assert.equal(q(a,'main').scrollTop,290);assert.equal(q(a,'.source-code').scrollTop,123);assert.equal(q(a,'#inspector').scrollTop,55);
    assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});
