import {esc} from './schema.js';
export function welcome() {
  return `<div class="welcome"><div class="welcome-mark">◎</div><span class="eyebrow">ONTOLOGY MODEL AUDITOR / MVP</span>
    <h1>把跨模型跳转，<br>变成一次连贯审查。</h1>
    <p>导入 OMF YAML，在同一处检查对象、行为、规则、事件与流程。<br>每个定义都保留来源，每一条关联都有依据。</p>
    <div class="welcome-actions"><button class="primary" data-action="import">＋ 导入模型文件</button><button data-action="demo">加载合同示例 →</button></div>
    <div class="welcome-grid"><div><span>01 / 聚合</span><h3>按业务对象审查</h3><p>相关定义就地展开，减少文件间来回切换。</p></div><div><span>02 / 追溯</span><h3>引用与原文对照</h3><p>查看显式引用、被引用位置与准确行号。</p></div><div><span>03 / 留痕</span><h3>记录人工结论</h3><p>审阅状态和备注可导出为带文件指纹的 JSON。</p></div></div>
    <p class="privacy">● 完全离线 · 无上传 · 无持久化存储 · 易失内存；请及时导出</p>
    <div class="notice">支持 M1–M6、ME 及可选 M7 / MU / MM / MI。仅提供基础引用与部分一致性检查，不替代 omf_validate.py --strict 或人工业务审计。</div></div>`;
}
export async function issuePage(ui,offset=0) {
  const dto=await ui.query({type:'issues',offset,limit:80});let rows='';
  for(const x of dto.items) {
    const r=await ui.query({type:'definition',key:x.key});
    rows+=`<article class="issue"><span class="issue-type">${esc(x.code)}</span><div><strong>${esc(x.message)}</strong><p>${ui.link(r)} <span class="muted">${esc(x.file)}</span></p></div>${ui.source(r,x.path)}</article>`;
  }
  const more=dto.next!==null?`<div class="issues-more"><button data-issues-more="${dto.next}">继续显示问题（剩余 ${dto.total-dto.next}）</button></div>`:'';
  return (offset?'':`<div class="page-heading"><span class="eyebrow">CHECKS / LIMITED COVERAGE</span><h1>问题清单 <span class="count">${dto.total}</span></h1><p>只提供基础引用及部分一致性检查，不替代完整 OMF 校验或人工业务审查。</p></div>`)+rows+more;
}
export async function fileText(ui,file,field,offset=0) {
  const dto=await ui.query({type:'fileText',file,field,offset,limit:4096});
  return `<span class="scalar">${esc(dto.text)}</span>`+(dto.next!==null?`<div class="more-slot"><button data-file-text-more="${dto.next}" data-file="${esc(file)}" data-field="${esc(field)}">继续查看全文</button></div>`:'');
}
export async function fileWarnings(ui,file,total,offset=0) {
  let body='';for(let i=offset;i<Math.min(offset+20,total);i++)body+=`<p class="warning-text">${await fileText(ui,file,'warning:'+i)}</p>`;
  return body+(offset+20<total?`<div class="file-warnings-more"><button data-file-warnings-more="${offset+20}" data-file="${esc(file)}" data-total="${total}">更多根键提示</button></div>`:'');
}
export async function filesPage(ui,offset=0) {
  const dto=await ui.query({type:'files',offset,limit:40});
  let rows='';
  for(const f of dto.items){
    let metadata='';for(const field of ['domain','version','model_type'])metadata+=`<div>${field}: ${await fileText(ui,f.path,field)}</div>`;
    rows+=`<article class="file-card"><header><strong>${esc(f.path)}</strong><span>${f.definitions} 个定义 · ${(f.bytes/1024).toFixed(1)} KiB</span></header>${metadata}<details><summary>SHA-256 指纹 / 根键提示</summary><code class="hash">${esc(f.sha256)}</code>${await fileWarnings(ui,f.path,f.warningCount)}</details></article>`;
  }
  return (offset?'':`<div class="page-heading"><span class="eyebrow">IMPORT / IN MEMORY ONLY</span><h1>导入文件</h1><p>追加导入按路径替换；失败整批不生效。成功操作影响所有接入页并清空共享审阅。</p></div><div class="toolbar"><button class="primary" data-action="import">＋ 追加 / 替换文件</button><button data-action="folder">选择 yaml 目录</button><button class="danger" data-action="clear">清空工作区</button></div><p class="hint">单文件 ≤ 12 MiB，合计 ≤ 40 MiB，最多 80 个文件。请选择模型目录，勿选择项目根目录。</p>`)+rows+
    (dto.next!==null?`<div class="files-more"><button data-files-more="${dto.next}">更多文件</button></div>`:'');
}
export async function matrixPage(ui,offset=0) {
  const dto=await ui.query({type:'matrix',offset,limit:60});let body='';
  for(const {role,path,permission:p} of dto.items) {
    const permissionRef=path?await ui.query({type:'reference',key:role.key,path}):null;
    body+=`<tr><td>${ui.link(role)}<code>${esc(role.id)}</code></td><td>${permissionRef?await ui.ref(role,permissionRef):'未直接授予权限'}</td><td>${p?await ui.selected(p,['targetRef']):'—'}</td><td>${p?await ui.selected(p,['dataScope','abacCondition']):'—'}</td><td>${await ui.selected(role,['inheritsFrom'])}</td></tr>`;
  }
  const more=dto.next!==null?`<button data-matrix-more="${dto.next}">更多权限行（剩余 ${dto.total-dto.next}）</button>`:'';
  if(offset)return {body,more};
  return `<div class="page-heading"><span class="eyebrow">ACCESS / DIRECT GRANTS</span><h1>角色权限矩阵</h1><p>只列角色直接授予的权限；不计算继承、ABAC 或运行时最终授权。</p></div><div class="table-scroll"><table><thead><tr><th>角色</th><th>权限</th><th>目标</th><th>数据范围 / ABAC</th><th>继承角色（未展开计算）</th></tr></thead><tbody id="matrix-body">${body}</tbody></table></div><div id="matrix-more">${more}</div>`;
}
