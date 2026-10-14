import {SECTIONS,esc} from './schema.js';
import {buildIndex,objectContext,neighbors} from './indexer.js';
import {detailView,contextCards,stepsView,refRows,incomingRows} from './detail.js';
import {containerView,getValue,fillCard} from './render.js';
import {welcome,issuePage,filesPage,matrixPage} from './pages.js';
import {inspectorView,setFocus,exportReviews} from './inspector.js';
import {importModels} from './importer.js';
import {DEMO} from './demo.js';
const $=id=>document.getElementById(id);
const state={index:buildIndex([]),selected:null,page:'models',tab:'audit',search:'',filter:'',
  listLimit:100,source:null,sourceStart:1,reviews:new Map(),dirty:false,busy:false,showSource:true};
function drawSidebar() {
  const tokens=state.search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const list=state.index.records.filter(r=>(!state.filter||r.section===state.filter)&&
    tokens.every(t=>`${r.id} ${r.name} ${r.file.name} ${r.model}`.toLowerCase().includes(t)));
  $('list-count').textContent=`${list.length} 个定义`;
  const fragment=list.slice(0,state.listLimit).map(r=>{
    const review=state.reviews.get(r.uid),status=review?.status||'pending';
    return `<button class="nav-record ${state.selected===r.uid?'selected':''}" data-go="${r.uid}"><span class="model-tag">${r.model}</span><span><strong>${esc(r.name)}</strong><code>${esc(r.id)}</code></span><span class="review-dot ${status}" title="${status==='approved'?'已通过':status==='changes'?'需修改':'待审阅'}"></span></button>`;
  }).join('');
  $('record-list').innerHTML=fragment+(list.length>state.listLimit?`<button class="wide" data-action="more-list">显示更多（剩余 ${list.length-state.listLimit}）</button>`:'')+
    (!list.length?'<div class="empty-small">没有匹配的定义</div>':'');
}
function drawInspector() {
  $('inspector').innerHTML=inspectorView(state);
  $('workspace').classList.toggle('hide-inspector',!state.showSource||!state.selected);
  $('source-toggle').setAttribute('aria-pressed',String(state.showSource));
}
function draw() {
  const {index}=state,r=index.byUid.get(state.selected);
  $('file-count').textContent=String(index.files.length);
  $('model-count').textContent=String(index.records.length);
  $('issue-count').textContent=String(index.issues.length);
  $('review-count').textContent=String([...state.reviews.values()].filter(r=>r.status!=='pending').length);
  document.querySelectorAll('[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===state.page));
  $('main').innerHTML=state.page==='issues'?issuePage(index):state.page==='files'?filesPage(index):
    state.page==='matrix'?matrixPage(index):r?detailView(r,index,state.tab):welcome();
  drawSidebar();drawInspector();
}
function navigate(uid,push=true) {
  const r=state.index.byUid.get(uid);if (!r) return;
  state.selected=uid;state.page='models';state.tab='audit';setFocus(state,r);
  if (push) {
    const hash='#model='+encodeURIComponent(JSON.stringify([r.section,r.id,r.file.name]));
    if (location.hash!==hash) location.hash=hash;
  }
  draw();$('main').scrollTop=0;
}
function fromHash() {
  if (!location.hash.startsWith('#model=')) return null;
  try {
    const [section,id,name]=JSON.parse(decodeURIComponent(location.hash.slice(7)));
    return state.index.records.find(r=>r.section===section&&r.id===id&&r.file.name===name);
  } catch {return null;} // A malformed navigation fragment is not model data.
}
function message(text,error=false) {
  $('banner').hidden=!text;$('banner').classList.toggle('error',error);$('banner-text').textContent=text;
}
async function ingest(files,replaceAll=false) {
  if (state.busy) return;
  if (state.dirty&&!confirm('重新导入会清空当前审阅记录。请先导出；仍要继续吗？')) {$('file-input').value='';$('folder-input').value='';return;}
  state.busy=true;$('busy').hidden=false;
  try {
    const index=await importModels(files,replaceAll?[]:state.index.files,text=>$('busy-text').textContent=text);
    state.index=index;state.reviews=new Map();state.dirty=false;state.source=null;state.selected=null;
    state.page=index.records.length?'models':'files';state.tab='audit';state.listLimit=100;
    const r=fromHash()||index.records.find(r=>r.section==='aggregates')||index.records[0];
    if (r) navigate(r.uid);
    else draw();
    message(`已载入 ${index.files.length} 份文件 / ${index.records.length} 个定义。${index.issues.length?'有 '+index.issues.length+' 项基础检查提示。':'仍需人工审查业务语义。'} 审阅记录已重置。`);
  } catch(error) {message('导入失败；当前工作区未改动。\n'+error.message,true);}
  finally {state.busy=false;$('busy').hidden=true;$('file-input').value='';$('folder-input').value='';}
}
function saveReview() {
  if (!state.selected) return;
  state.reviews.set(state.selected,{status:$('review-status').value,note:$('review-note').value});
  state.dirty=true;drawSidebar();
  $('review-count').textContent=String([...state.reviews.values()].filter(r=>r.status!=='pending').length);
}
function download() {
  if (!state.index.files.length) {message('请先导入模型。',true);return;}
  const blob=new Blob([JSON.stringify(exportReviews(state),null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='omf-review-'+new Date().toISOString().slice(0,10)+'.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  state.dirty=false;message('审阅记录已生成下载。请确认浏览器已保存文件。');
}
const actions={
  import:()=>$('file-input').click(),folder:()=>$('folder-input').click(),
  demo:()=>ingest(DEMO.map(([name,text])=>new File([text],name,{type:'application/yaml'})),true),
  export:download,'more-list':()=>{state.listLimit+=100;drawSidebar();},
  source:()=>{state.showSource=!state.showSource;drawInspector();},
  line:()=>{const f=state.source?.record.file;const n=Number($('line-input')?.value);
    if (f&&Number.isFinite(n)) {state.sourceStart=Math.min(f.lines.length,Math.max(1,Math.floor(n)));drawInspector();}},
  clear:()=>{if (!confirm('清空模型与所有未导出的审阅记录？')) return;
    Object.assign(state,{index:buildIndex([]),selected:null,page:'models',source:null,reviews:new Map(),dirty:false});
    location.hash='';message('');draw();},
  'close-banner':()=>message('')
};
$('search').addEventListener('input',e=>{state.search=e.target.value;state.listLimit=100;drawSidebar();});
$('kind-filter').innerHTML='<option value="">全部模型类型</option>'+SECTIONS.map(([s,m,k])=>`<option value="${s}">${m} · ${k}</option>`).join('');
$('kind-filter').addEventListener('change',e=>{state.filter=e.target.value;state.listLimit=100;drawSidebar();});
$('file-input').addEventListener('change',e=>{if (e.target.files.length) ingest(e.target.files);});
$('folder-input').addEventListener('change',e=>{const files=[...e.target.files].filter(f=>/\.ya?ml$/i.test(f.name));if (files.length) ingest(files);else message('目录内未找到 YAML 文件。',true);});
window.addEventListener('hashchange',()=>{const r=fromHash();if (r&&r.uid!==state.selected) navigate(r.uid,false);});
window.addEventListener('beforeunload',e=>{if (state.dirty) {e.preventDefault();e.returnValue='';}});
document.addEventListener('click',e=>{
  const el=e.target.closest('button');if (!el||state.busy) return;
  const d=el.dataset,r=state.index.byUid.get(state.selected);
  try {
    if (d.action) actions[d.action]?.();
    else if (d.go) navigate(d.go);
    else if (d.page) {state.page=d.page;draw();$('main').scrollTop=0;}
    else if (d.tab) {state.tab=d.tab;draw();}
    else if (d.source) {const target=state.index.byUid.get(d.source);if (!target) return;
      setFocus(state,target,JSON.parse(d.path||'[]'));state.showSource=true;drawInspector();}
    else if (d.sourcePage) {const f=state.source?.record.file;if (!f) return;
      state.sourceStart=Math.max(1,Math.min(f.lines.length,state.sourceStart+Number(d.sourcePage)));drawInspector();}
    else if (d.more) {const target=state.index.byUid.get(d.more),path=JSON.parse(d.path);
      const slot=el.closest('.more-slot');slot.insertAdjacentHTML('beforebegin',containerView(target,getValue(target,path),path,Number(d.offset)));slot.remove();}
    else if (d.contextMore) {const context=r.section==='aggregates'?objectContext(r):neighbors(r).map(record=>({record,via:null}));
      const slot=el.closest('.context-more');slot.insertAdjacentHTML('beforebegin',contextCards(context,Number(d.contextMore)));slot.remove();}
    else if (d.stepMore) {const slot=el.closest('.step-more');slot.insertAdjacentHTML('beforebegin',stepsView(r,d.key,Number(d.stepMore)));slot.remove();}
    else if (d.refsMore) {const slot=el.closest('.refs-more');slot.insertAdjacentHTML('beforebegin',refRows(r,r.refs,Number(d.refsMore)));slot.remove();}
    else if (d.incomingMore) {const slot=el.closest('.incoming-more');slot.insertAdjacentHTML('beforebegin',incomingRows(r,Number(d.incomingMore)));slot.remove();}
    else if (d.issuesMore) {const slot=el.closest('.issues-more');slot.insertAdjacentHTML('beforebegin',issuePage(state.index,Number(d.issuesMore)));slot.remove();}
    else if (d.matrixMore) {const {body,more}=matrixPage(state.index,Number(d.matrixMore));$('matrix-body').insertAdjacentHTML('beforeend',body);$('matrix-more').innerHTML=more;}
  } catch(error) {message('操作失败：'+error.message,true);}
});
document.addEventListener('toggle',e=>{
  const el=e.target;if (!el.open||el.dataset.loaded) return;
  if (el.dataset.card) {el.querySelector('.card-body').innerHTML=fillCard(state.index.byUid.get(el.dataset.card));el.dataset.loaded='1';}
  else if (el.dataset.lazy) {const r=state.index.byUid.get(el.dataset.lazy),path=JSON.parse(el.dataset.path);
    el.querySelector('.lazy-body').innerHTML=containerView(r,getValue(r,path),path);el.dataset.loaded='1';}
},true);
document.addEventListener('input',e=>{if (['review-status','review-note'].includes(e.target.id)) saveReview();});
document.addEventListener('keydown',e=>{if (e.key==='Escape') {state.showSource=false;drawInspector();} if (e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) {e.preventDefault();$('search').focus();}});
let dragDepth=0;
window.addEventListener('dragenter',e=>{if (!e.dataTransfer?.types.includes('Files')) return;e.preventDefault();dragDepth++;$('drop-overlay').hidden=false;});
window.addEventListener('dragleave',e=>{e.preventDefault();dragDepth--;if (dragDepth<=0) {dragDepth=0;$('drop-overlay').hidden=true;}});
window.addEventListener('dragover',e=>e.preventDefault());
window.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop-overlay').hidden=true;if (e.dataTransfer?.files.length) ingest(e.dataTransfer.files);});
draw();
