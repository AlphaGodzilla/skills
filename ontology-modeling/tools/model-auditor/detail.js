import {esc,label} from './schema.js';
import {neighbors,objectContext} from './indexer.js';
import {displayPath} from './parser.js';
import {button,refView,sourceButton,valueView,selectedFields,recordCard} from './render.js';
export function detailView(r,index,tab='audit') {
  const count=index.issues.filter(x=>x.record===r).length;
  return `<div class="breadcrumb">模型工作台 <span>/</span> ${r.model} <span>/</span> ${esc(r.kind)}</div>
    <header class="record-hero"><div><span class="eyebrow">${r.model} / ${esc(r.section)}</span><h1>${esc(r.name)}</h1><code>${esc(r.id)}</code></div><div class="hero-actions">${sourceButton(r,[],'定位原文')}${count?`<span class="issue-badge">${count} 项提示</span>`:'<span class="muted">未发现已覆盖的检查问题</span>'}</div></header>
    ${r.data.description?`<p class="description">${esc(r.data.description)}</p>`:''}
    <div class="tabs" role="tablist">${[['audit',r.section==='aggregates'?'对象聚合':r.section==='event_scenarios'?'场景审计':r.section==='flows'?'流程审计':'审计摘要'],['fields','全部字段'],['refs',`引用关系 · ${r.refs.length+r.incoming.length}`]].map(([key,title])=>`<button role="tab" aria-selected="${tab===key}" class="${tab===key?'active':''}" data-tab="${key}">${esc(title)}</button>`).join('')}</div>
    ${tab==='fields'?fieldsView(r):tab==='refs'?referencesView(r):auditView(r,index)}`;
}
function fieldsView(r) {
  return `<p class="hint">展示所有原始字段。嵌套结构按需展开，# 可定位精确原文。</p>${selectedFields(r,Object.keys(r.data))}`;
}
function auditView(r,index) {
  const ownIssues=index.issues.filter(x=>x.record===r);
  const alerts=ownIssues.length?`<details class="warning-box"><summary>${ownIssues.length} 项需核查提示（展开定位）</summary>${ownIssues.map(x=>`<p>${esc(x.message)} ${sourceButton(r,x.path)}</p>`).join('')}</details>`:'';
  const unknown=r.unknown.length?`<p class="warning-box">有 ${r.unknown.length} 个引用字段未纳入 MVP 解析：${r.unknown.map(x=>esc(displayPath(x.path))).join('、')}。请在“全部字段”和原文中人工核查。</p>`:'';
  if (r.section==='aggregates') {
    const context=objectContext(r),direct=context.filter(x=>!x.via).length;
    return `${alerts}${unknown}<section><h2>对象定义 <span class="small muted">M1 原值</span></h2>
      <p class="hint">生命周期仅展示声明的状态；不从表达式猜测状态转换。</p>
      ${selectedFields(r,['alias','lifecycle','attributes','invariants','entities','valueObjects'])}</section>
      <section><h2>关联业务闭环 <span class="count">${context.length}</span></h2>
      <p class="hint">${direct} 个直接关联；其余经行为 / 事件 / 规则 / 权限扩展一跳。关联不代表业务链路已验证。</p>
      ${context.length?contextCards(context):'<div class="empty-small">尚无已解析的关联定义。可继续导入其他模型文件。</div>'}</section>`;
  }
  if (['event_scenarios','flows'].includes(r.section)) {
    const scenario=r.section==='event_scenarios',key=scenario?'steps':'activities';
    return `${alerts}${unknown}${selectedFields(r,scenario?
      ['sourceObjectRef','targetObjectRefs','triggerEventRef','preconditions','postconditions']:
      ['flowType','businessObjectRefs','roleRefs','trigger','preconditions','postconditions','startActivity','endActivities'])}
      <section><h2>${scenario?'场景步骤 · M4':'流程活动 · M6'}</h2>
      <p class="hint">按 YAML 声明顺序排列，不推断执行顺序。以 nextSteps / nextActivities / branches 中的显式连接为准。</p>
      ${stepsView(r,key)}</section>`;
  }
  const keys=Object.keys(r.data).filter(k=>![r.idField,'name','eventName','description'].includes(k));
  return `${alerts}${unknown}<section><h2>定义与约束</h2>${selectedFields(r,keys)}</section>
    <section><h2>关联定义</h2>${contextCards(neighbors(r).map(record=>({record,via:null})))}</section>`;
}
export function contextCards(context,offset=0) {
  const slice=context.slice(offset,offset+40);
  return slice.map(x=>recordCard(x.record,x.via?`经 ${x.via.name}`:'直接关联')).join('')+
    (offset+40<context.length?`<div class="context-more"><button data-context-more="${offset+40}">展开更多关联（剩余 ${context.length-offset-40}）</button></div>`:'');
}
export function stepsView(r,key,offset=0) {
  const list=Array.isArray(r.data[key])?r.data[key]:[];
  if (!list.length) return '<p class="muted">未声明步骤 / 活动。</p>';
  return list.slice(offset,offset+24).map((step,j)=>{
    const i=offset+j,path=[key,i],refs=r.refs.filter(ref=>!ref.local&&ref.path[0]===key&&ref.path[1]===i);
    const targets=[...new Set(refs.filter(ref=>ref.targets.length===1).map(ref=>ref.targets[0]))];
    return `<article class="step"><header><span class="step-index">${esc(step?.stepId||step?.activityId||'?')}</span><strong>${esc(step?.name||step?.stepType||step?.activityType||'未声明类型')}</strong>${sourceButton(r,path)}</header>
      ${valueView(r,step,path)}${targets.map(t=>recordCard(t,'步骤关联定义 · 展开就地审查')).join('')}</article>`;
  }).join('')+(offset+24<list.length?`<div class="step-more"><button data-step-more="${offset+24}" data-key="${key}">继续展开步骤（剩余 ${list.length-offset-24}）</button></div>`:'');
}
function referencesView(r) {
  return `<section><h2>向外引用 <span class="count">${r.refs.length}</span></h2>${refRows(r,r.refs,0)}</section>
    <section><h2>被引用位置 <span class="count">${r.incoming.length}</span></h2>${incomingRows(r,0)}</section>`;
}
export function refRows(r,refs,offset) {
  return refs.slice(offset,offset+80).map(ref=>`<div class="reference-row"><code>${esc(displayPath(ref.path))}</code><span>${refView(r,ref)}</span>${sourceButton(r,ref.path)}</div>`).join('')+
    (offset+80<refs.length?`<div class="refs-more"><button data-refs-more="${offset+80}">更多引用</button></div>`:'');
}
export function incomingRows(r,offset) {
  return r.incoming.slice(offset,offset+80).map(({source,ref})=>`<div class="reference-row">${button(source)}<code>${esc(displayPath(ref.path))}</code>${sourceButton(source,ref.path)}</div>`).join('')+
    (offset+80<r.incoming.length?`<div class="incoming-more"><button data-incoming-more="${offset+80}">更多被引用位置</button></div>`:'');
}
