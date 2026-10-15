import {esc} from './schema.js';
import {displayPath} from './parser.js';

export async function detailView(r,ui,tab='audit') {
  const {source,href}=ui;
  const title=r.section==='aggregates'?'对象聚合':r.section==='event_scenarios'?'场景审计':r.section==='flows'?'流程审计':'审计摘要';
  const tabs=[['audit',title],['fields','全部字段'],['refs',`引用关系 · ${r.refs+r.incoming}`]];
  return `<div class="breadcrumb">模型工作台 / ${esc(r.model)} / ${esc(r.kind)}</div>
    <header class="record-hero"><div><span class="eyebrow">${esc(r.model)} / ${esc(r.section)}</span><h1>${esc(r.name)}${r.nameLength>512?'（预览；全部字段可展开全文）':''}</h1><code>${esc(r.id)}${r.idLength>512?'…':''}</code></div><div class="hero-actions">${source(r,[],'定位原文')}</div></header>
    <div class="tabs" aria-label="定义视图">${tabs.map(([view,label])=>`<a data-tab="${view}" href="${esc(href({page:'models',key:r.key,view}))}" class="${tab===view?'active':''}" aria-current="${tab===view?'page':'false'}">${esc(label)}</a>`).join('')}</div>`+
    (tab==='fields'?await ui.container(r):tab==='refs'?await referencesView(r,ui):await auditView(r,ui));
}
export async function unknownRows(r,ui,offset=0) {
  const dto=await ui.query({type:'unknown',key:r.key,offset,limit:100});
  return dto.items.map(x=>`<p>${esc(displayPath(x.path))} ${ui.source(r,x.path)}</p>`).join('')+
    (dto.next!==null?`<div class="unknown-more"><button data-unknown-more="${dto.next}">更多未解析引用字段</button></div>`:'');
}
async function auditView(r,ui) {
  const issues=await ui.query({type:'issues',key:r.key,offset:0,limit:80});
  let alerts=issues.total?`<details class="warning-box"><summary>${issues.total} 项需核查提示（问题页可逐段查看全部）</summary>${issues.items.map(x=>`<p>${esc(x.message)} ${ui.source(r,x.path)}</p>`).join('')}</details>`:'';
  if(r.unknown)alerts+=`<details class="warning-box"><summary>有 ${r.unknown} 个引用字段未纳入 MVP 解析，请人工核查</summary>${await unknownRows(r,ui)}</details>`;
  if(r.section==='aggregates')return alerts+`<section><h2>对象定义 <span class="small muted">M1 原值</span></h2><p class="hint">生命周期仅展示声明，不从表达式猜测状态转换。</p>${await ui.selected(r,['description','alias','lifecycle','attributes','invariants','entities','valueObjects'])}</section><section><h2>关联业务闭环</h2><p class="hint">直接关联及经行为 / 事件 / 规则 / 权限扩展一跳。关联不代表业务链路已验证。</p>${await contextCards(r,ui)}</section>`;
  if(['event_scenarios','flows'].includes(r.section)) {
    const scenario=r.section==='event_scenarios',key=scenario?'steps':'activities';
    return alerts+await ui.selected(r,scenario?['description','sourceObjectRef','targetObjectRefs','triggerEventRef','preconditions','postconditions']:
      ['description','flowType','businessObjectRefs','roleRefs','trigger','preconditions','postconditions','startActivity','endActivities'])+
      `<section><h2>${scenario?'场景步骤 · M4':'流程活动 · M6'}</h2><p class="hint">按 YAML 声明顺序，不推断执行顺序。以显式连接为准。</p>${await stepsView(r,ui,key)}</section>`;
  }
  return alerts+`<section><h2>定义与约束</h2>${await ui.container(r)}</section><section><h2>关联定义</h2>${await contextCards(r,ui)}</section>`;
}
export async function contextCards(r,ui,offset=0) {
  const dto=await ui.query({type:'context',key:r.key,aggregate:r.section==='aggregates',offset,limit:40});
  return dto.items.map(x=>ui.card(x.record||x,x.via?'经关联定义扩展一跳':'直接关联')).join('')+
    (dto.next!==null?`<div class="context-more"><button data-context-more="${dto.next}">展开更多关联（剩余 ${dto.total-dto.next}）</button></div>`:'');
}
export async function stepContext(r,ui,path,offset=0) {
  const dto=await ui.query({type:'context',key:r.key,path,offset,limit:40});
  return dto.items.map(target=>ui.card(target,'步骤关联定义 · 展开就地审查')).join('')+
    (dto.next!==null?`<div class="step-context-more"><button data-step-context-more="${dto.next}" data-path="${esc(JSON.stringify(path))}">更多步骤关联</button></div>`:'');
}
export async function stepsView(r,ui,key,offset=0) {
  let rootOffset=0,found=false;
  do{const root=await ui.query({type:'fields',key:r.key,path:[],offset:rootOffset,limit:50});found=root.items.some(x=>x.path[0]===key&&x.kind==='array');rootOffset=root.next;}while(!found&&rootOffset!==null);
  if(!found)return '<p class="muted">未声明步骤 / 活动。</p>';
  const dto=await ui.query({type:'fields',key:r.key,path:[key],offset,limit:24});let body='';
  for(const item of dto.items) {
    body+=`<article class="step"><header><span class="step-index">${item.path[1]+1}</span>${ui.source(r,item.path)}</header>${await (['object','array'].includes(item.kind)?ui.container(r,item.path):ui.value(r,item))}${await stepContext(r,ui,item.path)}</article>`;
  }
  return body+(dto.next!==null?`<div class="step-more"><button data-step-more="${dto.next}" data-key="${key}">继续展开步骤</button></div>`:'');
}
async function referencesView(r,ui) {
  return `<section><h2>向外引用 <span class="count">${r.refs}</span></h2>${await refRows(r,ui)}</section><section><h2>被引用位置 <span class="count">${r.incoming}</span></h2>${await incomingRows(r,ui)}</section>`;
}
export async function refRows(r,ui,offset=0) {
  const dto=await ui.query({type:'refs',key:r.key,offset,limit:80});let rows='';
  for(const ref of dto.items)rows+=`<div class="reference-row"><code>${esc(displayPath(ref.path))}</code><span>${await ui.ref(r,ref)}</span>${ui.source(r,ref.path)}</div>`;
  return rows+(dto.next!==null?`<div class="refs-more"><button data-refs-more="${dto.next}">更多引用</button></div>`:'');
}
export async function incomingRows(r,ui,offset=0) {
  const dto=await ui.query({type:'incoming',key:r.key,offset,limit:80});
  return dto.items.map(x=>`<div class="reference-row">${ui.link(x.source)}<code>${esc(displayPath(x.path))}</code>${ui.source(x.source,x.path)}</div>`).join('')+
    (dto.next!==null?`<div class="incoming-more"><button data-incoming-more="${dto.next}">更多被引用位置</button></div>`:'');
}
