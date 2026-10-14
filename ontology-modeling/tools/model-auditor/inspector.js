import {esc} from './schema.js';
import {location,displayPath} from './parser.js';
export function inspectorView(state) {
  const r=state.index.byUid.get(state.selected);
  if (!r) return '<div class="inspector-empty">选择一个模型定义，<br>即可对照原文并记录审阅结论。</div>';
  const focus=state.source||{record:r,path:[]},f=focus.record.file;
  const loc=location(focus.record,focus.path),start=state.sourceStart||Math.max(1,loc.line-3);
  const end=Math.min(start+119,f.lines.length),review=state.reviews.get(r.uid)||{status:'pending',note:''};
  return `<div class="inspector-title"><span>原文对照</span><span class="badge">READ ONLY</span><button data-action="source" aria-label="关闭原文与审阅面板" title="关闭面板">×</button></div>
    <div class="source-meta"><strong>${esc(f.name)}</strong><code>${esc(displayPath([...focus.record.path,...focus.path]))}</code><span>定位 L${loc.line}–${loc.endLine}</span></div>
    <div class="source-controls"><button data-source-page="-120" aria-label="上一段原文">↑</button><label>行 <input id="line-input" type="number" min="1" max="${f.lines.length}" value="${start}"></label><button data-action="line">跳转</button><button data-source-page="120" aria-label="下一段原文">↓</button><span>/ ${f.lines.length}</span></div>
    <div class="source-code" tabindex="0" aria-label="YAML 原文">${f.lines.slice(start-1,end).map((line,i)=>`<div class="source-line ${start+i>=loc.line&&start+i<=loc.endLine?'highlight':''}"><span>${start+i}</span><code>${esc(line)||' '}</code></div>`).join('')}</div>
    <div class="review-box"><div class="inspector-title"><span>人工审阅</span><span class="muted">当前定义</span></div><strong>${esc(r.name)}</strong><code>${esc(r.id)}</code>
      <label for="review-status">审阅结论</label><select id="review-status"><option value="pending" ${review.status==='pending'?'selected':''}>待审阅</option><option value="approved" ${review.status==='approved'?'selected':''}>通过（人工结论）</option><option value="changes" ${review.status==='changes'?'selected':''}>需修改</option></select>
      <label for="review-note">审计备注</label><textarea id="review-note" rows="4" placeholder="记录发现的问题、确认依据或待确认事项…">${esc(review.note)}</textarea>
      <p class="hint">仅存于当前页面内存。关闭或重新导入前，请导出记录。源 YAML 不会被修改。</p><button class="wide" data-action="export">↓ 导出审阅记录 JSON</button></div>`;
}
export function setFocus(state,record,path=[]) {
  state.source={record,path};state.sourceStart=Math.max(1,location(record,path).line-3);
}
export function exportReviews(state) {
  return {format:'omf-auditor-review-v1',exportedAt:new Date().toISOString(),
    limitations:'人工结论与 MVP 基础检查，不替代完整 OMF 校验或业务审计。',
    files:state.index.files.map(f=>({path:f.name,sha256:f.hash,bytes:f.bytes})),
    reviews:state.index.records.map(r=>({model:r.model,section:r.section,id:r.id,file:r.file.name,
      fileSha256:r.file.hash,line:r.loc.line,...(state.reviews.get(r.uid)||{status:'pending',note:''})})),
    issues:state.index.issues.map(x=>({code:x.code,message:x.message,file:x.file.name,
      line:x.line,id:x.record.id,fieldPath:displayPath(x.path)}))};
}
