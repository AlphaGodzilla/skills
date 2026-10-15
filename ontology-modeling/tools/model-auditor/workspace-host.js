import {createWorkspace} from './workspace-core.js';
import {queryView,viewMetadata} from './snapshot.js';
import {createExportStream} from './export-stream.js';

const token=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const fail=code=>{throw Object.assign(new Error(code),{code});};
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
const errorDTO=e=>({code:e.code||'INVALID_MESSAGE',message:String(e.message).slice(0,512)});

/**
 * Trusted port owner (no DOM/HTTP). HELLO v1 explicitly CREATEs or JOINs; an empty JOIN expires.
 * The fixed worker name supplies workspaceId/buildId. 256-bit credentials travel only on ports
 * or navigation fragments. Each clientId is port-bound; resume requires a separate private token.
 * No heartbeat eviction: transport loss/resync leaves the core participant/drafts intact. Only
 * explicit LEAVE unregisters; a resumed active connection replaces its old port conservatively.
 * SNAPSHOT at S precedes all EVENTs >S. ACK is cumulative by deliveryId, not event/review sequence.
 * At most window frames/bytes are posted without ACK; overflow sends one RESYNC_REQUIRED, disables
 * commands, drops the transport queue only. No historical event log or auto approval is kept.
 *
 * Per-client monotonic command sequences use a bounded unretired receipt window. RESULT ACKs
 * retire consecutive consumed entries and release host/core receipts. Any older sequence fails
 * REQUEST_RETIRED, never reexecutes after eviction. Window retries retain content/signature checks.
 * Candidate and download limits concern ACTIVE resources, not lifetime attempts. Failed/cancelled
 * preparations and saved/abandoned snapshots release their slots. Accepted models can export in
 * <=16384-character cursor blocks regardless of total definition count or serialized JSON size.
 */
export function createWorkspaceHost({buildId,workspaceId,barrierTimeoutMs=30000,handshakeTimeoutMs=5000,
  windowFrames=8,windowBytes=524288,maxCommands=8,maxCommandBytes=1048576}={}) {
  if (!token(buildId)||!token(workspaceId)||!Number.isSafeInteger(windowFrames)||windowFrames<1||windowBytes<1024||!Number.isSafeInteger(maxCommands)||maxCommands<1) fail('INVALID_OPTIONS');
  let core=null,credential=null,lastEvent=0,deadlineTimer,closed=false,commandCount=0;
  const ports=new Set(),sessions=new Map(),receipts=new Map(),events=new Map(),candidateSlots=new Map(),downloads=new Map(),exportSlots=new Set();
  const capacity=()=>({receipts:{used:receipts.size,perClientLimit:maxCommands},receiptBytes:{used:[...sessions.values()].reduce((n,s)=>n+s.receiptBytes,0),perClientLimit:maxCommandBytes},
    candidates:{used:candidateSlots.size,limit:2},exports:{used:downloads.size+exportSlots.size,limit:4},clients:{used:sessions.size,limit:32}});
  const meta=()=>({...viewMetadata(core.metadata()),capacity:capacity()});
  function raw(p,value) {try {p.port.postMessage(value);} catch {p.synced=false;}}
  function resync(p) {
    if (p.resync) return;p.resync=true;p.synced=false;p.pending.clear();p.pendingBytes=0;
    raw(p,{type:'RESYNC_REQUIRED',reason:'BACKPRESSURE'});
  }
  function deliver(p,value) {
    if (p.resync||p.ended) return;
    const size=bytes(value);
    if (p.pending.size>=windowFrames||p.pendingBytes+size>windowBytes) return resync(p);
    const deliveryId=++p.deliveryId;p.pending.set(deliveryId,size);p.pendingBytes+=size;
    raw(p,{...value,deliveryId});
  }
  function schedule() {
    clearTimeout(deadlineTimer);if (closed) return;
    const deadline=core?.metadata().barrier?.deadline;
    if (deadline!==undefined) deadlineTimer=setTimeout(()=>{publish(core.expireBarrier()?.event);schedule();},Math.max(0,deadline-Date.now()));
  }
  function publish(event) {
    if(event?.type==='datasetCommitted'){candidateSlots.clear();downloads.clear();}
    if(event?.type==='barrierAborted')for(const [key,slot] of candidateSlots)if(slot.candidateId&&!core.hasCandidate(slot.candidateId))candidateSlots.delete(key);
    if (!event||event.sequence<=lastEvent) return;
    events.set(event.sequence,event);
    while (events.has(lastEvent+1)) {
      const next=events.get(++lastEvent);events.delete(lastEvent);
      for (const p of ports) if (p.session&&lastEvent>p.snapshotSequence) deliver(p,{type:'EVENT',event:next});
    }
    schedule();
  }
  function snapshot(p) {
    p.resync=false;p.synced=false;p.pending.clear();p.pendingBytes=0;
    const metadata=meta();p.snapshotSequence=metadata.sequence;
    deliver(p,{type:'SNAPSHOT',v:1,buildId,metadata,clientId:p.session.clientId,resumeToken:p.session.resumeToken,sessionId:p.session.sessionId});
    p.snapshotDelivery=p.deliveryId;
  }
  function detach(p,explicit=false) {
    if (p.ended) return;p.ended=true;clearTimeout(p.timer);ports.delete(p);
    if (p.session?.connection===p) {
      p.session.connection=null;
      if (explicit) {p.session.joined=false;publish(core.leave(p.session.clientId)?.event);}
      if(explicit){
        for(const entry of p.session.window.values())if(entry.done)retire(p.session,entry.number);
        for(const [key,slot] of candidateSlots)if(slot.clientId===p.session.clientId){if(slot.pending)slot.cancelled=true;else candidateSlots.delete(key);}
        for(const [snapshotId,d] of downloads)if(d.clientId===p.session.clientId){downloads.delete(snapshotId);core.releaseExport(snapshotId);}
        if(!p.session.window.size&&sessions.get(p.session.clientId)===p.session)sessions.delete(p.session.clientId);
      }
    }
    p.port.close();schedule();
  }
  function hello(p,m) {
    if (!m||Object.keys(m).some(k=>!['type','v','mode','buildId','workspaceId','credential','clientId','resumeToken','sessionId','instanceId','datasetVersion'].includes(k))||
      m.v!==1||!['CREATE','JOIN'].includes(m.mode)||!token(m.clientId)||!token(m.credential)) fail('INVALID_HANDSHAKE');
    if (m.buildId!==buildId) fail('BUILD_MISMATCH');
    if (m.workspaceId!==workspaceId) fail('WRONG_WORKSPACE');
    if (!core) {
      if (m.mode!=='CREATE') fail('WORKSPACE_EXPIRED');
      if (m.datasetVersion!==0||m.instanceId!==undefined||m.resumeToken!==undefined) fail('INVALID_HANDSHAKE');
      credential=m.credential;core=createWorkspace({workspaceId,barrierTimeoutMs});
    } else if (m.mode==='CREATE') fail('WORKSPACE_EXISTS');
    if (m.credential!==credential) fail('UNAUTHORIZED');
    if (m.datasetVersion!==core.identity().datasetVersion) fail('STALE_DATASET');
    if (m.instanceId!==undefined&&m.instanceId!==core.identity().instanceId) fail('STALE_INSTANCE');
    let session=sessions.get(m.clientId);
    if (session) {
      if (m.resumeToken!==session.resumeToken||m.sessionId!==session.sessionId||m.instanceId!==core.identity().instanceId) fail('UNAUTHORIZED');
      if (session.connection) detach(session.connection,false);
    } else {
      if (m.resumeToken!==undefined||sessions.size>=32) fail('CLIENT_CAPACITY');
      session={clientId:m.clientId,resumeToken:random(),sessionId:random(),joined:false,highestSequence:0,retiredSequence:0,window:new Map(),receiptBytes:0};sessions.set(m.clientId,session);
    }
    clearTimeout(p.timer);
    if (!session.joined) {publish(core.join(session.clientId).event);session.joined=true;}
    p.session=session;session.connection=p;snapshot(p);
  }
  function bound(p,m) {
    const identity=core.identity();
    if (m.clientId!==p.session.clientId||m.workspaceId!==workspaceId) fail('IDENTITY_MISMATCH');
    if (m.instanceId!==identity.instanceId) fail('STALE_INSTANCE');
    if (m.datasetVersion!==identity.datasetVersion) fail('STALE_DATASET');
    if(m.sessionId!==p.session.sessionId)fail('STALE_SESSION');
  }
  async function execute(p,command) {
    bound(p,command);
    const session=p.session,number=command.requestSequence,key=JSON.stringify([session.clientId,session.sessionId,command.requestId]);
    if(!id(command.requestId)||!Number.isSafeInteger(number)||number<1||command.requestId!==`c${number}`)fail('INVALID_COMMAND');
    if(number<=session.retiredSequence)fail('REQUEST_RETIRED');
    const normalized={...command};let imported=0;
    if(command.type==='prepareImport') {
      if(!Array.isArray(command.files)||command.files.length>80)fail('IMPORT_LIMIT');normalized.files=[];
      for(const f of command.files){
        if(!f||!(f.bytes instanceof Uint8Array||f.bytes instanceof ArrayBuffer)||f.bytes.byteLength>12*1024*1024)fail('IMPORT_LIMIT');
        imported+=f.bytes.byteLength;if(imported>40*1024*1024)fail('IMPORT_LIMIT');
        normalized.files.push({...f,bytes:Array(32).fill(255)});
      }
    }
    const signatureOf=async()=>{
      if(command.type==='prepareImport')for(let i=0;i<command.files.length;i++)normalized.files[i].bytes=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',command.files[i].bytes)));
      return JSON.stringify(Object.fromEntries(Object.entries(normalized).sort(([a],[b])=>a.localeCompare(b))));
    };
    const previous=receipts.get(key);
    if(previous){
      if(previous.retired)fail('REQUEST_RETIRED');
      if(previous.number!==number||await signatureOf()!==await previous.signaturePromise)fail('REQUEST_REUSE');
      return previous.promise;
    }
    if(number<=session.highestSequence)fail(session.window.has(number)?'REQUEST_REUSE':'REQUEST_RETIRED');
    if(!p.synced)fail('RESYNC_REQUIRED');
    const size=bytes(normalized);
    if(session.window.size>=maxCommands||session.receiptBytes+size>maxCommandBytes)fail('REQUEST_BACKPRESSURE');
    const isCandidate=['prepareImport','prepareClear'].includes(command.type),version=command.datasetVersion;
    const isExport=['finishExport','exportConfirmedSnapshot'].includes(command.type);
    if(isCandidate&&candidateSlots.size>=2)fail('CANDIDATE_CAPACITY');
    if(isExport&&downloads.size+exportSlots.size>=4)fail('EXPORT_CAPACITY');
    if(['confirmExport','releaseExport'].includes(command.type)){
      const d=downloads.get(command.snapshotId);if(!d||d.clientId!==session.clientId||d.datasetVersion!==version)fail('STALE_EXPORT');
    }
    if(isCandidate)candidateSlots.set(key,{clientId:session.clientId,pending:true,coreStarted:false,cancelled:false,imported});
    if(isExport)exportSlots.add(key);
    commandCount++;session.highestSequence=number;session.receiptBytes+=size;
    const entry={signaturePromise:signatureOf(),number,key,size,clientId:session.clientId,requestId:command.requestId,promise:null,done:false,retired:false};
    const promise=(async()=>{
      await entry.signaturePromise;bound(p,command);
      if(isCandidate){const slot=candidateSlots.get(key);if(!slot||slot.cancelled)fail('PREPARATION_CANCELLED');slot.coreStarted=true;}
      if(command.type==='cancelPreparation'){
        const slot=candidateSlots.get(JSON.stringify([session.clientId,session.sessionId,command.targetRequestId]));
        if(slot&&!slot.coreStarted){slot.cancelled=true;return {cancelled:true};}
      }
      return core.execute(command);
    })().then(result=>{
      publish(result.event);delete result.event;
      if(result.metadata)result.metadata=viewMetadata(result.metadata);
      if(isCandidate&&candidateSlots.has(key))Object.assign(candidateSlots.get(key),{candidateId:result.candidateId,pending:false});
      if(command.type==='cancelPreparation'){
        const target=JSON.stringify([session.clientId,session.sessionId,command.targetRequestId]),slot=candidateSlots.get(target);
        if(slot?.pending)slot.cancelled=true;else candidateSlots.delete(target);
      }
      if(['confirmExport','releaseExport'].includes(command.type))downloads.delete(command.snapshotId);
      if(result.snapshot){
        const {snapshot,...rest}=result;
        downloads.set(snapshot.snapshotId,{clientId:session.clientId,reader:createExportStream(snapshot),datasetVersion:version});
        return {...rest,download:{snapshotId:snapshot.snapshotId,complete:snapshot.completeness.complete}};
      }
      return result;
    },error=>{if(isCandidate)candidateSlots.delete(key);publish(error.event);throw error;}).finally(()=>{entry.done=true;exportSlots.delete(key);if(!session.joined)retire(session,number);});
    entry.promise=promise;receipts.set(key,entry);session.window.set(number,entry);
    return promise;
  }
  function retire(session,number) {
    const entry=session.window.get(number);
    if(!entry||!entry.done)return;
    core.retireRequest(session.clientId,entry.requestId,session.sessionId);entry.retired=true;entry.promise=null;entry.signaturePromise=null;
    for(const [n,item] of session.window){
      if(!item.retired)break;
      session.window.delete(n);receipts.delete(item.key);session.receiptBytes-=item.size;session.retiredSequence=n;
    }
    if(!session.joined&&!session.window.size&&sessions.get(session.clientId)===session)sessions.delete(session.clientId);
  }
  function query(p,q) {
    if (!q||bytes(q)>16384) fail('INVALID_QUERY');
    if (q.type==='metadata') return meta();
    if (q.type==='review') return core.readReview(q.key);
    if (q.type==='exportChunk') {
      const d=downloads.get(q.snapshotId),offset=q.offset??0,limit=q.limit??16384;
      if (!d||d.clientId!==p.session.clientId||d.datasetVersion!==core.identity().datasetVersion) fail('STALE_EXPORT');
      if (!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>16384) fail('INVALID_QUERY');
      return d.reader.read(offset,limit);
    }
    const dto=core.queryIndex(index=>queryView(index,q));
    if(q.type==='definitions')for(const item of dto.items)item.reviewStatus=core.readReview(item.key).status.value;
    return dto;
  }
  async function receive(p,m) {
    if (p.ended) return;
    try {
      if (!m||Object.getPrototypeOf(m)!==Object.prototype) fail('INVALID_MESSAGE');
      if (!p.session) {if (m.type!=='HELLO') fail('UNAUTHENTICATED');hello(p,m);return;}
      if (m.type==='ACK') {
        if (!Number.isSafeInteger(m.deliveryId)||m.deliveryId>p.deliveryId||m.deliveryId<0) fail('INVALID_ACK');
        for(const [n,size] of p.pending) if(n<=m.deliveryId){p.pending.delete(n);p.pendingBytes-=size;}
        if (!p.synced&&!p.resync&&m.deliveryId>=p.snapshotDelivery) {p.synced=true;raw(p,{type:'READY'});}
        if(m.requestSequence!==undefined){if(!Number.isSafeInteger(m.requestSequence))fail('INVALID_ACK');retire(p.session,m.requestSequence);}
        return;
      }
      if(m.type==='RETIRE'){if(!Number.isSafeInteger(m.requestSequence)||m.requestSequence<1)fail('INVALID_ACK');retire(p.session,m.requestSequence);return;}
      if (m.type==='LEAVE') {detach(p,true);return;}
      if (m.type==='RESYNC') {if(p.synced||p.resync)snapshot(p);return;}
      if (!['COMMAND','QUERY'].includes(m.type)||!id(m.requestId)) fail('INVALID_MESSAGE');
      bound(p,m);
      if (!p.synced) fail('RESYNC_REQUIRED');
      if (p.inflight>=8) fail('REQUEST_BACKPRESSURE');
      p.inflight++;
      try {
        if (m.type==='COMMAND'&&m.command?.requestId!==m.requestId) fail('IDENTITY_MISMATCH');
        const value=m.type==='COMMAND'?await execute(p,m.command):query(p,m.query);
        deliver(p,{type:'RESULT',requestId:m.requestId,datasetVersion:m.datasetVersion,...(m.type==='COMMAND'?{requestSequence:m.command.requestSequence}:{}),value});
      } finally {p.inflight--;schedule();}
    } catch(error) {
      if (!p.session) {raw(p,{type:'ERROR',error:errorDTO(error)});detach(p);}
      else deliver(p,{type:'ERROR',requestId:m?.requestId,...(m?.type==='COMMAND'&&p.session.window.has(m.command?.requestSequence)?{requestSequence:m.command.requestSequence}:{}),error:errorDTO(error)});
    }
  }
  function attachPort(port) {
    if (closed||ports.size>=48) {port.postMessage({type:'ERROR',error:{code:'PORT_CAPACITY'}});port.close();return;}
    const p={port,ended:false,synced:false,resync:false,pending:new Map(),pendingBytes:0,deliveryId:0,inflight:0,snapshotSequence:Infinity};
    ports.add(p);
    p.timer=setTimeout(()=>{raw(p,{type:'ERROR',error:{code:'HANDSHAKE_TIMEOUT'}});detach(p);},handshakeTimeoutMs);
    port.addEventListener('message',event=>{void receive(p,event.data);});
    port.addEventListener('messageerror',()=>resync(p));
    port.addEventListener('close',()=>detach(p));
    port.start();
  }
  return {attachPort,close(){closed=true;clearTimeout(deadlineTimer);for(const p of [...ports])detach(p);},
    diagnostics:()=>({ports:ports.size,clients:sessions.size,commands:commandCount,downloads:downloads.size,candidates:candidateSlots.size,
      receipts:receipts.size,core:core?.resourceCounts(),queuedEvents:events.size,unacknowledged:[...ports].map(p=>({frames:p.pending.size,bytes:p.pendingBytes,resync:p.resync}))})};
}
