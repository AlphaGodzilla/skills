import {getPathValue} from './navigation.js';
import {textBlockEnd} from './text-blocks.js';
import {location} from './parser.js';
import {neighbors,objectContext} from './indexer.js';

const fail=()=>{throw Object.assign(new Error('Invalid or oversized view query.'),{code:'INVALID_QUERY'});};
const clip=value=>{const text=String(value??'');return text.slice(0,textBlockEnd(text,0,512));};
const kind=value=>value===null?'null':Array.isArray(value)?'array':typeof value;
const summary=r=>({key:r.key,id:clip(r.id),name:clip(r.name),section:r.section,model:r.model,kind:r.kind,idField:r.idField,refs:r.refs.length,incoming:r.incoming.length,unknown:r.unknown.length,
  file:r.file.name,fileSha256:r.file.hash,path:[...r.path],line:r.loc.line,idLength:r.id.length,nameLength:r.name.length});
const page=(items,offset,limit,map)=>({total:items.length,offset,next:offset+limit<items.length?offset+limit:null,
  items:items.slice(offset,offset+limit).map(map)});

/** Initial handshake metadata has no source, index, reviews or unbounded file array. Files are paged. */
export function viewMetadata(metadata) {
  const {files,...rest}=metadata;
  return structuredClone({...rest,fileCount:files.length});
}

/**
 * Owner-only synchronous projection. Never accepts functions, expressions or HTML.
 * UI must escape every string (including source/scalar text); DTOs are data, not trusted markup.
 * Lists <=100, fields <=50 immediate children (containers have no value), scalar <=4096 UTF-16
 * units, source <=16 original lines with <=4096 units each. Source offset is relative to the
 * resolved location; columnOffset pages long lines. Alias node uses its original alias line,
 * child paths use parser-resolved anchor locations. source.key identifies the source owner, separate from the page's review owner.
 * definition summaries retain stable key/file hash/path; issues/refs preserve attribution and
 * ambiguity. refs targets are independently paged. All DTOs <=128 KiB; excess fails, never truncates
 * an identity/path silently. Caller stamps datasetVersion/requestId; stale results must be ignored.
 */
export function queryView(index,q) {
  if (!q||Object.getPrototypeOf(q)!==Object.prototype) fail();
  const fields={definitions:['offset','limit','section','search'],files:['offset','limit'],
    issues:['offset','limit','key'],definition:['key'],fields:['key','path','offset','limit'],
    scalar:['key','path','offset','limit'],source:['key','path','offset','limit','columnOffset','wholeFile'],
    refs:['key','offset','limit','targetOffset'],context:['key','offset','limit','aggregate','path'],incoming:['key','offset','limit'],
    reference:['key','path','targetOffset'],matrix:['offset','limit'],legacy:['target'],unknown:['key','offset','limit'],fileText:['file','field','offset','limit']};
  if (typeof q.type!=='string'||!Object.hasOwn(fields,q.type)||Object.keys(q).some(k=>k!=='type'&&!fields[q.type].includes(k))) fail();
  const max=q.type==='source'?16:['scalar','fileText'].includes(q.type)?4096:q.type==='fields'?50:100;
  const offset=q.offset??0,limit=q.limit??Math.min(25,max);
  if (!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>max) fail();
  const record=Object.hasOwn(q,'key')?index.byKey.get(q.key):null;
  if (Object.hasOwn(q,'key')&&!record) fail();
  if (['definition','fields','scalar','source','refs','context','incoming','reference'].includes(q.type)&&!record) fail();
  let dto;
  if (q.type==='definitions') {
    if ((q.search!==undefined&&(typeof q.search!=='string'||q.search.length>256))||
      (q.section!==undefined&&typeof q.section!=='string')) fail();
    dto=page(index.records.filter(r=>(!q.section||r.section===q.section)&&
      (!q.search||q.search.toLowerCase().trim().split(/\s+/).every(t=>`${r.id} ${r.name} ${r.file.name} ${r.model}`.toLowerCase().includes(t)))),offset,limit,summary);
  } else if (q.type==='files') dto=page(index.files,offset,limit,f=>({path:f.name,sha256:f.hash,bytes:f.bytes,
    definitions:f.records.length,warningCount:f.warnings.length,warnings:f.warnings.map(clip).slice(0,20)}));
  else if (q.type==='issues') dto=page(index.issues.filter(x=>!q.key||x.record===record),offset,limit,
    x=>({code:x.code,message:clip(x.message),key:x.record.key,file:x.file.name,line:x.line,path:[...x.path]}));
  else if (q.type==='definition') dto=summary(record);
  else if (q.type==='fields'||q.type==='scalar') {
    const value=getPathValue(record.data,q.path??[]);
    if (q.type==='scalar') {
      if (value!==null&&typeof value==='object') fail();
      const text=String(value??''),end=textBlockEnd(text,offset,limit);dto={kind:kind(value),text:text.slice(offset,end),total:text.length,
        next:end<text.length?end:null};
    } else {
      if (!value||typeof value!=='object') fail();
      const keys=Array.isArray(value)?Array.from(value.keys()):Object.keys(value);
      dto={kind:kind(value),...page(keys,offset,limit,k=>({path:[...(q.path??[]),k],kind:kind(value[k]),
        ...(value[k]!==null&&typeof value[k]==='object'?{count:Object.keys(value[k]).length}:
          {preview:clip(value[k]),length:String(value[k]??'').length})}))};
    }
  } else if (q.type==='source') {
    getPathValue(record.data,q.path??[]);
    const loc=location(record,q.path??[]),column=q.columnOffset??0;
    if (!Number.isSafeInteger(column)||column<0) fail();
    if (q.wholeFile!==undefined&&typeof q.wholeFile!=='boolean') fail();
    const first=q.wholeFile?1:loc.line,last=q.wholeFile?record.file.lines.length:loc.endLine;
    const start=first-1+offset,total=last-first+1;
    dto={key:record.key,file:record.file.name,fileSha256:record.file.hash,location:{...loc},total,
      next:offset+limit<total?offset+limit:null,columnOffset:column,
      lines:record.file.lines.slice(start,Math.min(start+limit,last)).map((line,i)=>{
        const end=textBlockEnd(line,column,4096);return {line:start+i+1,text:line.slice(column,end),length:line.length,nextColumn:end<line.length?end:null};
      })};
  } else if (q.type==='refs') {
    const targetOffset=q.targetOffset??0;if (!Number.isSafeInteger(targetOffset)||targetOffset<0) fail();
    dto=page(record.refs,offset,limit,r=>({id:clip(r.id),path:[...r.path],local:r.local,status:r.status,
      targetPath:r.targetPath??null,...(r.local?{}:{targets:page(r.targets,targetOffset,20,summary)})}));
  } else if (q.type==='context') {
    if (q.aggregate!==undefined&&typeof q.aggregate!=='boolean') fail();
    if(q.path!==undefined){
      getPathValue(record.data,q.path);
      const targets=[...new Set(record.refs.filter(r=>!r.local&&r.targets.length===1&&q.path.every((part,i)=>r.path[i]===part)).map(r=>r.targets[0]))];
      dto=page(targets,offset,limit,summary);
    }else
    dto=q.aggregate?page(objectContext(record),offset,limit,x=>({record:summary(x.record),via:x.via?.key??null})):
      page(neighbors(record),offset,limit,summary);
  }
  if (q.type==='incoming') dto=page(record.incoming,offset,limit,x=>({source:summary(x.source),path:[...x.ref.path]}));
  if (q.type==='reference') {
    getPathValue(record.data,q.path??[]);
    const ref=record.refs.find(r=>JSON.stringify(r.path)===JSON.stringify(q.path??[]));
    const targetOffset=q.targetOffset??0;if (!Number.isSafeInteger(targetOffset)||targetOffset<0) fail();
    dto=ref?{id:clip(ref.id),path:[...ref.path],local:ref.local,status:ref.status,targetPath:ref.targetPath??null,
      ...(ref.local?{}:{targets:page(ref.targets,targetOffset,20,summary)})}:{status:'none'};
  }
  if (q.type==='legacy') {
    if (!Array.isArray(q.target)||q.target.length!==3||q.target.some(v=>typeof v!=='string'||v.length>4096)) fail();
    const matches=index.records.filter(r=>r.section===q.target[0]&&r.id===q.target[1]&&r.file.name===q.target[2]);
    if (matches.length!==1) throw Object.assign(new Error(matches.length?'Legacy target is ambiguous.':'Legacy target not imported.'),{code:matches.length?'AMBIGUOUS_LEGACY':'MISSING_DEFINITION'});
    dto=summary(matches[0]);
  }
  if (q.type==='matrix') {
    const rows=[];
    for (const role of index.records.filter(r=>r.section==='roles')) {
      const refs=role.refs.filter(r=>r.section==='permissions');
      for (const ref of refs.length?refs:[null]) rows.push({role,ref});
    }
    dto=page(rows,offset,limit,({role,ref})=>({role:summary(role),path:ref?.path??null,
      permission:ref?.targets.length===1?summary(ref.targets[0]):null,status:ref?.status??'none'}));
  }
  if(q.type==='fileText'){
    const file=index.files.find(f=>f.name===q.file);if(!file||typeof q.field!=='string')fail();let value;
    if(['domain','version','model_type'].includes(q.field))value=Object.hasOwn(file.data,q.field)?file.data[q.field]:'未声明';
    else if(/^warning:(0|[1-9][0-9]*)$/.test(q.field)){const i=Number(q.field.slice(8));if(!Number.isSafeInteger(i)||i>=file.warnings.length)fail();value=file.warnings[i];}else fail();
    const text=value!==null&&typeof value==='object'?JSON.stringify(value):String(value??'null');
    const end=textBlockEnd(text,offset,limit);dto={text:text.slice(offset,end),total:text.length,next:end<text.length?end:null};
  }
  if (q.type==='unknown') {if(!record)fail();dto=page(record.unknown,offset,limit,x=>({path:[...x.path]}));}
  if (new TextEncoder().encode(JSON.stringify(dto)).length>131072) throw Object.assign(new Error('View page exceeds the DTO byte window; request fewer items.'),{code:'VIEW_TOO_LARGE'});
  return dto;
}
