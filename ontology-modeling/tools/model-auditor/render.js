import {esc,label} from './schema.js';
import {isObject,location,displayPath} from './parser.js';
import {findRef} from './indexer.js';
export const encoded = path=>esc(JSON.stringify(path));
export const button = (r,text=r.name)=>`<button class="link" data-go="${esc(r.uid)}" title="${esc(r.id)}">${esc(text)}</button>`;
export function refView(r,ref) {
  if (ref.status!=='resolved') return `<span class="bad-ref" title="未找到定义或存在重复定义">${esc(ref.id)} ↗?</span>`;
  if (ref.local) return `<button class="link mono" data-source="${r.uid}" data-path="${encoded(ref.targetPath)}">${esc(ref.id)} ↓</button>`;
  return button(ref.targets[0],ref.id);
}
export function sourceButton(r,path=[],text='原文') {
  return `<button class="source-link" data-source="${r.uid}" data-path="${encoded(path)}" title="${esc(displayPath([...r.path,...path]))}">${esc(text)} · L${location(r,path).line}</button>`;
}
export function valueView(r,value,path=[],depth=0) {
  const ref=findRef(r,path);
  if (ref) return refView(r,ref);
  if (value===null) return '<span class="muted mono">null</span>';
  if (typeof value!=='object') return `<span class="${typeof value==='string'?'scalar':'mono'}">${esc(value)}</span>`;
  if (Array.isArray(value)&&!value.length) return '<span class="muted mono">[]</span>';
  if (isObject(value)&&!Object.keys(value).length) return '<span class="muted mono">{}</span>';
  if (depth>1) return lazyValue(r,value,path);
  return containerView(r,value,path,0,depth);
}
export function lazyValue(r,value,path,title=null) {
  const count=Object.keys(value).length;
  return `<details class="nested" data-lazy="${r.uid}" data-path="${encoded(path)}"><summary>${esc(title||`展开 ${Array.isArray(value)?'列表':'字段'} · ${count} 项`)}</summary><div class="lazy-body"></div></details>`;
}
export function containerView(r,value,path=[],offset=0,depth=0) {
  if (Array.isArray(value)) {
    const slice=value.slice(offset,offset+24);
    const simple=slice.every(v=>!v||typeof v!=='object');
    const body=slice.map((item,i)=>simple?
      `<span class="chip">${valueView(r,item,[...path,offset+i],depth+1)}</span>`:
      `<div class="list-row"><span class="ordinal">${offset+i+1}</span><div>${valueView(r,item,[...path,offset+i],depth+1)}</div></div>`).join('');
    return `<div class="${simple?'chips':'value-list'}">${body}</div>${offset+24<value.length?moreButton(r,path,offset+24,value.length):''}`;
  }
  const entries=Object.entries(value),slice=entries.slice(offset,offset+24);
  return `<dl class="fields">${slice.map(([key,v])=>`<div class="field"><dt title="${esc(key)}">${esc(label(key))}${sourceButton(r,[...path,key],'#')}</dt><dd>${valueView(r,v,[...path,key],depth+1)}</dd></div>`).join('')}</dl>${offset+24<entries.length?moreButton(r,path,offset+24,entries.length):''}`;
}
function moreButton(r,path,offset,total) {
  return `<div class="more-slot"><button data-more="${r.uid}" data-path="${encoded(path)}" data-offset="${offset}">继续展开 ${Math.min(24,total-offset)} 项（剩余 ${total-offset}）</button></div>`;
}
export function getValue(r,path) {
  let value=r.data;
  for (const key of path) {
    if (value===null||typeof value!=='object'||!Object.hasOwn(value,key)) throw new Error('字段路径已失效。');
    value=value[key];
  }
  return value;
}
export function selectedFields(r,keys) {
  return `<dl class="fields">${keys.filter(key=>Object.hasOwn(r.data,key)).map(key=>`<div class="field"><dt>${esc(label(key))}${sourceButton(r,[key],'#')}</dt><dd>${valueView(r,r.data[key],[key])}</dd></div>`).join('')}</dl>`;
}
export function recordCard(r,reason='') {
  return `<details class="record-card" data-card="${r.uid}"><summary><span class="badge">${r.model} · ${r.kind}</span><strong>${esc(r.name)}</strong><span class="muted reason">${esc(reason)}</span><code>${esc(r.id)}</code></summary><div class="card-body" data-card-body="${r.uid}"></div></details>`;
}
export function fillCard(r) {
  const keys=['ownerEntity','preconditions','postconditions','appliedRules','requiredPermissions','expression','eventTriggerCondition',
    'triggerCondition','payload','subscribers','producedEvents','subscribedEvents','triggeredBehaviors',
    'dataScope','abacCondition','targetRef','permissions','inheritsFrom'];
  const picked=keys.filter(k=>Object.hasOwn(r.data,k));
  return `<div class="card-actions">${button(r,'打开完整定义 →')}${sourceButton(r)}</div>${selectedFields(r,picked.length?picked:Object.keys(r.data).slice(0,5))}`;
}
