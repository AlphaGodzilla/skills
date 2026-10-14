import {SECTIONS,esc} from './schema.js';
import {button,sourceButton,refView} from './render.js';
export function welcome() {
  return `<div class="welcome"><div class="welcome-mark">◎</div><span class="eyebrow">ONTOLOGY MODEL AUDITOR / MVP</span>
    <h1>把跨模型跳转，<br>变成一次连贯审查。</h1>
    <p>导入 OMF YAML，在同一处检查对象、行为、规则、事件与流程。<br>每个定义都保留来源，每一条关联都有依据。</p>
    <div class="welcome-actions"><button class="primary" data-action="import">＋ 导入模型文件</button><button data-action="demo">加载合同示例 →</button></div>
    <div class="welcome-grid"><div><span>01 / 聚合</span><h3>按业务对象审查</h3><p>相关定义就地展开，减少文件间来回切换。</p></div><div><span>02 / 追溯</span><h3>引用与原文对照</h3><p>查看显式引用、被引用位置与准确行号。</p></div><div><span>03 / 留痕</span><h3>记录人工结论</h3><p>审阅状态和备注可导出为带文件指纹的 JSON。</p></div></div>
    <p class="privacy">● 完全离线 · 无上传 · 无持久化存储 · 刷新即清空</p>
    <div class="notice">支持 M1–M6、ME 及可选 M7 / MU / MM / MI。仅提供基础引用与部分一致性检查，不替代 omf_validate.py --strict 或人工业务审计。</div></div>`;
}
export function issuePage(index,offset=0) {
  const issues=index.issues;
  const rows=issues.slice(offset,offset+80).map(x=>`<article class="issue"><span class="issue-type">${esc(x.code)}</span><div><strong>${esc(x.message)}</strong><p>${button(x.record)} <span class="muted">${esc(x.file.name)}</span></p></div>${sourceButton(x.record,x.path)}</article>`).join('');
  const more=offset+80<issues.length?`<div class="issues-more"><button data-issues-more="${offset+80}">继续显示（剩余 ${issues.length-offset-80}）</button></div>`:'';
  if (offset) return rows+more;
  const unknown=index.records.reduce((n,r)=>n+r.unknown.length,0);
  return `<div class="page-heading"><span class="eyebrow">CHECKS / LIMITED COVERAGE</span><h1>问题清单 <span class="count">${issues.length}</span></h1><p>未找到定义也可能是模型尚未导入；提示数量不是业务正确性评分。</p></div>
    <div class="notice">覆盖：已登记的跨模型 ID、M4/M6 局部 ID、重复 ID、事件生产与规则订阅镜像、部分流程约束及 M2/M7 配对。未覆盖完整 OMF schema、表达式语义与业务完备性。${unknown?`另有 ${unknown} 个未支持的引用字段，已在各定义页提示。`:''}</div>
    <div id="issue-rows">${rows||'<div class="empty-small">本次导入中未发现上述检查覆盖的问题。仍需人工审查。</div>'}${more}</div>`;
}
export function filesPage(index) {
  return `<div class="page-heading"><span class="eyebrow">IMPORT / IN MEMORY ONLY</span><h1>导入文件</h1><p>可多次追加导入；同路径文件替换。任一文件解析失败时整批不生效，保留当前工作区。</p></div>
    <div class="toolbar"><button class="primary" data-action="import">＋ 追加 / 替换文件</button><button data-action="folder">选择 yaml 目录</button><button class="danger" data-action="clear">清空工作区</button></div>
    <p class="hint">单文件 ≤ 12 MiB，合计 ≤ 40 MiB，最多 80 个文件；深层结构与别名展开受安全限制。请选择模型目录，勿选择项目根目录。</p>
    ${index.files.map(f=>`<article class="file-card"><header><strong>${esc(f.name)}</strong><span>${f.records.length} 个定义 · ${(f.bytes/1024).toFixed(1)} KiB</span></header>
      <p>domain: ${esc(f.data.domain??'未声明')} · version: ${esc(f.data.version??'未声明')} · model_type: ${esc(f.data.model_type??'未声明')}</p>
      <details><summary>SHA-256 指纹 / 根键提示</summary><code class="hash">${esc(f.hash)}</code>${f.warnings.map(w=>`<p class="warning-text">${esc(w)}</p>`).join('')}${f.warnings.length?'':'<p class="muted">无未支持的根键。</p>'}</details></article>`).join('')}`;
}
export function permissionRows(index) {
  const rows=[];
  for (const role of index.records.filter(r=>r.section==='roles')) {
    const permissions=role.refs.filter(ref=>ref.section==='permissions');
    if (!permissions.length) rows.push({role,ref:null});
    else for (const ref of permissions) rows.push({role,ref});
  }
  return rows;
}
export function matrixPage(index,offset=0) {
  const rows=permissionRows(index);
  const body=rows.slice(offset,offset+60).map(({role,ref})=>{
    const p=ref?.targets?.length===1?ref.targets[0]:null;
    return `<tr><td>${button(role)}<code>${esc(role.id)}</code></td><td>${ref?refView(role,ref):'未直接授予权限'}</td><td>${p?.refs.filter(r=>r.key==='targetRef').map(r=>refView(p,r)).join('')||'—'}</td><td><strong>${esc(p?.data.dataScope||'未声明')}</strong><p class="mono">${esc(p?.data.abacCondition||'')}</p></td><td>${role.refs.filter(r=>r.key==='inheritsFrom').map(r=>refView(role,r)).join(' / ')||'—'}</td></tr>`;
  }).join('');
  const more=offset+60<rows.length?`<button data-matrix-more="${offset+60}">更多权限行（剩余 ${rows.length-offset-60}）</button>`:'';
  if (offset) return {body,more};
  return `<div class="page-heading"><span class="eyebrow">ACCESS / DIRECT GRANTS</span><h1>角色权限矩阵</h1><p>只列角色直接授予的权限；不计算继承、ABAC 或运行时的最终授权。</p></div><div class="table-scroll"><table><thead><tr><th>角色</th><th>权限</th><th>目标</th><th>数据范围 / ABAC</th><th>继承角色（未展开计算）</th></tr></thead><tbody id="matrix-body">${body}</tbody></table></div><div id="matrix-more">${more}</div>`;
}
