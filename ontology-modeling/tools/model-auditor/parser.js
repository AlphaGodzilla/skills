import {parseDocument, isMap, isSeq, isAlias, LineCounter} from 'yaml';
import {SECTIONS, LIMITS} from './schema.js';
export const pathKey = path => JSON.stringify(path);
export const displayPath = path => path.map((p,i) => typeof p === 'number' ? `[${p}]` : `${i?'.':''}${p}`).join('');
export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function parseFile(name, text) {
  const counter = new LineCounter();
  const doc = parseDocument(text, {lineCounter:counter, uniqueKeys:true, strict:true, version:'1.2'});
  if (doc.errors.length || doc.warnings.length) {
    throw new Error(`${name}: ${[...doc.errors,...doc.warnings].map(e=>e.message).join('\n')}`);
  }
  if (!isMap(doc.contents)) throw new Error(`${name}: 顶层必须为 YAML 映射。`);
  if (/^[\s\uFEFF]*[\[{]/u.test(text)) throw new Error(`${name}: OMF 顶层必须使用块状 YAML，不能整体写成 JSON / flow。`);
  const data = doc.toJS({maxAliasCount:100});
  const locations = new Map(); let count = 0;
  function locate(node, path=[], depth=0) {
    if (++count > LIMITS.nodes || depth > LIMITS.depth) throw new Error(`${name}: 节点或嵌套层级超过 MVP 安全上限。`);
    if (node?.range) {
      const [start,end] = node.range;
      locations.set(pathKey(path), {start,end,line:counter.linePos(start).line,
        endLine:counter.linePos(Math.max(start,end-1)).line});
    }
    if (isAlias(node)) node=node.resolve(doc);
    if (isMap(node)) for (const pair of node.items) {
      if (typeof pair.key?.value !== 'string') throw new Error(`${name}: 不支持非字符串映射键。`);
      locate(pair.value,[...path,pair.key.value],depth+1);
    }
    if (isSeq(node)) node.items.forEach((n,i)=>locate(n,[...path,i],depth+1));
  }
  locate(doc.contents);
  // Check expanded aliases as well as the syntax tree; cyclic aliases are rejected.
  let expanded = 0; const active = new Set();
  function bounded(value,depth=0) {
    if (++expanded>LIMITS.nodes || depth>LIMITS.depth) throw new Error(`${name}: 展开后的 YAML 结构超过安全上限。`);
    if (value && typeof value==='object') {
      if (active.has(value)) throw new Error(`${name}: 不支持循环 YAML 锚点。`);
      active.add(value); Object.values(value).forEach(v=>bounded(v,depth+1)); active.delete(value);
    }
  }
  bounded(data);
  const file = {name,text,data,locations,lines:text.split(/\r?\n/),records:[],warnings:[]};
  for (const [section,model,kind,idField] of SECTIONS) {
    if (!Object.hasOwn(data,section)) continue;
    if (!Array.isArray(data[section])) throw new Error(`${name}: ${section} 必须是列表。`);
    data[section].forEach((value,i)=>{
      const path = [section,i], loc = locations.get(pathKey(path)) || locations.get('[]');
      if (!isObject(value)) throw new Error(`${name}:${loc.line}: ${displayPath(path)} 必须是映射。`);
      const id = value[idField];
      if (typeof id !== 'string' || !id.trim()) throw new Error(`${name}:${loc.line}: ${displayPath(path)} 缺少字符串 ${idField}。`);
      for (const field of ['name','eventName','objectName']) {
        if (Object.hasOwn(value,field) && typeof value[field]!=='string') throw new Error(`${name}:${loc.line}: ${field} 必须是字符串。`);
      }
      file.records.push({id,name:value.name||value.eventName||value.objectName||id,
        section,model,kind,idField,data:value,file,path,loc,uid:'',refs:[],incoming:[]});
    });
  }
  const recognized = SECTIONS.some(([key])=>Object.hasOwn(data,key));
  if (!recognized) throw new Error(`${name}: 未找到支持的模型根键（如 aggregates / behaviors / events）。`);
  for (const key of Object.keys(data)) {
    if (!SECTIONS.some(([s])=>s===key) && !['model_type','version','domain'].includes(key)) {
      file.warnings.push(`根键 ${key} 未建立审计索引；可在文件原文中查看。`);
    }
  }
  return file;
}
export function location(record, relative=[]) {
  for (let n=relative.length;n>=0;n--) {
    const loc = record.file.locations.get(pathKey([...record.path,...relative.slice(0,n)]));
    if (loc) return loc;
  }
  return record.loc;
}
export function walk(value, visit, path=[]) {
  if (Array.isArray(value)) return value.forEach((v,i)=>walk(v,visit,[...path,i]));
  if (!isObject(value)) return;
  for (const [key,child] of Object.entries(value)) {
    visit(key,child,[...path,key],value); walk(child,visit,[...path,key]);
  }
}
