const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
const error=code=>Object.assign(new Error(code),{code});
const copy=value=>structuredClone(value);
export const newWorkspaceAddress=buildId=>({buildId,workspaceId:random(),credential:random(),datasetVersion:0});

/** Fixed URL + build/workspace name; never Blob URLs, opener discovery, or file-mode fallback. */
export function sharedWorkerTarget(pageURL,address) {
  const url=new URL(pageURL);
  if (url.protocol!=='http:'||url.hostname!=='127.0.0.1') throw error('SHARED_MODE_UNAVAILABLE');
  for(const value of [address.buildId,address.workspaceId,address.credential])
    if (typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)) throw error('INVALID_ADDRESS');
  return {url:new URL('workspace-worker.js',url).href,name:`omf:${address.buildId}:${address.workspaceId}`};
}

/**
 * DOM-free v1 port client. connect(port) resolves only after snapshot ACK/READY; disconnect/pagehide
 * keeps bounded cache/drafts and disables authority. pagehide sends explicit LEAVE (UI wires it).
 * Unexpected transport reconnect uses the private session/resume token. Explicit LEAVE ends that
 * session; the next connect is a fresh JOIN and old commands fail. Neither path creates authority.
 * request returns a stable canonical c<sequence> command. Retry the SAME DTO only while unconsumed;
 * RESULT ACK retires completed commands, whose older sequences are rejected rather than reexecuted.
 * No automatic write retries. At most 8 pending requests, 16 cached views / 1 MiB, 128 local drafts.
 * Queries are route-local DTOs, not renderable HTML: UI must escape strings and preserve view state.
 * onEvent callbacks receive committed events once, never command-result events. A gap/backpressure
 * requires snapshot resync, not a local authority; no ACK is sent before applying a received frame.
 */
export function createWorkspaceClient({address,mode='JOIN',clientId=random(),timeoutMs=5000,autoRetire=true}={}) {
  let port,status='disconnected',metadata=null,resumeToken=null,sessionId=null,readyResolve,readyReject,timer,queryId=0;
  const pending=new Map(),cache=new Map(),drafts=new Map(),listeners=new Set();
  const stateListeners=new Set(),readyWaiters=new Set();let requestSequence=0;
  const state=()=>({status,writable:status==='ready'&&!metadata?.barrier,metadata:copy(metadata)});
  const notifyState=()=>{for(const listener of stateListeners)listener(state());};
  const whenReady=()=>status==='ready'?Promise.resolve(state()):status==='disconnected'?Promise.reject(error('DISCONNECTED')):new Promise((resolve,reject)=>readyWaiters.add({resolve,reject}));
  const identity=()=>({workspaceId:address.workspaceId,instanceId:metadata?.instanceId,datasetVersion:metadata?.datasetVersion??address.datasetVersion,clientId,sessionId});
  const post=value=>{if (!port) throw error('DISCONNECTED');port.postMessage(value);};
  function rejectPending(code) {
    for(const p of pending.values()){clearTimeout(p.timer);p.reject(error(code));}pending.clear();
  }
  function disconnect(code='DISCONNECTED') {
    status='disconnected';clearTimeout(timer);readyReject?.(error(code));readyResolve=null;readyReject=null;
    rejectPending(code);port?.close();port=null;
    for(const waiter of readyWaiters)waiter.reject(error(code));readyWaiters.clear();notifyState();
  }
  function resync() {
    if (!port) throw error('DISCONNECTED');status='resyncing';post({type:'RESYNC'});
    clearTimeout(timer);timer=setTimeout(()=>disconnect('SYNC_TIMEOUT'),timeoutMs);
    notifyState();return whenReady();
  }
  function applyEvent(event) {
    if (!metadata||event.instanceId!==metadata.instanceId||event.workspaceId!==address.workspaceId) return disconnect('STALE_INSTANCE');
    if (event.sequence<=metadata.sequence) return;
    if (event.sequence!==metadata.sequence+1) return void resync().catch(()=>{});
    if (event.type!=='datasetCommitted'&&event.datasetVersion!==metadata.datasetVersion) return void resync().catch(()=>{});
    metadata.sequence=event.sequence;metadata.reviewRevision=event.reviewRevision;
    if (event.type==='datasetCommitted') {metadata.datasetVersion=event.datasetVersion;cache.clear();void resync().catch(()=>{});}
    if (event.type==='barrierStarted') metadata.barrier=copy(event.barrier);
    if (event.type==='barrierAcknowledged'&&metadata.barrier) {
      if (!metadata.barrier.acknowledged.includes(event.clientId)) metadata.barrier.acknowledged.push(event.clientId);
      metadata.barrier.ready=metadata.barrier.participants.every(id=>metadata.barrier.acknowledged.includes(id));
    }
    if (event.type==='barrierAborted'||(event.type==='exportGenerated'&&event.token)) metadata.barrier=null;
    if (event.type==='exportConfirmed') metadata.exportedReviewRevision=event.exportedReviewRevision;
    if(event.type==='reviewChanged'&&Number.isSafeInteger(event.reviewedCount))metadata.stats.reviewed=event.reviewedCount;
    metadata.dirty=metadata.reviewRevision>metadata.exportedReviewRevision;
    notifyState();
    for(const listener of listeners)listener(copy(event));
  }
  function receive(m) {
    try {
      if (m.type==='SNAPSHOT') {
        if (m.v!==1||m.buildId!==address.buildId||m.clientId!==clientId||m.metadata.workspaceId!==address.workspaceId||
          (metadata&&m.metadata.instanceId!==metadata.instanceId)) throw error('IDENTITY_MISMATCH');
        if(typeof m.sessionId!=='string'||!/^[a-f0-9]{64}$/.test(m.sessionId)||(sessionId&&sessionId!==m.sessionId))throw error('STALE_SESSION');
        metadata=copy(m.metadata);resumeToken=m.resumeToken;sessionId=m.sessionId;status='syncing';
        notifyState();
      } else if (m.type==='READY') {
        if (!metadata) throw error('INVALID_SNAPSHOT');
        status='ready';clearTimeout(timer);readyResolve?.();readyResolve=null;readyReject=null;
        for(const waiter of readyWaiters)waiter.resolve(state());readyWaiters.clear();notifyState();
      } else if (m.type==='EVENT') {if(status!=='resyncing')applyEvent(m.event);}
      else if (m.type==='RESYNC_REQUIRED') {rejectPending('RESYNC_REQUIRED');void resync().catch(()=>{});}
      else if (m.type==='ERROR'||m.type==='RESULT') {
        const p=pending.get(m.requestId);
        if (!p) {if(m.type==='ERROR'&&!m.requestId)disconnect(m.error.code);}
        else {
          clearTimeout(p.timer);pending.delete(m.requestId);
          if (m.type==='ERROR') p.reject(Object.assign(new Error(m.error.message),m.error));
          else if (p.query&&m.datasetVersion!==metadata.datasetVersion) p.reject(error('STALE_RESPONSE'));
          else {
            if (p.query) {
              cache.delete(p.cacheKey);cache.set(p.cacheKey,{datasetVersion:m.datasetVersion,value:copy(m.value)});
              while(cache.size>16||new TextEncoder().encode(JSON.stringify([...cache])).length>1048576)cache.delete(cache.keys().next().value);
            }
            p.resolve(copy(p.query?{...m.value,requestId:m.requestId,datasetVersion:m.datasetVersion}:m.value));
          }
        }
      } else throw error('INVALID_MESSAGE');
      if (m.deliveryId&&port)post({type:'ACK',deliveryId:m.deliveryId,...(autoRetire&&m.requestSequence?{requestSequence:m.requestSequence}:{})});
    } catch(e) {disconnect(e.code||'PROTOCOL_ERROR');}
  }
  function connect(nextPort) {
    if (port) disconnect();port=nextPort;status='connecting';
    notifyState();
    return new Promise((resolve,reject)=>{
      readyResolve=resolve;readyReject=reject;
      const active=port;
      active.addEventListener('message',e=>{if(port===active)receive(e.data);});
      active.addEventListener('messageerror',()=>{if(port===active)disconnect('MESSAGE_ERROR');});
      active.addEventListener('close',()=>{if(port===active)disconnect('DISCONNECTED');});
      active.start();timer=setTimeout(()=>disconnect('HANDSHAKE_TIMEOUT'),timeoutMs);
      post({type:'HELLO',v:1,mode:resumeToken?'JOIN':mode,buildId:address.buildId,
        workspaceId:address.workspaceId,credential:address.credential,clientId,
        datasetVersion:metadata?.datasetVersion??address.datasetVersion,
        ...(resumeToken?{resumeToken,sessionId,instanceId:metadata.instanceId}:{})});
    });
  }
  const request=(type,payload={})=>{const number=++requestSequence;return {...copy(payload),type,...identity(),requestId:`c${number}`,requestSequence:number};};
  function submit(message,query=false) {
    if (status!=='ready') return Promise.reject(error('READ_ONLY'));
    if (pending.has(message.requestId)) return Promise.reject(error('REQUEST_IN_FLIGHT'));
    if (pending.size>=8) return Promise.reject(error('REQUEST_BACKPRESSURE'));
    return new Promise((resolve,reject)=>{
      const entry={resolve,reject,query,cacheKey:JSON.stringify(message.query),timer:setTimeout(()=>disconnect('REQUEST_TIMEOUT'),timeoutMs)};
      pending.set(message.requestId,entry);
      try {post({...identity(),...message});}catch(e){disconnect(e.code||'DISCONNECTED');}
    });
  }
  const send=command=>submit({type:'COMMAND',requestId:command.requestId,command:copy(command)});
  const query=q=>submit({type:'QUERY',requestId:`q${++queryId}`,query:copy(q)},true);
  function setDraft(field,value) {
    if (typeof field!=='string'||field.length>256||typeof value!=='string'||value.length>65536||(!drafts.has(field)&&drafts.size>=128)) throw error('DRAFT_CAPACITY');
    drafts.set(field,value);
  }
  return {get clientId(){return clientId;},whenReady,onState(listener){stateListeners.add(listener);return ()=>stateListeners.delete(listener);},connect,request,send,command:(type,payload)=>send(request(type,payload)),query,resync,disconnect,
    retire(command){if(command.clientId!==clientId||command.sessionId!==sessionId)throw error('STALE_SESSION');post({type:'RETIRE',requestSequence:command.requestSequence});},
    pagehide(){if(port)post({type:'LEAVE'});disconnect();resumeToken=null;sessionId=null;clientId=random();requestSequence=0;mode='JOIN';},setDraft,discardDraft:field=>drafts.delete(field),
    onEvent(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    state,
    recoveryCopy:()=>({format:'omf-auditor-recovery-v1',authoritative:false,metadata:copy(metadata),
      workspaceId:metadata?.workspaceId,instanceId:metadata?.instanceId,datasetVersion:metadata?.datasetVersion,
      snapshotSequence:metadata?.sequence,reviewRevision:metadata?.reviewRevision,
      views:copy([...cache].map(([query,entry])=>({query:JSON.parse(query),...entry}))),
      drafts:[...drafts].map(([field,value])=>({field,value})),
      completeness:{complete:false,reason:'disconnected-client-cache'},
      warning:'Only received view fragments and local drafts; not an authoritative workspace snapshot.'})};
}

/** Native browser bootstrap; no local/file fallback. Keep returned worker/client together. */
export async function connectSharedWorkspace(pageURL,options) {
  const target=sharedWorkerTarget(pageURL,options.address);
  if (typeof globalThis.SharedWorker!=='function') throw error('SHARED_MODE_UNAVAILABLE');
  let worker;
  try {worker=new globalThis.SharedWorker(target.url,{name:target.name});}
  catch(cause){throw Object.assign(error('SHARED_MODE_UNAVAILABLE'),{cause});}
  const client=createWorkspaceClient(options);
  worker.addEventListener('error',()=>client.disconnect('WORKER_ERROR'));
  await client.connect(worker.port);
  return {worker,client};
}
