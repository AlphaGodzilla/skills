import {buildIndex} from './indexer.js';
import {importModels} from './importer.js';
import {assignDefinitionKeys,validateFilePath} from './navigation.js';
import {displayPath} from './parser.js';
import {LIMITS} from './schema.js';

const clone=value=>structuredClone(value);
const fail=(code,message,event)=>{throw Object.assign(new Error(message),{code,...(event?{event}:{})});};
const id=value=>typeof value==='string'&&value.length>0&&value.length<=128;
const natural=value=>Number.isSafeInteger(value)&&value>=0;
const emptyReview=()=>({status:{value:'pending',revision:0},note:{value:'',revision:0}});
const FIELDS={prepareImport:['files','replaceAll'],prepareClear:[],cancelPreparation:['targetRequestId'],beginBarrier:['kind','candidateId'],
  ackBarrier:['token','paused'],cancelBarrier:['token'],commitCandidate:['token','confirmed','reviewRevision','exportedReviewRevision'],
  openDraft:['key','field'],discardDraft:['draftId','token'],setReview:['key','field','value','baseRevision','draftId','token','keepDraft'],
  finishExport:['token'],exportConfirmedSnapshot:['allowIncomplete'],confirmExport:['snapshotId','saved'],releaseExport:['snapshotId']};
const HEADER=['type','requestId','clientId','workspaceId','instanceId','datasetVersion','requestSequence','sessionId'];

/** Cached fragments are explicitly non-authoritative; no API accepts them as workspace state. */
export function createRecoveryCopy({metadata,views=[],reviews=[],drafts=[]}) {
  return clone({format:'omf-auditor-recovery-v1',authoritative:false,
    workspaceId:metadata.workspaceId,instanceId:metadata.instanceId,datasetVersion:metadata.datasetVersion,
    snapshotSequence:metadata.sequence,reviewRevision:metadata.reviewRevision,
    files:metadata.files,views,reviews,drafts,completeness:{complete:false,reason:'disconnected-client-cache'},
    warning:'Only received views, review values and local drafts; not a workspace snapshot.'});
}

/**
 * DOM-free authority. join/leave/queryIndex are trusted adapter calls, not wire messages.
 * Authenticate/bind each MessagePort before join; do not trust a wire-supplied clientId.
 * queryIndex is a synchronous, read-only owner-side projection: never send its object graph.
 * execute returns a Promise; non-import commits run synchronously in arrival order. Import
 * preparation runs outside that order's critical section and never holds a barrier/queue lock.
 * Commands carry HEADER + the fields in FIELDS. Results/errors have stable code/event DTOs;
 * retries return the same event sequence (adapters must not broadcast that event twice).
 * The adapter must schedule expireBarrier at metadata().barrier.deadline (also checked on writes).
 *
 * Payloads (in addition to HEADER):
 * - prepareImport {files: Array<{path:string, bytes:Uint8Array|ArrayBuffer}>, replaceAll?:boolean}
 *   defaults to path-based merge; prepareClear {} creates an empty candidate. Neither changes
 *   authority. cancelPreparation {targetRequestId} cancels this client's pending/ready candidate.
 * - beginBarrier {kind:'replace'|'export', candidateId?:string} fixes participants and returns
 *   a random token. ackBarrier {token, paused:true} requires no remaining registered drafts.
 *   cancelBarrier {token} aborts, invalidating its candidate. Waiting is never a pending command.
 * - openDraft {key, field:'status'|'note'} returns {draftId,current:{value,revision}}. A client
 *   registers before accepting local input; no text is stored in the lease. One lease per field.
 *   setReview {key,field,value,baseRevision,draftId?,token?,keepDraft?} consumes its lease unless keepDraft:true retains it for continuous input.
 *   During a barrier only pre-existing leases with that token may flush, before the client's ACK.
 *   discardDraft {draftId,token?} explicitly abandons a lease. Conflict keeps it pending.
 * - commitCandidate {token,confirmed:true,reviewRevision,exportedReviewRevision} requires the
 *   initiator, every fixed participant, and a matching displayed revision pair. Latest review/export
 *   metadata is returned with ACKs for the initiator's final confirmation.
 * - finishExport {token} captures a complete v2 snapshot and immediately releases the barrier.
 *   exportConfirmedSnapshot {allowIncomplete:true} explicitly captures confirmed values only.
 *   confirmExport {snapshotId,saved:true} advances only that snapshot's review watermark;
 *   incomplete, unknown, old-instance and old-dataset confirmations are refused.
 *
 * status values: 'pending'|'approved'|'changes'; note limit: 65536 UTF-16 code units.
 * CAS conflict resolves to {status:'conflict',current,proposed}, without an event or mutation.
 * Other refusals reject with Error.code; timeout refusals also carry the abort event.
 * Successful authority changes return one event with a monotonic sequence; only setReview
 * increments reviewRevision. Dataset commits reset review watermarks and all field revisions.
 * Receipt IDs are per client/dataset; an admitted ID cannot name different content, even after
 * execution fails. Adapters must generate fresh IDs and forward ACKs only after input is paused.
 */
export function createWorkspace({workspaceId=crypto.randomUUID(),instanceId=crypto.randomUUID(),
  now=()=>Date.now(),barrierTimeoutMs=30000}={}) {
  if (!id(workspaceId)||!id(instanceId)||!Number.isFinite(barrierTimeoutMs)||barrierTimeoutMs<=0) fail('INVALID_OPTIONS','Invalid workspace identity or barrier timeout.');
  let index=buildIndex([]),datasetVersion=0,sequence=0,reviewRevision=0,exportedReviewRevision=0,reviewedCount=0,barrier=null;
  index.byKey=new Map();
  const clients=new Set(),reviews=new Map(),drafts=new Map(),candidates=new Map(),exports=new Map(),requests=new Map(),preparations=new Map();
  const identity=()=>({workspaceId,instanceId,datasetVersion});
  const files=()=>index.files.map(f=>({path:f.name,sha256:f.hash,bytes:f.bytes}));
  const barrierDTO=()=>barrier?{token:barrier.token,kind:barrier.kind,initiator:barrier.initiator,
    participants:[...barrier.participants.keys()],acknowledged:[...barrier.participants].filter(([,ready])=>ready).map(([c])=>c),
    ready:[...barrier.participants.values()].every(Boolean),deadline:barrier.deadline}:null;
  const metadata=()=>({...identity(),sequence,reviewRevision,exportedReviewRevision,
    dirty:reviewRevision>exportedReviewRevision,files:files(),
    stats:{definitions:index.records.length,issues:index.issues.length,reviewed:reviewedCount},barrier:barrierDTO()});
  const event=(type,detail={})=>({...identity(),sequence:++sequence,reviewRevision,type,...detail});
  const readReview=key=>{
    if (!index.byKey.has(key)) fail('MISSING_DEFINITION','Unknown stable definition key.');
    return clone(reviews.get(key)||emptyReview());
  };
  function releaseCandidate(candidateId) {
    const candidate=candidates.get(candidateId);
    if(candidate?.preparationKey)preparations.delete(candidate.preparationKey);
    candidates.delete(candidateId);
  }
  function abortBarrier(reason) {
    const token=barrier.token;
    if (barrier.candidateId) releaseCandidate(barrier.candidateId);
    barrier=null;
    return {event:event('barrierAborted',{token,reason})};
  }
  function expireBarrier() {
    return barrier&&now()>=barrier.deadline?abortBarrier('timeout'):null;
  }
  function join(clientId) {
    if (!id(clientId)) fail('INVALID_CLIENT','Invalid client identity.');
    if (clients.has(clientId)) fail('CLIENT_CONNECTED','Client already has a bound connection.');
    clients.add(clientId);
    return {event:event('clientJoined',{clientId}),metadata:metadata(),editable:!barrier};
  }
  function leave(clientId) {
    if (!clients.delete(clientId)) return null;
    for (const preparation of preparations.values()) if (preparation.clientId===clientId) preparation.cancelled=true;
    for(const [draftId,draft] of drafts)if(draft.clientId===clientId)drafts.delete(draftId);
    for (const [candidateId,candidate] of candidates) if (candidate.clientId===clientId) releaseCandidate(candidateId);
    const result=barrier?.participants.has(clientId)?abortBarrier('participant-left'):null;
    return result||{event:event('clientLeft',{clientId})};
  }
  function validateIdentity(request) {
    if (request.workspaceId!==workspaceId) fail('WRONG_WORKSPACE','Wrong workspace.');
    if (request.instanceId!==instanceId) fail('STALE_INSTANCE','Worker instance has expired.');
    if (request.datasetVersion!==datasetVersion) fail('STALE_DATASET','Dataset version has changed.');
    if (!clients.has(request.clientId)) fail('UNKNOWN_CLIENT','Client has no bound connection.');
  }
  function validateCommand(request) {
    if (!request||Object.getPrototypeOf(request)!==Object.prototype||typeof request.type!=='string'||!Object.hasOwn(FIELDS,request.type)||
        !id(request.requestId)||!id(request.clientId)||Object.keys(request).some(k=>!HEADER.includes(k)&&!FIELDS[request.type].includes(k))) {
      fail('INVALID_COMMAND','Unknown command or invalid envelope.');
    }
    validateIdentity(request);
    if (request.type==='prepareImport') {
      if (!Array.isArray(request.files)||!request.files.length||request.files.length>LIMITS.files||
          (Object.hasOwn(request,'replaceAll')&&typeof request.replaceAll!=='boolean')) fail('INVALID_COMMAND','Invalid import batch.');
      let total=0;
      for (const file of request.files) {
        if (!file||Object.getPrototypeOf(file)!==Object.prototype||Object.keys(file).some(k=>!['path','bytes'].includes(k))||
            !(file.bytes instanceof ArrayBuffer||file.bytes instanceof Uint8Array)) fail('INVALID_COMMAND','Expected {path, bytes} input.');
        validateFilePath(file.path);total+=file.bytes.byteLength;
        if (file.bytes.byteLength>LIMITS.fileBytes) fail('IMPORT_LIMIT','File exceeds 12 MiB.');
      }
      if (total>LIMITS.totalBytes) fail('IMPORT_LIMIT','Batch exceeds 40 MiB.');
    }
  }
  async function execute(raw) {
    validateCommand(raw);
    // Copy bytes and primitives at entry: caller mutation cannot change an in-flight candidate.
    const request=clone(raw),signatureParts={...request};
    const requestKey=JSON.stringify([request.clientId,request.sessionId,request.requestId]);
    if (['prepareImport','prepareClear'].includes(request.type)&&!preparations.has(requestKey)) preparations.set(requestKey,{cancelled:false,clientId:request.clientId});
    if (request.type==='prepareImport') {
      signatureParts.files=[];
      for (const file of request.files) {
        const digest=await crypto.subtle.digest('SHA-256',file.bytes);
        signatureParts.files.push({path:file.path,sha256:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')});
      }
    }
    const signature=JSON.stringify(Object.fromEntries(Object.entries(signatureParts).sort(([a],[b])=>a.localeCompare(b))));
    validateIdentity(request);
    const previous=requests.get(requestKey);
    if (previous) {
      if (previous.signature!==signature) fail('REQUEST_REUSE','Request ID was used for different content.');
      return clone(await previous.promise);
    }
    const promise=Promise.resolve().then(()=>{
      validateIdentity(request);
      const expired=expireBarrier();
      if (expired) fail('BARRIER_TIMEOUT','Barrier timed out; operation aborted.',expired.event);
      return run(request);
    });
    const entry={signature,promise,settled:false};requests.set(requestKey,entry);
    try {return clone(await promise);}finally{entry.settled=true;if(['prepareImport','prepareClear'].includes(request.type)&&!preparations.get(requestKey)?.candidateId)preparations.delete(requestKey);}
  }
  function editable(request) {
    if (barrier) fail(barrier.participants.has(request.clientId)?'BARRIER_ACTIVE':'READ_ONLY','Workspace edits are paused.');
  }
  function activeBarrier(request,{initiator=false,ready=false,kind}={}) {
    if (!barrier||request.token!==barrier.token) fail('STALE_BARRIER','Barrier token is no longer current.');
    if (!barrier.participants.has(request.clientId)) fail('NOT_PARTICIPANT','Client is not a fixed participant.');
    if (initiator&&barrier.initiator!==request.clientId) fail('NOT_INITIATOR','Only the initiating client may finish.');
    if (kind&&barrier.kind!==kind) fail('WRONG_BARRIER','Barrier has a different purpose.');
    if (ready&&!barrierDTO().ready) fail('BARRIER_NOT_READY','Not all participants have paused and drained drafts.');
    return barrier;
  }
  function reviewField(request) {
    if (!['status','note'].includes(request.field)) fail('INVALID_COMMAND','Unknown review field.');
    if (!index.byKey.has(request.key)) fail('MISSING_DEFINITION','Unknown stable definition key.');
  }
  function writableDraft(request) {
    if (barrier) {
      activeBarrier(request);
      if (barrier.participants.get(request.clientId)) fail('PARTICIPANT_READY','Client already acknowledged this barrier.');
    } else if (request.token!==undefined) fail('STALE_BARRIER','Draft flush targets an expired barrier.');
    const draft=drafts.get(request.draftId);
    if (!draft||draft.clientId!==request.clientId||draft.datasetVersion!==datasetVersion) fail('INVALID_DRAFT','Unknown draft lease.');
    return draft;
  }
  function preparationFor(request) {
    const preparation=preparations.get(JSON.stringify([request.clientId,request.sessionId,request.requestId]));
    if (!preparation||preparation.cancelled) fail('PREPARATION_CANCELLED','Candidate preparation was cancelled.');
    return preparation;
  }
  function cancelPreparation(request) {
    if (barrier&&!barrier.participants.has(request.clientId)) fail('READ_ONLY','New clients wait read-only until the barrier ends.');
    const preparation=preparations.get(JSON.stringify([request.clientId,request.sessionId,request.targetRequestId]));
    if (!id(request.targetRequestId)||!preparation) fail('STALE_PREPARATION','No preparation for this client and request.');
    preparation.cancelled=true;
    if (barrier?.candidateId===preparation.candidateId&&preparation.candidateId) return abortBarrier('cancelled');
    releaseCandidate(preparation.candidateId);preparations.delete(JSON.stringify([request.clientId,request.sessionId,request.targetRequestId]));
    return {event:event('preparationCancelled',{clientId:request.clientId,targetRequestId:request.targetRequestId})};
  }
  async function prepareImport(request) {
    const preparation=preparationFor(request);editable(request);
    const selected=request.files.map(({path,bytes})=>{
      const buffer=bytes instanceof ArrayBuffer?bytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
      return {name:path,webkitRelativePath:path,size:buffer.byteLength,arrayBuffer:async()=>buffer};
    });
    let candidateIndex;
    try {candidateIndex=await assignDefinitionKeys(await importModels(selected,request.replaceAll?[]:index.files));}
    catch (cause) {
      throw Object.assign(new Error(cause.message,{cause}),{code:'IMPORT_INVALID'});
    }
    validateIdentity(request);
    preparationFor(request);
    const candidateId=crypto.randomUUID();preparation.candidateId=candidateId;
    candidates.set(candidateId,{index:candidateIndex,preparationKey:JSON.stringify([request.clientId,request.sessionId,request.requestId]),baseVersion:request.datasetVersion,clientId:request.clientId});
    return {candidateId,baseDatasetVersion:request.datasetVersion,stats:{files:candidateIndex.files.length,definitions:candidateIndex.records.length}};
  }
  function candidateFor(request,candidateId) {
    const candidate=candidates.get(candidateId);
    if (!candidate||candidate.baseVersion!==datasetVersion) fail('STALE_CANDIDATE','Candidate no longer has a current base.');
    if (candidate.clientId!==request.clientId) fail('NOT_INITIATOR','Candidate belongs to another client.');
    return candidate;
  }
  function setReview(request) {
    reviewField(request);
    if (!natural(request.baseRevision)||typeof request.value!=='string'||request.value.length>65536||
        (request.field==='status'&&!['pending','approved','changes'].includes(request.value))) fail('INVALID_COMMAND','Invalid review value or field revision.');
    if(request.keepDraft!==undefined&&(typeof request.keepDraft!=='boolean'||(request.keepDraft&&!request.draftId)))fail('INVALID_COMMAND','Persistent editing requires a registered lease.');
    if (barrier&&!request.draftId) editable(request);
    if (request.draftId!==undefined) {
      const draft=writableDraft(request);
      if (draft.key!==request.key||draft.field!==request.field) fail('INVALID_DRAFT','Draft lease is for another field.');
    } else if (request.token!==undefined) fail('STALE_BARRIER','Unexpected barrier token.');
    const review=reviews.get(request.key)||emptyReview(),current=review[request.field];
    if (current.revision!==request.baseRevision) return {status:'conflict',current:clone(current),proposed:request.value};
    if(request.field==='status')reviewedCount+=(request.value!=='pending'?1:0)-(current.value!=='pending'?1:0);
    review[request.field]={value:request.value,revision:current.revision+1};
    reviews.set(request.key,review);reviewRevision++;
    if (request.draftId&&!request.keepDraft) drafts.delete(request.draftId);
    return {status:'committed',current:clone(review[request.field]),
      event:event('reviewChanged',{key:request.key,field:request.field,reviewedCount:reviewedCount,current:clone(review[request.field])})};
  }
  function beginBarrier(request) {
    editable(request);
    if (!['replace','export'].includes(request.kind)) fail('INVALID_COMMAND','Unknown barrier purpose.');
    if (request.kind==='replace') candidateFor(request,request.candidateId);
    else if (request.candidateId!==undefined) fail('INVALID_COMMAND','Export cannot carry a candidate.');
    barrier={token:crypto.randomUUID(),kind:request.kind,candidateId:request.candidateId,initiator:request.clientId,
      participants:new Map([...clients].map(c=>[c,false])),deadline:now()+barrierTimeoutMs};
    return {event:event('barrierStarted',{barrier:barrierDTO()}),barrier:barrierDTO()};
  }
  function ackBarrier(request) {
    activeBarrier(request);
    if (request.paused!==true) fail('NOT_PAUSED','Participant must stop accepting new edits before ACK.');
    if ([...drafts.values()].some(d=>d.clientId===request.clientId&&d.datasetVersion===datasetVersion)) fail('PENDING_DRAFTS','Participant has unconfirmed or conflicting drafts.');
    barrier.participants.set(request.clientId,true);
    return {event:event('barrierAcknowledged',{token:barrier.token,clientId:request.clientId}),barrier:barrierDTO(),metadata:metadata()};
  }
  function commitCandidate(request) {
    activeBarrier(request,{initiator:true,ready:true,kind:'replace'});
    if (request.confirmed!==true) fail('CONFIRMATION_REQUIRED','Explicit confirmation of the latest shared review/export state is required.');
    if (!natural(request.reviewRevision)||!natural(request.exportedReviewRevision)) fail('CONFIRMATION_REQUIRED','Confirm the displayed review/export revision pair.');
    if (request.reviewRevision!==reviewRevision||request.exportedReviewRevision!==exportedReviewRevision) fail('STALE_CONFIRMATION','The displayed review/export summary is out of date.');
    const candidate=candidateFor(request,barrier.candidateId),token=barrier.token;
    index=candidate.index;datasetVersion++;reviews.clear();drafts.clear();reviewRevision=0;exportedReviewRevision=0;reviewedCount=0;barrier=null;
    candidates.clear();exports.clear();preparations.clear();requests.clear();
    return {event:event('datasetCommitted',{token}),metadata:metadata()};
  }
  function exportSnapshot(complete,participants=[],token=null) {
    const snapshotId=crypto.randomUUID(),emitted=event('exportGenerated',{snapshotId,complete,token});
    const snapshot={format:'omf-auditor-review-v2',snapshotId,exportedAt:new Date(now()).toISOString(),
      ...identity(),snapshotSequence:emitted.sequence,reviewRevision,files:files(),
      limitations:'人工结论与 MVP 基础检查，不替代完整 OMF 校验或业务审计。',
      warning:'Browser memory is not durable storage; confirm the downloaded file was saved.',
      completeness:{complete,participants,barrierToken:token,reason:complete?null:'confirmed-values-only'},
      reviews:index.records.map(r=>{
        const review=reviews.get(r.key)||emptyReview();
        return {key:r.key,path:[...r.path],model:r.model,section:r.section,id:r.id,file:r.file.name,
          fileSha256:r.file.hash,line:r.loc.line,status:review.status.value,note:review.note.value,
          statusRevision:review.status.revision,noteRevision:review.note.revision};
      }),
      issues:index.issues.map(x=>({code:x.code,message:x.message,file:x.file.name,line:x.line,
        id:x.record.id,key:x.record.key,path:[...x.path],fieldPath:displayPath(x.path)}))};
    exports.set(snapshotId,{...identity(),reviewRevision,complete});
    return {snapshot,event:emitted};
  }
  function confirmExport(request) {
    if (barrier&&!barrier.participants.has(request.clientId)) fail('READ_ONLY','New clients wait read-only until the barrier ends.');
    const snapshot=exports.get(request.snapshotId);
    if (!snapshot||snapshot.instanceId!==instanceId||snapshot.datasetVersion!==datasetVersion) fail('STALE_EXPORT','Export belongs to an expired dataset or instance.');
    if (!snapshot.complete) fail('INCOMPLETE_EXPORT','Incomplete snapshots cannot advance the export watermark.');
    if (request.saved!==true) fail('CONFIRMATION_REQUIRED','Download initiation is not confirmation of saving.');
    exports.delete(request.snapshotId);
    exportedReviewRevision=Math.max(exportedReviewRevision,snapshot.reviewRevision);
    return {event:event('exportConfirmed',{snapshotId:request.snapshotId,exportedReviewRevision}),metadata:metadata()};
  }
  function run(request) {
    switch (request.type) {
      case 'prepareImport': return prepareImport(request);
      case 'cancelPreparation': return cancelPreparation(request);
      case 'prepareClear': {
        const preparation=preparationFor(request);editable(request);
        const candidateId=crypto.randomUUID(),empty=buildIndex([]);empty.byKey=new Map();
        preparation.candidateId=candidateId;
        candidates.set(candidateId,{index:empty,preparationKey:JSON.stringify([request.clientId,request.sessionId,request.requestId]),baseVersion:datasetVersion,clientId:request.clientId});
        return {candidateId,baseDatasetVersion:datasetVersion,stats:{files:0,definitions:0}};
      }
      case 'beginBarrier': return beginBarrier(request);
      case 'ackBarrier': return ackBarrier(request);
      case 'cancelBarrier': activeBarrier(request);return abortBarrier('cancelled');
      case 'commitCandidate': return commitCandidate(request);
      case 'openDraft': {
        editable(request);reviewField(request);
        if ([...drafts.values()].some(d=>d.clientId===request.clientId&&d.key===request.key&&d.field===request.field)) fail('DRAFT_EXISTS','One draft lease per client field is allowed.');
        const draftId=crypto.randomUUID();
        drafts.set(draftId,{clientId:request.clientId,datasetVersion,key:request.key,field:request.field});
        return {draftId,current:readReview(request.key)[request.field],event:event('draftOpened',{clientId:request.clientId})};
      }
      case 'discardDraft': {
        writableDraft(request);drafts.delete(request.draftId);
        return {event:event('draftDiscarded',{clientId:request.clientId})};
      }
      case 'setReview': return setReview(request);
      case 'finishExport': {
        activeBarrier(request,{initiator:true,ready:true,kind:'export'});
        const result=exportSnapshot(true,[...barrier.participants.keys()],barrier.token);
        barrier=null;return result;
      }
      case 'exportConfirmedSnapshot': {
        editable(request);
        if (request.allowIncomplete!==true) fail('CONFIRMATION_REQUIRED','Explicitly choose a potentially incomplete confirmed-only snapshot.');
        return exportSnapshot(false);
      }
      case 'confirmExport': return confirmExport(request);
      case 'releaseExport': {
        const snapshot=exports.get(request.snapshotId);
        if(!snapshot||snapshot.datasetVersion!==datasetVersion)fail('STALE_EXPORT','Export has expired.');
        exports.delete(request.snapshotId);return {released:true};
      }
    }
  }
  return {identity,metadata,join,leave,execute,readReview,expireBarrier,queryIndex:reader=>reader(index),
    // Trusted transport only: retired wire sequences are rejected by the host before execute.
    retireRequest(clientId,requestId,sessionId){const key=JSON.stringify([clientId,sessionId,requestId]);if(requests.get(key)?.settled)requests.delete(key);},
    hasCandidate:candidateId=>candidates.has(candidateId),releaseExport:snapshotId=>exports.delete(snapshotId),
    resourceCounts:()=>({requests:requests.size,preparations:preparations.size,candidates:candidates.size,exports:exports.size,drafts:drafts.size})};
}
