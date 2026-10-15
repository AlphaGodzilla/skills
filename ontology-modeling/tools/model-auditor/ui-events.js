import {SECTIONS} from './schema.js';
import {decodeRoute,encodeRoute} from './navigation.js';
import {unknownRows,stepContext,contextCards,stepsView,refRows,incomingRows} from './detail.js';
import {fileText,fileWarnings,issuePage,filesPage,matrixPage} from './pages.js';
import {describeReadingControl,findReadingControl} from './reading-history.js';

export function wireEvents({reconnect,state,client,editor,session,renderer,navigate,sidebar,drawSource,statusChanged,message,run,fileMode,applyHistory}) {
  const $=id=>document.getElementById(id);
  const actions={import:()=>$('file-input').click(),folder:()=>$('folder-input').click(),demo:session.demo,clear:session.clear,export:session.exportAll,
    reconnect,'abandon-export':session.abandon,'save-export':session.saved,'cancel-barrier':session.cancel,'recovery-export':session.recovery,
    'more-list':()=>sidebar(true),'close-banner':()=>message(''),
    source:()=>{state.showSource=!state.showSource;$('workspace').classList.toggle('hide-inspector',!state.showSource);$('source-toggle').setAttribute('aria-pressed',String(state.showSource));},
    line:()=>drawSource(Math.max(1,Math.floor(Number($('line-input').value))))};
  function readingControl(el) {
    const main=$('main'),source=$('source-body');
    const scope=main.contains(el)?'main':source?.contains(el)?'source':null;
    const descriptor=scope&&describeReadingControl(scope==='main'?main:source,el);
    return descriptor?{scope,descriptor}:null;
  }
  function rememberControl(saved,generation) {
    if(saved&&generation===state.generation&&!state.restoringReading)
      state[saved.scope==='main'?'readingActions':'sourceReadingActions'].push(saved.descriptor);
  }
  async function applyReadingButton(el) {
    const saved=readingControl(el),generation=state.generation,d=el.dataset,ui=renderer(),r=state.record;
    const replaceSlot=async(selector,html)=>{const slot=el.closest(selector),value=await html;if(slot?.isConnected){slot.insertAdjacentHTML('beforebegin',value);slot.remove();}};
    if(d.sourcePage)await drawSource(Math.max(1,state.sourceStart+Number(d.sourcePage)));
    else if(d.sourceColumn) {
      const source=state.source,dto=await ui.query({type:'source',key:source.record.key,path:source.path,wholeFile:true,offset:Number(d.line)-1,limit:1,columnOffset:Number(d.sourceColumn)});
      if(!el.isConnected)return;const line=dto.lines[0];el.closest('.source-line').querySelector('code').append(document.createTextNode(line.text));
      if(line.nextColumn===null)el.remove();else el.dataset.sourceColumn=line.nextColumn;
    }
    else if(d.more)await replaceSlot('.more-slot',ui.container(await ui.query({type:'definition',key:d.key}),JSON.parse(d.path),Number(d.more)));
    else if(d.scalarMore)await replaceSlot('.more-slot',ui.scalar({key:d.key},JSON.parse(d.path),Number(d.scalarMore)));
    else if(d.contextMore)await replaceSlot('.context-more',contextCards(r,ui,Number(d.contextMore)));
    else if(d.stepMore)await replaceSlot('.step-more',stepsView(r,ui,d.key,Number(d.stepMore)));
    else if(d.stepContextMore)await replaceSlot('.step-context-more',stepContext(r,ui,JSON.parse(d.path),Number(d.stepContextMore)));
    else if(d.unknownMore)await replaceSlot('.unknown-more',unknownRows(r,ui,Number(d.unknownMore)));
    else if(d.refsMore)await replaceSlot('.refs-more',refRows(r,ui,Number(d.refsMore)));
    else if(d.incomingMore)await replaceSlot('.incoming-more',incomingRows(r,ui,Number(d.incomingMore)));
    else if(d.issuesMore)await replaceSlot('.issues-more',issuePage(ui,Number(d.issuesMore)));
    else if(d.filesMore)await replaceSlot('.files-more',filesPage(ui,Number(d.filesMore)));
    else if(d.fileTextMore)await replaceSlot('.more-slot',fileText(ui,d.file,d.field,Number(d.fileTextMore)));
    else if(d.fileWarningsMore)await replaceSlot('.file-warnings-more',fileWarnings(ui,d.file,Number(d.total),Number(d.fileWarningsMore)));
    else if(d.matrixMore){const dto=await matrixPage(ui,Number(d.matrixMore));if(!el.isConnected)return;$('matrix-body').insertAdjacentHTML('beforeend',dto.body);$('matrix-more').innerHTML=dto.more;}
    else return;
    rememberControl(saved,generation);
  }
  async function loadDetails(el) {
    if(!el.open||el.dataset.loaded||(!el.dataset.card&&!el.dataset.lazy))return;
    const saved=readingControl(el),generation=state.generation;el.dataset.loaded='loading';
    try {
      const ui=renderer(),r=await ui.query({type:'definition',key:el.dataset.card||el.dataset.lazy});
      const html=el.dataset.card?await ui.fillCard(r):await ui.container(r,JSON.parse(el.dataset.path));
      if(el.isConnected){el.querySelector(el.dataset.card?'.card-body':'.lazy-body').innerHTML=html;el.dataset.loaded='1';rememberControl(saved,generation);}
    }catch(error){delete el.dataset.loaded;throw error;}
  }
  async function replayReading(actions,scope,generation=state.generation) {
    for(const descriptor of actions) {
      if(generation!==state.generation||!state.active)throw Object.assign(new Error('Stale reading position.'),{code:'STALE_VIEW'});
      const root=scope==='main'?$('main'):$('source-body'),el=findReadingControl(root,descriptor);
      if(!el)throw new Error('无法恢复已展开的阅读位置；请重新打开该项。');
      if(descriptor.kind==='details'){el.open=true;await loadDetails(el);}
      else await applyReadingButton(el);
    }
  }
  const modified=e=>e.button!==0||e.metaKey||e.ctrlKey||e.altKey||e.shiftKey;
  function linkClick(e) {
    const el=e.target.closest('a[href]');if(!el||!el.hash.startsWith('#audit='))return false;
    if(modified(e)){if(fileMode){e.preventDefault();message('单页文件模式不能共享新标签；请运行 node serve.mjs 后使用本地服务。',true);}return true;}
    if(e.defaultPrevented)return true;e.preventDefault();
    run(async()=>{
      let hash=el.hash,sourceOnly=false;
      if(el.dataset.source) {
        const target=decodeRoute(hash);
        hash=encodeRoute({...state.route,key:state.record?.key||target.key,view:state.route.view||'audit',sourceKey:target.key,path:target.path||[]});
        sourceOnly=!!state.record;
      }
      await navigate(hash,true,sourceOnly,el);
    });return true;
  }
  document.addEventListener('auxclick',e=>{if(fileMode&&e.target.closest('a[href]')){e.preventDefault();message('新标签共享需要 node serve.mjs 本地服务。',true);}});
  document.addEventListener('click',e=>{
    if(e.target.closest('.skip-link')&&!modified(e)&&!e.defaultPrevented){e.preventDefault();$('main').focus();return;}
    if(linkClick(e))return;
    const el=e.target.closest('button');if(!el)return;const d=el.dataset;
    run(async()=>{
      if(el.disabled)return;el.disabled=true;
      try {
      if(d.action){await actions[d.action]?.();return;}
      if(d.resolve){const value=document.querySelector(`[data-merge="${d.field}"]`)?.value;await editor.resolve(editor.get(state.record.key,d.field),d.resolve,value);}
      else await applyReadingButton(el);
      }finally{if(el.isConnected)el.disabled=false;}
    });
  });
  document.addEventListener('toggle',e=>{
    const el=e.target;if(state.restoringReading||!el.open||el.dataset.loaded)return;
    if(el.dataset.card||el.dataset.lazy)run(()=>loadDetails(el));
  },true);
  $('kind-filter').innerHTML='<option value="">全部模型类型</option>'+SECTIONS.map(([s,m,k])=>`<option value="${s}">${m} · ${k}</option>`).join('');
  $('search').addEventListener('input',e=>{state.search=e.target.value;run(()=>sidebar());});
  $('kind-filter').addEventListener('change',e=>{state.filter=e.target.value;run(()=>sidebar());});
  $('file-input').addEventListener('change',e=>{if(e.target.files.length)run(()=>session.replace(e.target.files));});
  $('folder-input').addEventListener('change',e=>{const files=[...e.target.files].filter(f=>/\.ya?ml$/i.test(f.name));if(files.length)run(()=>session.replace(files));else message('目录内未找到 YAML 文件。',true);});
  const entry=target=>['review-note','review-status'].includes(target.id)?editor.get(state.record?.key,target.id==='review-note'?'note':'status'):null;
  document.addEventListener('input',e=>{const field=entry(e.target);if(field)try{editor.input(field,e.target.value);}catch(error){message(error.message,true);}});
  document.addEventListener('compositionstart',e=>{const field=entry(e.target);if(field)editor.composition(field,true);});
  document.addEventListener('compositionend',e=>{const field=entry(e.target);if(field)editor.composition(field,false);});
  window.addEventListener('popstate',applyHistory);
  window.addEventListener('hashchange',applyHistory);
  window.addEventListener('beforeunload',e=>{if(editor.pending()||client.state().metadata?.dirty){e.preventDefault();e.returnValue='';}});
  window.addEventListener('pagehide',()=>{state.active=false;state.generation++;client.pagehide();statusChanged();});
  window.addEventListener('pageshow',e=>{if(e.persisted){state.active=true;statusChanged();message('页面已恢复但连接已离开；请显式重新接入，缓存不是权威数据。',true);}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){state.showSource=false;$('workspace').classList.add('hide-inspector');}if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)){e.preventDefault();$('search').focus();}});
  let depth=0;
  window.addEventListener('dragenter',e=>{if(!e.dataTransfer?.types.includes('Files'))return;e.preventDefault();depth++;$('drop-overlay').hidden=false;});
  window.addEventListener('dragleave',e=>{e.preventDefault();if(--depth<=0){depth=0;$('drop-overlay').hidden=true;}});
  window.addEventListener('dragover',e=>e.preventDefault());
  window.addEventListener('drop',e=>{e.preventDefault();depth=0;$('drop-overlay').hidden=true;if(e.dataTransfer?.files.length)run(()=>session.replace(e.dataTransfer.files));});
  return {replayReading,loadDetails};
}
