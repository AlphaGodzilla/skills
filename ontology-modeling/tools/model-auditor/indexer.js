import {REFS,LOCAL_REFS} from './schema.js';
import {walk,location,displayPath} from './parser.js';
export function buildIndex(files) {
  const records=files.flatMap(f=>f.records), byUid=new Map(), definitions=new Map(), issues=[];
  const addIssue=(code,message,record,path=[])=>issues.push({code,message,record,path,
    file:record.file,line:location(record,path).line});
  for (const [i,r] of records.entries()) {
    r.uid=`n${i}`; r.refs=[]; r.incoming=[]; r.unknown=[]; byUid.set(r.uid,r);
    const key=JSON.stringify([r.section,r.id]);
    if (!definitions.has(key)) definitions.set(key,[]);
    definitions.get(key).push(r);
  }
  for (const group of definitions.values()) if (group.length>1) {
    group.forEach(r=>addIssue('duplicate',`${r.kind} ID 重复：${r.id}（${group.length} 处定义）；不自动选择目标。`,r));
  }
  for (const r of records) {
    const locals=new Map();
    for (const [list,idKey,scope] of [['steps','stepId','step'],['activities','activityId','activity']]) {
      const items=r.data[list]; if (!Array.isArray(items)) continue;
      items.forEach((item,i)=>{
        const id=item?.[idKey], path=[list,i];
        if (typeof id!=='string'||!id) {addIssue('local',`${list}[${i}] 缺少 ${idKey}。`,r,path);return;}
        const key=JSON.stringify([scope,id]);
        if (!locals.has(key)) locals.set(key,[]);
        locals.get(key).push(path);
      });
    }
    for (const [key,paths] of locals) if (paths.length>1) addIssue('local',`局部 ID 重复：${JSON.parse(key)[1]}`,r,paths[0]);
    walk(r.data,(key,value,path,parent)=>{
      let section=Object.hasOwn(REFS,key)?REFS[key]:null;
      const local=Object.hasOwn(LOCAL_REFS,key)?LOCAL_REFS[key]:null;
      if (key==='targetRef') {
        const types=new Map([['BEHAVIOR','behaviors'],['OBJECT','aggregates'],['AGGREGATE','aggregates'],
          ['RULE','rules'],['EVENT','events'],['SCENARIO','event_scenarios'],['FLOW','flows'],
          ['REPORT','query_reports'],['SCREEN','screens'],['ACTOR','actors']]);
        section=types.get(parent.targetType);
      }
      if (!section&&!local) {
        if (/Refs?$/.test(key)) r.unknown.push({path,key,value});
        return;
      }
      if (value===null || value==='') {addIssue('reference','引用值为空。',r,path);return;}
      const values=Array.isArray(value)?value:[value];
      values.forEach((id,i)=>{
        const refPath=Array.isArray(value)?[...path,i]:path;
        if (typeof id!=='string') {addIssue('reference',`${displayPath(refPath)} 引用必须为字符串。`,r,refPath);return;}
        if (local) {
          const matches=locals.get(JSON.stringify([local,id]))||[];
          const ref={id,key,path:refPath,local:true,targetPath:matches.length===1?matches[0]:null,status:matches.length===1?'resolved':'missing'};
          r.refs.push(ref);
          if (matches.length!==1) addIssue('local',`当前${r.kind}内局部引用无法唯一解析：${id}`,r,refPath);
          return;
        }
        const targets=definitions.get(JSON.stringify([section,id]))||[];
        const ref={id,key,path:refPath,section,targets,local:false,
          status:targets.length===1?'resolved':targets.length?'ambiguous':'missing'};
        r.refs.push(ref);
        if (targets.length===1) targets[0].incoming.push({source:r,ref});
        else addIssue('reference',`${displayPath(refPath)} → ${id}：${targets.length?'存在重复定义':'未在本次导入中找到定义'}。`,r,refPath);
      });
    });
    r.refMap=new Map(r.refs.map(ref=>[JSON.stringify(ref.path),ref]));
  }
  const index={files,records,byUid,definitions,issues,addIssue};
  return index;
}
export function findRef(record,path) {
  const key=JSON.stringify(path);
  return record.refMap.get(key);
}
export function neighbors(record) {
  return [...new Set([...record.refs.filter(ref=>!ref.local&&ref.targets.length===1).map(ref=>ref.targets[0]),
    ...record.incoming.map(entry=>entry.source)])].filter(r=>r!==record);
}
export function objectContext(record) {
  const context=new Map();
  for (const neighbor of neighbors(record)) context.set(neighbor.uid,{record:neighbor,via:null});
  // A second hop is deliberate and visible, never an unbounded transitive closure.
  for (const {record:direct} of [...context.values()]) {
    if (!['behaviors','events','permissions','rules'].includes(direct.section)) continue;
    for (const item of neighbors(direct)) {
      if (item===record||item.section==='aggregates'||context.has(item.uid)) continue;
      context.set(item.uid,{record:item,via:direct});
    }
  }
  return [...context.values()];
}
