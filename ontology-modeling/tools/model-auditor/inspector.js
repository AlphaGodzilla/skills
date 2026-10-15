import {esc} from './schema.js';
import {displayPath} from './parser.js';
export function inspectorView(r) {
  if(!r)return '<div class="inspector-empty">选择一个模型定义，即可对照原文并记录审阅结论。</div>';
  return `<div class="inspector-title"><span>原文对照</span><span class="badge">READ ONLY</span><button data-action="source" aria-label="关闭原文与审阅面板">×</button></div><div id="source-body" aria-live="polite">正在读取原文…</div>
    <div class="review-box" data-review-owner="${esc(r.key)}"><div class="inspector-title"><span>人工审阅</span><span class="muted">当前填写审阅的定义</span></div><strong>${esc(r.name)}</strong><code>${esc(r.id)}</code>
    <label for="review-status">审阅结论</label><select id="review-status" disabled><option value="pending">待审阅</option><option value="approved">通过（人工结论）</option><option value="changes">需修改</option></select><div id="status-conflict"></div>
    <label for="review-note">审计备注</label><textarea id="review-note" rows="4" maxlength="65536" disabled placeholder="正在登记字段草稿租约…"></textarea><div id="note-conflict"></div>
    <p id="sync-status" role="status">连接中</p><p class="hint">已同步仅代表易失内存中的共享确认，不代表文件已保存。源 YAML 不会被修改。</p><button class="wide" data-action="export">↓ 导出审阅记录 JSON</button></div>`;
}
export async function sourceView(r,query,path=[],start=null) {
  const focus=await query({type:'source',key:r.key,path,offset:0,limit:1,wholeFile:true});
  start=Math.max(1,Math.min(focus.total,start??Math.max(1,focus.location.line-3)));
  let lines=[];
  for(let offset=start-1;offset<Math.min(start-1+120,focus.total);) {
    const dto=await query({type:'source',key:r.key,path,offset,limit:Math.min(16,start-1+120-offset),wholeFile:true});lines.push(...dto.lines);if(!dto.lines.length)break;offset+=dto.lines.length;
  }
  const loc=focus.location;
  return {start,total:focus.total,html:`<div class="source-meta"><strong>原文所属定义：${esc(r.name)}</strong><span>${esc(r.file)}</span><code>${esc(displayPath([...r.path,...path]))}</code><span>定位 L${loc.line}–${loc.endLine}</span></div>
    <div class="source-controls"><button data-source-page="-120" aria-label="上一段原文">↑</button><label>行 <input id="line-input" type="number" min="1" max="${focus.total}" value="${start}"></label><button data-action="line">跳转</button><button data-source-page="120" aria-label="下一段原文">↓</button><span>/ ${focus.total}</span></div>
    <div class="source-code" tabindex="0" aria-label="YAML 原文">${lines.map(line=>`<div class="source-line ${line.line>=loc.line&&line.line<=loc.endLine?'highlight':''}"><span>${line.line}</span><code>${esc(line.text)||' '}</code>${line.nextColumn!==null?`<button data-source-column="${line.nextColumn}" data-line="${line.line}">继续本行（${line.length} 字）</button>`:''}</div>`).join('')}</div>`};
}

/** Legacy v1 serializer kept for consumers of the single-page export format; UI exports core v2. */
export function exportReviews(state) {
  return {format:'omf-auditor-review-v1',exportedAt:new Date().toISOString(),
    limitations:'人工结论与 MVP 基础检查，不替代完整 OMF 校验或业务审计。',
    files:state.index.files.map(f=>({path:f.name,sha256:f.hash,bytes:f.bytes})),
    reviews:state.index.records.map(r=>({model:r.model,section:r.section,id:r.id,file:r.file.name,
      fileSha256:r.file.hash,line:r.loc.line,...(state.reviews.get(r.uid)||{status:'pending',note:''})})),
    issues:state.index.issues.map(x=>({code:x.code,message:x.message,file:x.file.name,
      line:x.line,id:x.record.id,fieldPath:displayPath(x.path)}))};
}
