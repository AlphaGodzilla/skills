import {esc,label} from './schema.js';
import {displayPath} from './parser.js';
export const encoded=path=>esc(JSON.stringify(path));

/** Render bounded DTOs only. href is URL-encoded by the router, then HTML-escaped here. */
export function createRenderer(query,href) {
  const boundedQuery=query;
  query=async q=>{try{return await boundedQuery(q);}catch(error){if(error.code==='VIEW_TOO_LARGE'&&Number.isSafeInteger(q.limit)&&q.limit>1)return query({...q,limit:Math.floor(q.limit/2)});throw error;}};
  const link=(r,text=r.name,view='audit')=>`<a class="link" data-go="${esc(r.key)}" href="${esc(href({page:'models',key:r.key,view}))}" title="${esc(r.id)}">${esc(text)}</a>`;
  const source=(r,path=[],text='原文')=>`<a class="source-link" data-source="${esc(r.key)}" data-path="${encoded(path)}" href="${esc(href({page:'models',key:r.key,view:'source',path}))}" title="${esc(displayPath([...r.path,...path]))}">${esc(text)}</a>`;
  const more=(attr,value,path=[],key='')=>`<div class="more-slot"><button ${attr}="${value}" data-path="${encoded(path)}" data-key="${esc(key)}">继续展开</button></div>`;
  const card=(r,reason='')=>`<details class="record-card" data-card="${esc(r.key)}"><summary><span class="badge">${esc(r.model)} · ${esc(r.kind)}</span><strong>${esc(r.name)}</strong><span class="muted reason">${esc(reason)}</span><code>${esc(r.id)}</code></summary><div class="card-body"></div></details>`;
  async function ref(r,reference) {
    if(reference.status==='none')return '';
    if(reference.status!=='resolved')return `<span class="bad-ref" title="未找到定义或存在重复定义">${esc(reference.id)} ↗?（${esc(reference.status)}）</span>`;
    if(reference.local)return source(r,reference.targetPath,reference.id+' ↓');
    return link(reference.targets.items[0],reference.id);
  }
  async function scalar(r,path,offset=0) {
    const dto=await query({type:'scalar',key:r.key,path,offset,limit:4096});
    return `<span class="scalar">${esc(dto.kind==='null'?'null':dto.text)}</span>`+
      (dto.next!==null?more('data-scalar-more',dto.next,path,r.key):'');
  }
  async function value(r,item,depth=0) {
    const reference=await query({type:'reference',key:r.key,path:item.path});
    if(reference.status!=='none')return await ref(r,reference)+(item.length>512?`<details><summary>查看完整引用值</summary>${await scalar(r,item.path)}</details>`:'');
    if(!['array','object'].includes(item.kind))return scalar(r,item.path);
    if(!item.count)return `<span class="muted mono">${item.kind==='array'?'[]':'{}'}</span>`;
    if(depth>1)return `<details class="nested" data-lazy="${esc(r.key)}" data-path="${encoded(item.path)}"><summary>展开${item.kind==='array'?'列表':'字段'} · ${item.count} 项</summary><div class="lazy-body"></div></details>`;
    return container(r,item.path,0,depth);
  }
  async function container(r,path=[],offset=0,depth=0) {
    const dto=await query({type:'fields',key:r.key,path,offset,limit:24});let body='';
    for(const item of dto.items) {
      const html=await value(r,item,depth+1),key=item.path.at(-1);
      body+=dto.kind==='array'?`<div class="list-row"><span class="ordinal">${Number(key)+1}</span><div>${html}</div></div>`:
        `<div class="field"><dt title="${esc(key)}">${esc(label(key))}${source(r,item.path,'#')}</dt><dd>${html}</dd></div>`;
    }
    return `<${dto.kind==='array'?'div class="value-list"':'dl class="fields"'}>${body}</${dto.kind==='array'?'div':'dl'}>`+
      (dto.next!==null?more('data-more',dto.next,path,r.key):'');
  }
  async function selected(r,keys) {
    // A root is paged too: custom fields after the first page remain visible in "全部字段".
    let offset=0,body='';
    do {
      const dto=await query({type:'fields',key:r.key,path:[],offset,limit:50});
      for(const item of dto.items.filter(x=>keys.includes(x.path[0])))body+=`<div class="field"><dt>${esc(label(item.path[0]))}${source(r,item.path,'#')}</dt><dd>${await value(r,item)}</dd></div>`;
      offset=dto.next;
    }while(offset!==null);
    return `<dl class="fields">${body}</dl>`;
  }
  async function fillCard(r) {
    return `<div class="card-actions">${link(r,'打开完整定义 →')}${source(r)}</div>`+await selected(r,
      ['ownerEntity','preconditions','postconditions','appliedRules','requiredPermissions','expression','eventTriggerCondition',
      'triggerCondition','payload','subscribers','producedEvents','subscribedEvents','triggeredBehaviors','dataScope','abacCondition','targetRef','permissions','inheritsFrom']);
  }
  return {query,href,link,source,card,ref,scalar,value,container,selected,fillCard,more};
}
