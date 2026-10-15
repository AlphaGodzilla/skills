/** Field-local drafts: leases precede input; one CAS in flight; confirmations never replace later text. */
export function createReviewEditor(client,changed) {
  const entries=new Map();let paused=false,barrierToken=null;
  const name=(key,field)=>`${key}:${field}`;
  const pending=()=>[...entries.values()].some(e=>e.dirty||e.inflight||e.conflict||e.composing);
  const notify=()=>changed();
  async function lease(e) {
    if(e.lease||paused||client.state().status!=='ready'||client.state().metadata?.barrier)return;
    if(e.opening)return e.opening;
    e.opening=client.command('openDraft',{key:e.key,field:e.field}).then(async result=>{
      if(!e.dirty&&!e.conflict){e.current=result.current;e.value=result.current.value;}
      try{client.setDraft(name(e.key,e.field),e.value);}catch(error){await client.command('discardDraft',{draftId:result.draftId});throw error;}
      e.lease=result.draftId;
    }).finally(()=>{e.opening=null;notify();});
    return e.opening;
  }
  async function ensure(key,field) {
    const id=name(key,field);let e=entries.get(id);
    if(e?.releasing){await e.releasing;return ensure(key,field);}
    if(!e){e={key,field,value:'',current:{value:field==='status'?'pending':'',revision:0},dirty:false,lease:null,inflight:null,conflict:null,composing:false};entries.set(id,e);}
    await lease(e);return e;
  }
  function input(e,value) {
    if(paused||!e.lease||e.conflict)throw new Error('编辑租约尚未就绪，或编辑已暂停。');
    e.value=value;e.dirty=e.value!==e.current.value;client.setDraft(name(e.key,e.field),value);notify();
    if(!e.composing)void flush(e).catch(error=>{e.error=error.message;notify();});
  }
  async function drain(e) {
    if(e.inflight)await e.inflight;
    if(e.conflict||e.composing)throw new Error('存在冲突或输入法组合，不能同意屏障。');
    if(!e.dirty)return;
    if(!e.lease)await lease(e);
    if(!e.lease)throw new Error('后续草稿尚无租约，必须取消屏障后继续同步。');
    const value=e.value,draftId=e.lease;
    const command=client.request('setReview',{key:e.key,field:e.field,value,baseRevision:e.current.revision,draftId,keepDraft:true,
      ...(barrierToken?{token:barrierToken}:{})});
    e.command=command;
    e.inflight=client.send(command).then(result=>{
      if(result.status==='conflict'){e.conflict={current:result.current,local:e.value};return;}
      e.current=result.current;e.dirty=e.value!==value;
      client.setDraft(name(e.key,e.field),e.value);
    }).finally(()=>{e.inflight=null;notify();});
    await e.inflight;
    if(e.conflict)throw new Error('字段冲突，保留本地草稿。');
    if(e.dirty){await lease(e);await drain(e);}else if(!paused)await lease(e);
  }
  function flush(e) {
    if(e.draining)return e.draining;
    e.draining=drain(e).finally(()=>{e.draining=null;});return e.draining;
  }
  async function pause(token) {
    paused=true;barrierToken=token;notify();
    for(const e of entries.values()) {
      if(e.opening)await e.opening;
      await flush(e);
      if(e.lease){await client.command('discardDraft',{draftId:e.lease,token});e.lease=null;client.discardDraft(name(e.key,e.field));}
    }
  }
  async function resume() {
    paused=false;barrierToken=null;
    for(const e of entries.values())if(!e.conflict)await lease(e);
    notify();
  }
  function remote(event) {
    const e=entries.get(name(event.key,event.field));if(!e)return;
    if(e.inflight||e.dirty||e.composing||e.conflict){e.remote=event.current;notify();return;}
    e.current=event.current;e.value=event.current.value;notify();
  }
  async function resolve(e,choice,value) {
    if(!e.conflict||paused)throw new Error('当前不能解决冲突。');
    e.current=e.conflict.current;e.conflict=null;e.error=null;
    if(choice==='accept') {
      if(e.lease)await client.command('discardDraft',{draftId:e.lease});e.lease=null;e.value=e.current.value;e.dirty=false;
      client.discardDraft(name(e.key,e.field));await lease(e);
    }else {e.value=value;e.dirty=true;client.setDraft(name(e.key,e.field),value);await flush(e);}
    notify();
  }
  async function refresh() {
    for(const e of entries.values()) {
      const review=await client.query({type:'review',key:e.key}),current=review[e.field];
      if(e.lease){try{await client.command('discardDraft',{draftId:e.lease});}catch(error){if(error.code!=='INVALID_DRAFT')throw error;}e.lease=null;}
      if(e.dirty||e.error){e.conflict={current,local:e.value};e.dirty=true;}else{e.current=current;e.value=current.value;}
      e.error=null;e.composing=false;await lease(e);
    }
    notify();
  }
  async function activate(key) {
    for(const [id,e] of entries)if(e.key!==key&&!e.dirty&&!e.conflict&&!e.inflight&&!e.opening&&!e.composing){
      e.releasing||=(async()=>{if(e.lease)await client.command('discardDraft',{draftId:e.lease});client.discardDraft(id);entries.delete(id);})();await e.releasing;
    }
  }
  return {ensure,activate,refresh,input,flush,pause,resume,remote,resolve,pending,entries,
    get:(key,field)=>entries.get(name(key,field)),paused:()=>paused,
    async reset(){for(const e of entries.values())client.discardDraft(name(e.key,e.field));entries.clear();paused=false;barrierToken=null;notify();},
    composition(e,active){e.composing=active;if(!active&&e.dirty)void flush(e).catch(error=>{e.error=error.message;notify();});},
    recovery:()=>[...entries.values()].filter(e=>e.dirty||e.conflict).map(e=>({key:e.key,field:e.field,value:e.value,current:e.current,conflict:e.conflict}))};
}
