import {DEMO} from './demo.js';
import {LIMITS} from './schema.js';
import {validateFilePath} from './navigation.js';

function preflightFiles(inputs) {
  if(!inputs||!Number.isSafeInteger(inputs.length)||inputs.length<1)throw new Error('没有选择 YAML 文件。');
  if(inputs.length>LIMITS.files)throw new Error('本批超过 80 个文件。');
  const files=[...inputs],names=new Set();let bytes=0;
  for(const file of files) {
    if(!file||typeof file.name!=='string')throw new Error('文件元数据不合法。');
    const name=file.webkitRelativePath||file.name;validateFilePath(name);
    if(!/\.ya?ml$/i.test(name))throw new Error(`不支持的文件：${name}。请选择 .yaml / .yml。`);
    if(names.has(name))throw new Error(`本批包含同路径文件：${name}。`);
    names.add(name);
    if(!Number.isSafeInteger(file.size)||file.size<0||typeof file.arrayBuffer!=='function')throw new Error(`${name} 文件大小或读取接口不合法。`);
    if(file.size>LIMITS.fileBytes)throw new Error(`${name} 超过 12 MiB。`);
    bytes+=file.size;
  }
  if(bytes>LIMITS.totalBytes)throw new Error('本批合计超过 40 MiB。');
  return files;
}

export function createSessionActions({client,editor,message,readyDataset,statusChanged}) {
  let busy=false,exportHandle=null;const waiting=new Map(),acknowledging=new Set();
  const $=id=>document.getElementById(id);
  function settleBarrier() {
    const barrier=client.state().metadata?.barrier;
    for(const [token,p] of waiting) {
      if(barrier?.token!==token){p.reject(new Error('屏障已取消、超时或失效。'));waiting.delete(token);}
      else if(barrier.ready){p.resolve();waiting.delete(token);}
    }
    statusChanged();
  }
  function awaitBarrier(token) {
    const barrier=client.state().metadata?.barrier;
    if(barrier?.token===token&&barrier.ready)return Promise.resolve();
    return new Promise((resolve,reject)=>{waiting.set(token,{resolve,reject});settleBarrier();});
  }
  async function handleEvent(event) {
    if(event.type==='barrierStarted') {
      const {barrier}=event;
      if(!barrier.participants.includes(client.clientId))return;
      if(acknowledging.has(barrier.token))return;
      acknowledging.add(barrier.token);
      try {
        await editor.pause(barrier.token);
        if(client.state().metadata?.barrier?.token!==barrier.token)return;
        await client.command('ackBarrier',{token:barrier.token,paused:true});
      }catch(error) {
        message('不能同意全局操作：'+error.message,true);
        if(client.state().metadata?.barrier?.token===barrier.token)await client.command('cancelBarrier',{token:barrier.token});
      }finally{acknowledging.delete(barrier.token);}
    }
    if(['barrierAborted','exportGenerated'].includes(event.type))await editor.resume();
    settleBarrier();
  }
  function download(blob,name) {
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function replace(files,replaceAll=false,clear=false) {
    if(busy)return;busy=true;$('busy').hidden=false;let preparation,token,committed=false;
    try {
      const selected=clear?[]:preflightFiles(files);
      if(!confirm('将影响所有已接入标签页，并清空共享审阅记录。继续准备模型变更吗？'))return;
      $('busy-text').textContent='独立校验候选模型；当前模型与备注保持不变…';
      const inputs=[];
      for(const file of selected)inputs.push({path:file.webkitRelativePath||file.name,bytes:new Uint8Array(await file.arrayBuffer())});
      preparation=client.request(clear?'prepareClear':'prepareImport',clear?{}:{files:inputs,replaceAll});
      const candidate=await client.send(preparation);
      const result=await client.command('beginBarrier',{kind:'replace',candidateId:candidate.candidateId});token=result.barrier.token;
      $('busy-text').textContent='等待所有页面暂停并确认既有草稿…';await awaitBarrier(token);
      const meta=await client.query({type:'metadata'});
      if(!confirm(`所有接入页已暂停。最新审阅 R=${meta.reviewRevision}，已确认保存 R=${meta.exportedReviewRevision}。确认替换整个工作区并清空审阅？`))return;
      await client.command('commitCandidate',{token,confirmed:true,reviewRevision:meta.reviewRevision,exportedReviewRevision:meta.exportedReviewRevision});committed=true;
      await client.whenReady();await readyDataset(true);
      message('已载入模型；共享审阅记录已重置。仍需人工审查业务语义。');
    }catch(error){message((committed?'模型已载入，但目标链接无匹配或有歧义。\n':'导入失败；当前工作区未改动。\n')+error.message,true);}
    finally {
      if(!committed&&client.state().status==='ready') {
        if(token&&client.state().metadata?.barrier?.token===token)await client.command('cancelBarrier',{token}).catch(e=>message(e.message,true));
        if(preparation)await client.command('cancelPreparation',{targetRequestId:preparation.requestId}).catch(()=>{});
      }
      busy=false;$('busy').hidden=true;$('file-input').value='';$('folder-input').value='';statusChanged();
    }
  }
  async function abandon() {
    if(!exportHandle)return;
    await client.command('releaseExport',{snapshotId:exportHandle.snapshotId});exportHandle=null;
    $('save-export').hidden=true;$('abandon-export').hidden=true;
  }
  async function exportAll() {
    if(busy)return;busy=true;let token,handle;
    try {
      if(exportHandle){if(!confirm('上一份下载尚未确认保存。放弃该句柄并生成新的快照？'))return;await abandon();}
      const result=await client.command('beginBarrier',{kind:'export'});token=result.barrier.token;
      await awaitBarrier(token);
      ({download:handle}=await client.command('finishExport',{token}));
      // The complete snapshot released the barrier already; editing resumes during download.
      let offset=0,parts=[];
      do {const chunk=await client.query({type:'exportChunk',snapshotId:handle.snapshotId,offset,limit:16384});parts.push(chunk.text);offset=chunk.next;}while(offset!==null);
      exportHandle=handle;
      download(new Blob(parts,{type:'application/json;charset=utf-8'}),'omf-review-'+new Date().toISOString().slice(0,10)+'.json');
      $('save-export').hidden=false;$('abandon-export').hidden=false;message('已生成完整下载。请确认文件实际保存后再点击“确认已保存”；新编辑仍可能尚未导出。');
    }catch(error) {
      message('完整导出失败；未推进导出水位：'+error.message,true);
      if(handle&&client.state().status==='ready')await client.command('releaseExport',{snapshotId:handle.snapshotId}).catch(e=>message('下载句柄释放失败：'+e.message,true));
      if(token&&client.state().metadata?.barrier?.token===token)await client.command('cancelBarrier',{token}).catch(()=>{});
    }finally{busy=false;statusChanged();}
  }
  async function saved() {
    if(!exportHandle||!confirm('已在磁盘保存并核对这份完整 JSON 文件吗？'))return;
    await client.command('confirmExport',{snapshotId:exportHandle.snapshotId,saved:true});
    exportHandle=null;$('save-export').hidden=true;$('abandon-export').hidden=true;statusChanged();message('已确认该快照保存；下载后新产生的审阅不会被清除。');
  }
  const recovery=()=>download(new Blob([JSON.stringify({...client.recoveryCopy(),localReviewDrafts:editor.recovery()},null,2)],{type:'application/json'}),'omf-incomplete-recovery.json');
  return {abandon,replace,handleEvent,settleBarrier,exportAll,saved,recovery,busy:()=>busy,
    demo:()=>replace(DEMO.map(([name,text])=>new File([text],name,{type:'application/yaml'})),true),
    clear:()=>replace([],true,true),cancel:()=>{const token=client.state().metadata?.barrier?.token;return token?client.command('cancelBarrier',{token}):Promise.resolve();}};
}
