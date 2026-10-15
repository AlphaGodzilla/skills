import {esc} from './schema.js';
import {encodeRoute,decodeRoute} from './navigation.js';
import {connectSharedWorkspace,newWorkspaceAddress,sharedWorkerTarget} from './workspace-client.js';
import {connectLocalWorkspace} from './local-workspace.js';
import {createRenderer} from './render.js';
import {detailView} from './detail.js';
import {welcome,issuePage,filesPage,matrixPage} from './pages.js';
import {inspectorView,sourceView} from './inspector.js';
import {createReviewEditor} from './review-ui.js';
import {createSessionActions} from './session-ui.js';
import {createReadingHistory,elementPath,elementAt,captureScroll,restoreScroll} from './reading-history.js';
const $=id=>document.getElementById(id),fileMode=location.protocol==='file:';
const state={active:true,navigating:false,route:null,record:null,source:null,sourceStart:null,showSource:true,generation:0,sourceGeneration:0,searchGeneration:0,search:'',filter:'',listNext:null,readingActions:[],sourceReadingActions:[],restoringReading:false};
let connection,client,editor,session,address,viewEvents;
const message=(text,error=false)=>{if(!state.active)return;$('banner').hidden=!text;$('banner').classList.toggle('error',error);$('banner-text').textContent=text;};
const report=error=>{if(error.code!=='STALE_VIEW')message(error.message,true);};
const run=fn=>Promise.resolve().then(fn).catch(report);
function href(target){return encodeRoute({v:1,workspaceId:address.workspaceId,credential:address.credential,datasetVersion:client.state().metadata.datasetVersion,...target});}
function pageHref(page){const r=state.route;return href({page,...(r?.key?{key:r.key,view:r.view||'audit',...(r.path?{path:r.path}:{}),...(r.sourceKey?{sourceKey:r.sourceKey}:{})}:{})});}
const readingHistory=createReadingHistory(window,captureReading);
const replaceURL=hash=>readingHistory.replace(hash);
function readingRoots(){return {main:$('main'),list:$('record-list'),source:document.querySelector('#source-body .source-code'),inspector:$('inspector')};}
function captureReading(anchor) {
  if(!state.route||!state.active||$('main').getAttribute('aria-busy')==='true'||state.navigating||state.restoringReading||state.route.datasetVersion!==client.state().metadata.datasetVersion)return null;
  const roots=readingRoots(),anchorRoot=['source','main','list','inspector'].find(k=>anchor&&roots[k]?.contains(anchor));
  return {search:state.search,filter:state.filter,listCount:$('record-list').querySelectorAll('.nav-record').length,
    showSource:state.showSource,sourceStart:state.sourceStart,actions:state.readingActions,sourceActions:state.sourceReadingActions,
    details:[...$('main').querySelectorAll('details')].map(el=>({path:elementPath($('main'),el),open:el.open})),
    scroll:Object.fromEntries(Object.entries(roots).map(([key,root])=>[key,captureScroll(root,key===anchorRoot?anchor:null)]))};
}
async function restoreReading(saved,generation) {
  const current=()=>{if(generation!==state.generation||!state.active)throw Object.assign(new Error('Stale reading position.'),{code:'STALE_VIEW'});};
  state.readingActions=saved.actions;state.sourceReadingActions=saved.sourceActions;
  await viewEvents.replayReading(saved.actions,'main',generation);current();
  for(const item of saved.details) {
    const el=elementAt($('main'),item.path);if(el?.tagName!=='DETAILS')continue;
    el.open=item.open;if(el.open&&!el.dataset.loaded)await viewEvents.loadDetails(el);current();
  }
  const changed=state.search!==saved.search||state.filter!==saved.filter||$('record-list').querySelectorAll('.nav-record').length!==saved.listCount;
  state.search=saved.search;state.filter=saved.filter;$('search').value=saved.search;$('kind-filter').value=saved.filter;
  if(changed){await sidebar();current();while($('record-list').querySelectorAll('.nav-record').length<saved.listCount&&state.listNext!==null){await sidebar(true);current();}}
  state.showSource=saved.showSource&&!!state.record;
  $('workspace').classList.toggle('hide-inspector',!state.showSource);$('source-toggle').setAttribute('aria-pressed',String(state.showSource));
  if(state.source&&saved.sourceStart!==null&&state.sourceStart!==saved.sourceStart){await drawSource(saved.sourceStart);current();}
  await viewEvents.replayReading(saved.sourceActions,'source',generation);current();
  await new Promise(resolve=>requestAnimationFrame(resolve));current();
  const roots=readingRoots();for(const [key,position] of Object.entries(saved.scroll))restoreScroll(roots[key],position);
}
function applyHistory() {
  const visit=readingHistory.traverse();
  if(visit.changed)run(()=>navigate(location.hash,false,false,null,visit.reading));
}
function renderer() {
  const generation=state.generation,version=client.state().metadata.datasetVersion;
  return createRenderer(async q=>{const dto=await client.query(q);if(!state.active||generation!==state.generation||version!==client.state().metadata.datasetVersion)throw Object.assign(new Error('Stale view.'),{code:'STALE_VIEW'});return dto;},href);
}
function statusChanged() {
  if(!client||!state.active)return;
  const s=client.state(),m=s.metadata;
  $('connection-status').textContent=s.status==='ready'?(fileMode?'单页本地模式':'共享内存 · 已连接'):'连接状态：'+s.status;
  $('export-status').textContent=m?.dirty?'尚未导出':'无未导出审阅';
  $('barrier-status').textContent=m?.barrier?'全局操作暂停输入；等待页面确认':'';
  $('cancel-barrier').hidden=!m?.barrier;
  $('recovery-export').hidden=s.status==='ready';
  $('reconnect').hidden=s.status==='ready';
  if(m){$('review-count').textContent=m.stats.reviewed||0;$('file-count').textContent=m.fileCount;$('model-count').textContent=m.stats.definitions;$('issue-count').textContent=m.stats.issues;}
  if(m)document.querySelectorAll('[data-page]').forEach(el=>{const active=el.dataset.page===(state.route?.page||'models');el.href=pageHref(el.dataset.page);el.classList.toggle('active',active);el.setAttribute('aria-current',active?'page':'false');});
  const fields=['status','note'].map(field=>editor?.get(state.record?.key,field)).filter(Boolean);
  for(const e of fields) {
    const el=$('review-'+e.field);if(!el)continue;
    el.disabled=state.navigating||s.status!=='ready'||editor.paused()||!!m?.barrier||!e.lease||!!e.conflict;
    if(!e.composing&&el.value!==e.value)el.value=e.value;
    const box=$(e.field+'-conflict');
    if(e.conflict&&!box.dataset.visible){box.dataset.visible='1';box.innerHTML=`<div class="warning-box"><strong>字段冲突；两份内容均保留</strong><p>本地</p><pre>${esc(e.value)}</pre><p>共享</p><pre>${esc(e.conflict.current.value)}</pre><button data-resolve="accept" data-field="${e.field}">接受共享值</button><label>合并后提交<textarea data-merge="${e.field}">${esc(e.value)}</textarea></label><button data-resolve="merge" data-field="${e.field}">提交合并值</button></div>`;}
    if(!e.conflict&&box?.dataset.visible){box.replaceChildren();delete box.dataset.visible;}
  }
  if($('sync-status'))$('sync-status').textContent=s.status!=='ready'?'连接中断 / 未确认':fields.some(e=>e.conflict)?'冲突':editor.paused()?'已暂停':fields.some(e=>e.error)?'同步失败；草稿保留':fields.some(e=>e.dirty||e.inflight||e.composing)?'待同步':'已同步';
}
async function sidebar(append=false) {
  $('record-list').setAttribute('aria-busy','true');
  const generation=++state.searchGeneration,ui=renderer();
  try {
  const dto=await ui.query({type:'definitions',search:state.search,section:state.filter,offset:append?state.listNext:0,limit:100});
  if(generation!==state.searchGeneration)return;
  const rows=dto.items.map(r=>`<a class="nav-record ${state.record?.key===r.key?'selected':''}" data-go="${esc(r.key)}" href="${esc(href({page:'models',key:r.key,view:'audit'}))}"><span class="model-tag">${esc(r.model)}</span><span><strong>${esc(r.name)}</strong><code>${esc(r.id)}</code></span><span class="review-dot ${esc(r.reviewStatus||'pending')}" data-review-dot="${esc(r.key)}"></span></a>`).join('');
  $('record-list').querySelector('[data-action="more-list"]')?.remove();
  if(append)$('record-list').insertAdjacentHTML('beforeend',rows);else $('record-list').innerHTML=rows||'<div class="empty-small">没有匹配的定义</div>';
  state.listNext=dto.next;$('list-count').textContent=`${dto.total} 个定义`;
  if(dto.next!==null)$('record-list').insertAdjacentHTML('beforeend','<button class="wide" data-action="more-list">显示更多</button>');
  }catch(error){if(error.code==='STALE_VIEW'&&generation===state.searchGeneration&&state.active)return sidebar();throw error;}
  finally{if(generation===state.searchGeneration&&state.active)$('record-list').setAttribute('aria-busy','false');}
}
async function drawSource(start=state.sourceStart) {
  if(!state.source||!$('source-body'))return;
  const generation=++state.sourceGeneration,ui=renderer();
  const dto=await sourceView(state.source.record,ui.query,state.source.path,start);
  if(generation!==state.sourceGeneration)return;
  state.sourceStart=dto.start;$('source-body').innerHTML=dto.html;
  if(!state.restoringReading)state.sourceReadingActions=[];
}
async function drawRoute(route,{sourceOnly=false}={}) {
  const ui=renderer();
  const record=route.key?await ui.query({type:'definition',key:route.key}):null;
  if(!sourceOnly)await editor.activate(record?.key);
  const sourceRecord=route.sourceKey?await ui.query({type:'definition',key:route.sourceKey}):record;
  if(route.path)await ui.query({type:'source',key:sourceRecord.key,path:route.path,limit:1});
  document.querySelectorAll('.nav-record').forEach(el=>{const selected=el.dataset.go===record?.key;el.classList.toggle('selected',selected);el.setAttribute('aria-current',selected?'page':'false');});
  state.record=record;state.source=sourceRecord?{record:sourceRecord,path:route.path||[]}:null;
  state.sourceStart=null;state.showSource=!!record;
  if(!sourceOnly) {
    const html=route.page==='issues'?await issuePage(ui):route.page==='files'?await filesPage(ui):route.page==='matrix'?await matrixPage(ui):record?await detailView(record,ui,route.view==='source'?'audit':route.view||'audit'):welcome();
    $('main').innerHTML=html;$('main').scrollTop=0;
    $('inspector').innerHTML=inspectorView(record);
    if(record){await editor.ensure(record.key,'status');await editor.ensure(record.key,'note');}
  }
  $('workspace').classList.toggle('hide-inspector',!state.showSource);$('source-toggle').setAttribute('aria-pressed',String(state.showSource));
  await drawSource();statusChanged();const label={models:'模型工作台',issues:'问题清单',files:'导入文件',matrix:'权限矩阵'}[route.page];
  document.title=(route.page==='models'?(record?.name||label):label+(record?' · '+record.name:''))+' · OMF 审计器';
}
async function navigate(hash,push=false,sourceOnly=false,anchor=null,reading=null) {
  if(hash.startsWith('#model=')){
    if(hash.length>32768)throw new Error('旧链接过长。');
    const generation=++state.generation,target=JSON.parse(decodeURIComponent(hash.slice(7))),r=await client.query({type:'legacy',target});
    if(generation!==state.generation)throw Object.assign(new Error('Stale view.'),{code:'STALE_VIEW'});
    const canonical=href({page:'models',key:r.key,view:'audit'});if(!push)replaceURL(canonical);return navigate(canonical,push,sourceOnly,anchor,reading);
  }
  const route=decodeRoute(hash),m=client.state().metadata;
  if(route.workspaceId!==address.workspaceId||route.credential!==address.credential)throw new Error('链接不属于当前工作区。');
  if(route.datasetVersion!==m.datasetVersion)throw new Error('链接的数据集已过期；未猜测其他定义。');
  if(push)readingHistory.push(hash,anchor);
  const generation=++state.generation;state.route=route;state.navigating=!sourceOnly;state.restoringReading=reading?generation:false;
  if(!sourceOnly){state.readingActions=[];state.sourceReadingActions=[];}
  $('main').style.visibility=reading?'hidden':'';statusChanged();$('main').setAttribute('aria-busy','true');
  try {
    await drawRoute(route,{sourceOnly});
    if(reading)await restoreReading(reading,generation);
  }finally {
    if(generation===state.generation&&state.active){state.navigating=false;state.restoringReading=false;$('main').style.visibility='';$('main').setAttribute('aria-busy','false');statusChanged();}
  }
}
async function readyDataset(initiated=false) {
  await client.whenReady();state.generation++;await editor.reset();statusChanged();await sidebar();
  readingHistory.clear();state.readingActions=[];state.sourceReadingActions=[];
  if(initiated) {
    let target;
    if(location.hash.startsWith('#model=')) {
      const r=await client.query({type:'legacy',target:JSON.parse(decodeURIComponent(location.hash.slice(7)))});target={page:'models',key:r.key,view:'audit'};
    }else {
      const aggregates=await client.query({type:'definitions',section:'aggregates',limit:1});
      const r=aggregates.items[0]||(await client.query({type:'definitions',limit:1})).items[0];target=r?{page:'models',key:r.key,view:'audit'}:{page:'files'};
    }
    await navigate(href(target),true);
  }else if(state.route) {
    const route={...state.route,datasetVersion:client.state().metadata.datasetVersion};
    try {await navigate(encodeRoute(route));replaceURL(encodeRoute(route));}
    catch(error){$('main').innerHTML='<h1>目标已过期</h1><p>文件指纹或定义已变更；请从目录重新选择，不按业务 ID 猜测。</p>';message(error.message,true);}
  }
}

async function reconnect() {
  state.active=true;
  let port;
  if(fileMode){const channel=new MessageChannel();connection.host.attachPort(channel.port1);port=channel.port2;}
  else {const target=sharedWorkerTarget(location.href,address),worker=new SharedWorker(target.url,{name:target.name});worker.addEventListener('error',()=>client.disconnect('WORKER_ERROR'));connection.worker=worker;port=worker.port;}
  await client.connect(port);await editor.refresh();statusChanged();message('重新接入完成；未知提交结果保留为显式冲突，请核对后接受或合并。');
}
async function boot() {
  $('main').innerHTML=welcome();
  $('new-workspace').href=location.href.split('#')[0];
  const initial=location.hash.startsWith('#audit=')?decodeRoute(location.hash):null;
  if(location.hash&&!initial&&!location.hash.startsWith('#model='))throw new Error('无法识别的旧地址；未猜测首个定义。');
  if(fileMode&&initial)throw new Error('单页内存工作区已过期。请从空地址重新导入，或启动本地共享服务。');
  address=initial?{buildId:globalThis.OMF_AUDITOR_BUILD.buildId,workspaceId:initial.workspaceId,credential:initial.credential,datasetVersion:initial.datasetVersion}:newWorkspaceAddress(globalThis.OMF_AUDITOR_BUILD.buildId);
  connection=fileMode?await connectLocalWorkspace(address):await connectSharedWorkspace(location.href,{address,mode:initial?'JOIN':'CREATE'});
  client=connection.client;editor=createReviewEditor(client,statusChanged);
  session=createSessionActions({client,editor,message,readyDataset,statusChanged});
  let dataset=client.state().metadata.datasetVersion;
  client.onState(s=>{
    statusChanged();
    if(s.status==='ready'&&s.metadata.datasetVersion!==dataset){dataset=s.metadata.datasetVersion;if(!session.busy())run(()=>readyDataset());}
    session.settleBarrier();
  });
  client.onEvent(event=>{
    if(event.type==='reviewChanged') {
      editor.remote(event);
      if(event.field==='status')document.querySelectorAll('[data-review-dot]').forEach(el=>{if(el.dataset.reviewDot===event.key)el.className='review-dot '+event.current.value;});
    }
    run(()=>session.handleEvent(event));statusChanged();
  });
  viewEvents=wireEvents({reconnect,state,client,editor,session,renderer,navigate,sidebar,drawSource,statusChanged,message,run,fileMode,applyHistory});
  statusChanged();await sidebar();
  if(initial)await navigate(location.hash);
  else if(!location.hash.startsWith('#model=')){const hash=href({page:'models'});replaceURL(hash);await navigate(hash);}
  else message('旧链接需要先导入原文件；仅唯一匹配时转换，不猜测目标。');
}
import {wireEvents} from './ui-events.js';
run(boot);
