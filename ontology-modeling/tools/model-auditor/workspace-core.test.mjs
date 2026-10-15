import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspace,createRecoveryCopy} from './workspace-core.js';

// The authenticated adapter registers clients; each command carries a fresh request ID.
// openDraft leases identify pre-barrier input, not authoritative review values.
const bytes=text=>new TextEncoder().encode(text);
const input=(path='模型.yaml',text='aggregates: [{id: O}]\nbehaviors: [{id: B, ownerEntity: O}]\n')=>({path,bytes:bytes(text)});
const code=value=>error=>error.code===value;
function harness(options={}) {
  const ws=createWorkspace(options);let id=0;
  ws.join('a');ws.join('b');
  const request=(type,payload={},clientId='a')=>({type,...ws.identity(),requestId:`r${++id}`,clientId,...payload});
  const send=(type,payload={},clientId='a')=>ws.execute(request(type,payload,clientId));
  return {ws,request,send};
}
async function ready(h,kind,candidateId) {
  const {barrier}=await h.send('beginBarrier',{kind,...(candidateId?{candidateId}:{})});
  for (const client of barrier.participants) await h.send('ackBarrier',{token:barrier.token,paused:true},client);
  return barrier.token;
}
async function loaded(options) {
  const h=harness(options),{candidateId}=await h.send('prepareImport',{files:[input()]});
  const token=await ready(h,'replace',candidateId);
  await h.send('commitCandidate',{token,confirmed:true,...confirmation(h)});
  return h;
}
const key=h=>h.ws.queryIndex(index=>index.records[0].key);
const confirmation=h=>{
  const {reviewRevision,exportedReviewRevision}=h.ws.metadata();return {reviewRevision,exportedReviewRevision};
};

test('workspace-core: candidate import commits atomically with fingerprints and intact references',async()=>{
  const h=await loaded(),m=h.ws.metadata();
  assert.equal(m.datasetVersion,1);assert.equal(m.stats.definitions,2);assert.equal(m.dirty,false);
  h.ws.queryIndex(index=>{
    assert.equal(index.records[1].refs[0].targets[0],index.records[0]);
    assert.equal(index.byKey.get(index.records[0].key),index.records[0]);
    assert.match(index.files[0].hash,/^[a-f0-9]{64}$/);
  });
  assert.equal('records' in m,false);assert.equal('text' in m.files[0],false);
});

test('workspace-core: same-field CAS conflicts preserve proposals, different fields commit independently',async()=>{
  const h=await loaded(),definitionKey=key(h);
  const [one,two]=await Promise.all([
    h.send('setReview',{key:definitionKey,field:'note',baseRevision:0,value:'甲'}),
    h.send('setReview',{key:definitionKey,field:'note',baseRevision:0,value:'乙'},'b')
  ]);
  assert.equal(one.status,'committed');assert.equal(two.status,'conflict');
  assert.deepEqual(two.current,{value:'甲',revision:1});assert.equal(two.proposed,'乙');
  await h.send('setReview',{key:definitionKey,field:'status',baseRevision:0,value:'approved'},'b');
  assert.deepEqual(h.ws.readReview(definitionKey),{status:{value:'approved',revision:1},note:{value:'甲',revision:1}});
  const copy=h.ws.readReview(definitionKey);copy.note.value='tampered';
  assert.equal(h.ws.readReview(definitionKey).note.value,'甲');
  assert.equal(h.ws.metadata().reviewRevision,2);assert.equal(h.ws.metadata().dirty,true);
});

test('workspace-core: request retries are idempotent and distinct from sequence and field revisions',async()=>{
  const h=await loaded(),r=h.request('setReview',{key:key(h),field:'note',baseRevision:0,value:'一次'});
  const [a,b]=await Promise.all([h.ws.execute(r),h.ws.execute({...r})]);
  assert.deepEqual(a,b);assert.equal(h.ws.metadata().reviewRevision,1);
  assert.ok(a.event.sequence>1);assert.equal(h.ws.readReview(key(h)).note.revision,1);
  await assert.rejects(h.ws.execute({...r,value:'复用 ID 不同内容'}),code('REQUEST_REUSE'));
  const sequence=h.ws.metadata().sequence;h.ws.join('c');
  assert.ok(h.ws.metadata().sequence>sequence);assert.equal(h.ws.metadata().reviewRevision,1);
});

test('workspace-core: stale identity, unknown client, invalid fields and oversized notes fail closed',async()=>{
  const h=await loaded(),r=h.request('setReview',{key:key(h),field:'note',baseRevision:0,value:'x'});
  for (const [patch,error] of [[{instanceId:'old'},'STALE_INSTANCE'],[{datasetVersion:0},'STALE_DATASET'],
    [{workspaceId:'wrong'},'WRONG_WORKSPACE'],[{clientId:'unknown'},'UNKNOWN_CLIENT'],
    [{field:'__proto__'},'INVALID_COMMAND'],[{value:'x'.repeat(65537)},'INVALID_COMMAND'],
    [{baseRevision:-1},'INVALID_COMMAND'],[{key:'n0'},'MISSING_DEFINITION']]) {
    await assert.rejects(h.ws.execute({...r,...patch,requestId:h.request('setReview').requestId}),code(error));
  }
  assert.equal(h.ws.metadata().reviewRevision,0);
});

test('workspace-core: failed candidates roll back current data and review; concurrent candidates cannot both commit',async()=>{
  const h=await loaded(),k=key(h);
  await h.send('setReview',{key:k,field:'note',baseRevision:0,value:'保留'});
  const before=h.ws.metadata(),original=h.ws.queryIndex(index=>index);
  for (const files of [[input('bad.yaml','aggregates: [')],[input('../bad.yaml')],
    [{path:'bad.yaml',bytes:new Uint8Array([0xff])}],
    [input('same.yaml'),input('same.yaml')],
    [input('huge.yaml','x'.repeat(12*1024*1024+1))]]) {
    await assert.rejects(h.send('prepareImport',{files}));
    assert.deepEqual(h.ws.metadata(),before);assert.equal(h.ws.queryIndex(index=>index),original);
    assert.equal(h.ws.readReview(k).note.value,'保留');
  }
  const [a,b]=await Promise.all([
    h.send('prepareImport',{files:[input('a.yaml','aggregates: [{id: A}]\n')]}),
    h.send('prepareImport',{files:[input('b.yaml','aggregates: [{id: B}]\n')]})
  ]);
  const token=await ready(h,'replace',a.candidateId);
  await h.send('commitCandidate',{token,confirmed:true,...confirmation(h)});
  await assert.rejects(h.send('beginBarrier',{kind:'replace',candidateId:b.candidateId}),code('STALE_CANDIDATE'));
  assert.equal(h.ws.metadata().datasetVersion,2);assert.equal(h.ws.metadata().reviewRevision,0);
});

test('workspace-core: frozen participants flush registered drafts without a blocking command lock',async()=>{
  const h=await loaded(),k=key(h);
  const {draftId}=await h.send('openDraft',{key:k,field:'note'},'b');
  const {barrier}=await h.send('beginBarrier',{kind:'export'});
  await assert.rejects(h.send('openDraft',{key:k,field:'status'}),code('BARRIER_ACTIVE'));
  await assert.rejects(h.send('setReview',{key:k,field:'status',value:'approved',baseRevision:0}),code('BARRIER_ACTIVE'));
  await assert.rejects(h.send('ackBarrier',{token:barrier.token,paused:false}),code('NOT_PAUSED'));
  await assert.rejects(h.send('ackBarrier',{token:barrier.token,paused:true},'b'),code('PENDING_DRAFTS'));
  const fresh=h.ws.join('c');assert.equal(fresh.editable,false);
  await assert.rejects(h.send('setReview',{key:k,field:'note',value:'new',baseRevision:0},'c'),code('READ_ONLY'));
  await assert.rejects(h.send('ackBarrier',{token:barrier.token,paused:true},'c'),code('NOT_PARTICIPANT'));
  await h.send('setReview',{key:k,field:'note',value:'屏障前草稿',baseRevision:0,draftId,token:barrier.token},'b');
  await h.send('ackBarrier',{token:barrier.token,paused:true},'b');
  await assert.rejects(h.send('setReview',{key:k,field:'note',value:'after ack',baseRevision:1,draftId,token:barrier.token},'b'),code('PARTICIPANT_READY'));
  const ack=await h.send('ackBarrier',{token:barrier.token,paused:true});
  assert.equal(ack.barrier.ready,true);assert.equal(ack.metadata.reviewRevision,1);
  const {snapshot}=await h.send('finishExport',{token:barrier.token});
  assert.equal(snapshot.completeness.complete,true);assert.deepEqual(snapshot.completeness.participants,['a','b']);
  await h.send('setReview',{key:k,field:'status',value:'approved',baseRevision:0},'c');
});

test('workspace-core: a conflicting flush cannot acknowledge or commit until explicitly discarded',async()=>{
  const h=await loaded(),k=key(h),{draftId}=await h.send('openDraft',{key:k,field:'note'},'b');
  await h.send('setReview',{key:k,field:'note',value:'远端',baseRevision:0});
  const {barrier}=await h.send('beginBarrier',{kind:'export'});
  const conflict=await h.send('setReview',{key:k,field:'note',value:'冲突草稿',baseRevision:0,draftId,token:barrier.token},'b');
  assert.equal(conflict.status,'conflict');assert.equal(conflict.proposed,'冲突草稿');
  await assert.rejects(h.send('ackBarrier',{token:barrier.token,paused:true},'b'),code('PENDING_DRAFTS'));
  await assert.rejects(h.send('finishExport',{token:barrier.token}),code('BARRIER_NOT_READY'));
  await h.send('discardDraft',{draftId,token:barrier.token},'b');
  await h.send('ackBarrier',{token:barrier.token,paused:true},'b');
  await h.send('ackBarrier',{token:barrier.token,paused:true});
  assert.equal((await h.send('finishExport',{token:barrier.token})).snapshot.reviews[0].note,'远端');
});

for (const reason of ['cancel','participant leaves','initiator lost','timeout']) {
  test(`workspace-core: ${reason} only aborts a barrier; late ACKs cannot enter its successor`,async()=>{
    let time=0;const h=await loaded({now:()=>time,barrierTimeoutMs:100}),k=key(h);
    await h.send('setReview',{key:k,field:'note',baseRevision:0,value:'不丢失'});
    const {candidateId}=await h.send('prepareClear');
    const {barrier}=await h.send('beginBarrier',{kind:'replace',candidateId});
    await h.send('ackBarrier',{token:barrier.token,paused:true});
    if (reason==='cancel') await h.send('cancelBarrier',{token:barrier.token});
    if (reason==='participant leaves') h.ws.leave('b');
    if (reason==='initiator lost') h.ws.leave('a');
    if (reason==='timeout') {time=101;assert.equal(h.ws.expireBarrier().event.type,'barrierAborted');}
    assert.equal(h.ws.metadata().barrier,null);assert.equal(h.ws.metadata().datasetVersion,1);
    assert.equal(h.ws.readReview(k).note.value,'不丢失');
    if (reason.includes('lost')) h.ws.join('a');
    if (reason.includes('leaves')) h.ws.join('b');
    const newer=await h.send('beginBarrier',{kind:'export'});
    assert.notEqual(newer.barrier.token,barrier.token);
    await assert.rejects(h.send('ackBarrier',{token:barrier.token,paused:true},'b'),code('STALE_BARRIER'));
    await assert.rejects(h.send('finishExport',{token:newer.barrier.token}),code('BARRIER_NOT_READY'));
  });
}

test('workspace-core: candidate replacement requires all participants and initiator confirmation',async()=>{
  const h=await loaded(),{candidateId}=await h.send('prepareClear');
  const {barrier}=await h.send('beginBarrier',{kind:'replace',candidateId});
  await assert.rejects(h.send('commitCandidate',{token:barrier.token,confirmed:true,...confirmation(h)}),code('BARRIER_NOT_READY'));
  await h.send('ackBarrier',{token:barrier.token,paused:true});
  await h.send('ackBarrier',{token:barrier.token,paused:true},'b');
  await assert.rejects(h.send('commitCandidate',{token:barrier.token,confirmed:true,...confirmation(h)},'b'),code('NOT_INITIATOR'));
  await assert.rejects(h.send('commitCandidate',{token:barrier.token,confirmed:false}),code('CONFIRMATION_REQUIRED'));
  await assert.rejects(h.send('commitCandidate',{token:barrier.token,confirmed:true}),code('CONFIRMATION_REQUIRED'));
  const old=h.request('setReview',{key:key(h),field:'note',value:'旧草稿',baseRevision:0});
  await h.send('commitCandidate',{token:barrier.token,confirmed:true,...confirmation(h)});
  await assert.rejects(h.ws.execute(old),code('STALE_DATASET'));
  assert.equal(h.ws.metadata().stats.definitions,0);
});

test('workspace-core: immutable v2 export retains provenance; only saved revision advances the export watermark',async()=>{
  const h=await loaded(),k=key(h);
  await h.send('setReview',{key:k,field:'note',baseRevision:0,value:'R1'});
  const token=await ready(h,'export'),{snapshot}=await h.send('finishExport',{token});
  assert.equal(h.ws.metadata().barrier,null);assert.equal(h.ws.metadata().dirty,true);
  assert.equal(snapshot.format,'omf-auditor-review-v2');assert.equal(snapshot.reviewRevision,1);
  assert.equal(snapshot.instanceId,h.ws.identity().instanceId);assert.equal(snapshot.datasetVersion,1);
  assert.ok(snapshot.snapshotSequence>snapshot.reviewRevision);
  const row=snapshot.reviews[0];assert.equal(row.key,k);assert.deepEqual(row.path,['aggregates',0]);
  assert.equal(row.fileSha256,snapshot.files[0].sha256);assert.equal(row.noteRevision,1);assert.equal(row.line,1);
  assert.ok(snapshot.warning);assert.equal(snapshot.files[0].path,'模型.yaml');
  await h.send('setReview',{key:k,field:'note',baseRevision:1,value:'R2'});
  assert.equal(snapshot.reviews[0].note,'R1');snapshot.reviews[0].note='local mutation';
  await assert.rejects(h.send('confirmExport',{snapshotId:snapshot.snapshotId,saved:false}),code('CONFIRMATION_REQUIRED'));
  await h.send('confirmExport',{snapshotId:snapshot.snapshotId,saved:true});
  assert.equal(h.ws.metadata().exportedReviewRevision,1);assert.equal(h.ws.metadata().dirty,true);
  const latest=(await h.send('finishExport',{token:await ready(h,'export')})).snapshot;
  await h.send('confirmExport',{snapshotId:latest.snapshotId,saved:true});
  assert.equal(h.ws.metadata().dirty,false);assert.equal(h.ws.readReview(k).note.value,'R2');
  await assert.rejects(h.send('confirmExport',{snapshotId:snapshot.snapshotId,saved:true}),code('STALE_EXPORT'));
  assert.equal(h.ws.metadata().exportedReviewRevision,2);
  const stale=h.request('confirmExport',{snapshotId:latest.snapshotId,saved:true});
  await h.send('commitCandidate',{token:await ready(h,'replace',(await h.send('prepareClear')).candidateId),confirmed:true,...confirmation(h)});
  await assert.rejects(h.ws.execute(stale),code('STALE_DATASET'));
  await assert.rejects(h.send('confirmExport',{snapshotId:latest.snapshotId,saved:true}),code('STALE_EXPORT'));
});

test('workspace-core: incomplete exports and disconnected recovery copies never clear authoritative dirty state',async()=>{
  const h=await loaded(),k=key(h);
  await h.send('setReview',{key:k,field:'note',baseRevision:0,value:'未导出'});
  await assert.rejects(h.send('exportConfirmedSnapshot',{allowIncomplete:false}),code('CONFIRMATION_REQUIRED'));
  const {snapshot}=await h.send('exportConfirmedSnapshot',{allowIncomplete:true});
  assert.equal(snapshot.completeness.complete,false);
  await assert.rejects(h.send('confirmExport',{snapshotId:snapshot.snapshotId,saved:true}),code('INCOMPLETE_EXPORT'));
  const recovery=createRecoveryCopy({metadata:h.ws.metadata(),views:[{key:k}],reviews:[h.ws.readReview(k)],drafts:[{key:k,value:'未同步'}]});
  assert.equal(recovery.completeness.complete,false);assert.equal(recovery.authoritative,false);
  assert.equal(recovery.files[0].sha256,h.ws.metadata().files[0].sha256);
  await assert.rejects(h.send('confirmExport',{snapshotId:recovery.snapshotId,saved:true}),code('STALE_EXPORT'));
  h.ws.leave('a');
  await assert.rejects(h.send('setReview',{key:k,field:'note',baseRevision:1,value:'失联写入'}),code('UNKNOWN_CLIENT'));
  assert.equal(h.ws.metadata().exportedReviewRevision,0);assert.equal(h.ws.metadata().dirty,true);
});

test('workspace-core: recovery helper cannot inherit authority, completeness or a confirmation handle',()=>{
  const recovery=createRecoveryCopy({metadata:{workspaceId:'old',instanceId:'old',datasetVersion:4,sequence:7,
    reviewRevision:3,files:[],authoritative:true,format:'omf-auditor-review-v2',snapshotId:'forged',completeness:{complete:true}}});
  assert.equal(recovery.authoritative,false);assert.equal(recovery.format,'omf-auditor-recovery-v1');
  assert.equal(recovery.completeness.complete,false);assert.equal(recovery.snapshotId,undefined);
  assert.equal(recovery.snapshotSequence,7);
});

test('workspace-core: different fields and definitions commit concurrently without lost values',async()=>{
  const h=await loaded(),keys=h.ws.queryIndex(index=>index.records.map(r=>r.key));
  const results=await Promise.all([
    h.send('setReview',{key:keys[0],field:'note',value:'O备注',baseRevision:0}),
    h.send('setReview',{key:keys[0],field:'status',value:'approved',baseRevision:0},'b'),
    h.send('setReview',{key:keys[1],field:'note',value:'B备注',baseRevision:0},'b')
  ]);
  assert.ok(results.every(r=>r.status==='committed'));
  assert.deepEqual(results.map(r=>r.event.reviewRevision),[1,2,3]);
  assert.equal(h.ws.readReview(keys[0]).note.value,'O备注');assert.equal(h.ws.readReview(keys[1]).note.value,'B备注');
});

test('workspace-core: byte input is copied, exact fingerprints retained, and merged keys survive reorder',async()=>{
  const h=await loaded(),old=h.ws.queryIndex(index=>index.records.map(r=>r.key));
  const source=input('a.yaml','aggregates: [{id: A}]\n'),expected=await crypto.subtle.digest('SHA-256',source.bytes);
  const request=h.request('prepareImport',{files:[source]}),pending=h.ws.execute(request);
  source.bytes.fill(0);
  const first=await pending;
  await h.send('commitCandidate',{token:await ready(h,'replace',first.candidateId),confirmed:true,...confirmation(h)});
  const m=h.ws.metadata(),sha=[...new Uint8Array(expected)].map(n=>n.toString(16).padStart(2,'0')).join('');
  assert.equal(m.files.find(f=>f.path==='a.yaml').sha256,sha);
  assert.deepEqual(h.ws.queryIndex(index=>index.records.slice(0,2).map(r=>r.key)),old);
  const reordered=await h.send('prepareImport',{files:[input()]});
  await h.send('commitCandidate',{token:await ready(h,'replace',reordered.candidateId),confirmed:true,...confirmation(h)});
  assert.deepEqual(h.ws.queryIndex(index=>index.records.slice(1).map(r=>r.key)),old);
  const replacement=await h.send('prepareImport',{files:[input('模型.yaml','aggregates: [{id: O, name: changed}]\n')],replaceAll:true});
  await h.send('commitCandidate',{token:await ready(h,'replace',replacement.candidateId),confirmed:true,...confirmation(h)});
  assert.equal(h.ws.metadata().files.length,1);assert.notEqual(key(h),old[0]);
  assert.throws(()=>h.ws.readReview(old[0]),code('MISSING_DEFINITION'));
});

test('workspace-core: stale in-flight imports and old-instance receipts cannot recreate an authority',async()=>{
  const h=await loaded(),old=h.request('setReview',{key:key(h),field:'note',value:'x',baseRevision:0});
  const token=await ready(h,'replace',(await h.send('prepareClear')).candidateId);
  // Preparation was dispatched before the replacement but its asynchronous digest finishes later.
  // It must not publish a candidate for the now obsolete base dataset.
  await h.send('cancelBarrier',{token});
  const candidate=(await h.send('prepareClear')).candidateId;
  const pending=h.send('prepareImport',{files:[input('late.yaml')]});
  const failure=assert.rejects(pending,code('STALE_DATASET'));
  await h.send('commitCandidate',{token:await ready(h,'replace',candidate),confirmed:true,...confirmation(h)});
  await failure;
  const other=harness({workspaceId:h.ws.identity().workspaceId});
  await assert.rejects(other.ws.execute(old),code('STALE_INSTANCE'));
  assert.equal(other.ws.metadata().stats.definitions,0);
});

test('workspace-core: cancelled candidates cannot be resurrected, and import retries share one candidate',async()=>{
  const h=await loaded(),r=h.request('prepareImport',{files:[input('next.yaml')]});
  const [a,b]=await Promise.all([h.ws.execute(r),h.ws.execute(r)]);
  assert.equal(a.candidateId,b.candidateId);
  const {barrier}=await h.send('beginBarrier',{kind:'replace',candidateId:a.candidateId});
  await h.send('cancelBarrier',{token:barrier.token},'b');
  await assert.rejects(h.send('beginBarrier',{kind:'replace',candidateId:a.candidateId}),code('STALE_CANDIDATE'));
  assert.equal(h.ws.metadata().datasetVersion,1);
});

test('workspace-core: complete export retry is isolated from caller mutation and emits its barrier token',async()=>{
  const h=await loaded(),token=await ready(h,'export'),r=h.request('finishExport',{token});
  const first=await h.ws.execute(r);first.snapshot.files[0].sha256='modified';
  const retry=await h.ws.execute(r);
  assert.match(retry.snapshot.files[0].sha256,/^[a-f0-9]{64}$/);assert.equal(retry.event.token,token);
  assert.equal(retry.event.sequence,first.event.sequence);
});

test('workspace-core: deadline is enforced on commands even before the adapter timer runs',async()=>{
  let time=0;const h=await loaded({now:()=>time,barrierTimeoutMs:10});
  const {barrier}=await h.send('beginBarrier',{kind:'export'});time=10;
  await assert.rejects(h.send('ackBarrier',{token:barrier.token,paused:true}),error=>
    error.code==='BARRIER_TIMEOUT'&&error.event.type==='barrierAborted');
  assert.equal(h.ws.metadata().barrier,null);assert.equal(h.ws.metadata().datasetVersion,1);
});

test('workspace-core: coercible command types and non-DTO import entries are rejected',async()=>{
  const h=await loaded(),payload={key:key(h),field:'note',baseRevision:0,value:'x'};
  await assert.rejects(h.ws.execute({...h.request('setReview',payload),type:['setReview']}),code('INVALID_COMMAND'));
  const file=Object.assign(new Date(),input());
  await assert.rejects(h.send('prepareImport',{files:[file]}),code('INVALID_COMMAND'));
  assert.equal(h.ws.metadata().reviewRevision,0);
});

test('workspace-core: new barrier clients cannot even confirm older downloads while read-only',async()=>{
  const h=await loaded(),k=key(h);
  h.ws.join('c');const oldPreparation=h.request('prepareClear',{},'c');
  await h.ws.execute(oldPreparation);h.ws.leave('c');
  await h.send('setReview',{key:k,field:'note',baseRevision:0,value:'dirty'});
  const snapshot=(await h.send('finishExport',{token:await ready(h,'export')})).snapshot;
  const {barrier}=await h.send('beginBarrier',{kind:'export'});h.ws.join('c');
  await assert.rejects(h.send('confirmExport',{snapshotId:snapshot.snapshotId,saved:true},'c'),code('READ_ONLY'));
  await assert.rejects(h.send('cancelPreparation',{targetRequestId:oldPreparation.requestId},'c'),code('READ_ONLY'));
  h.ws.leave('c');assert.equal(h.ws.metadata().barrier.token,barrier.token);
  assert.equal(h.ws.metadata().dirty,true);
});

test('workspace-core: cancelling during candidate preparation or after readiness never changes authority',async()=>{
  const h=await loaded(),before=h.ws.metadata();
  const request=h.request('prepareImport',{files:[input('cancelled.yaml')]}),pending=h.ws.execute(request);
  const rejected=assert.rejects(pending,code('PREPARATION_CANCELLED'));
  await h.send('cancelPreparation',{targetRequestId:request.requestId});await rejected;
  assert.equal(h.ws.metadata().datasetVersion,before.datasetVersion);
  assert.equal(h.ws.metadata().stats.definitions,before.stats.definitions);
  const readyRequest=h.request('prepareImport',{files:[input('ready.yaml')]}),prepared=await h.ws.execute(readyRequest);
  await h.send('cancelPreparation',{targetRequestId:readyRequest.requestId});
  await assert.rejects(h.send('beginBarrier',{kind:'replace',candidateId:prepared.candidateId}),code('STALE_CANDIDATE'));
});

test('workspace-core: final global confirmation must match the review/export summary after all draft flushes',async()=>{
  const h=await loaded(),k=key(h),{draftId}=await h.send('openDraft',{key:k,field:'note'},'b');
  const {candidateId}=await h.send('prepareClear'),old=h.ws.metadata();
  const {barrier}=await h.send('beginBarrier',{kind:'replace',candidateId});
  await h.send('ackBarrier',{token:barrier.token,paused:true});
  await h.send('setReview',{key:k,field:'note',value:'最后的草稿',baseRevision:0,draftId,token:barrier.token},'b');
  await h.send('ackBarrier',{token:barrier.token,paused:true},'b');
  await assert.rejects(h.send('commitCandidate',{token:barrier.token,confirmed:true,...confirmation(h),
    reviewRevision:old.reviewRevision,exportedReviewRevision:old.exportedReviewRevision}),code('STALE_CONFIRMATION'));
  assert.equal(h.ws.readReview(k).note.value,'最后的草稿');assert.equal(h.ws.metadata().datasetVersion,1);
});

test('workspace-core: duplicate business IDs have independent stable-key reviews',async()=>{
  const h=harness(),{candidateId}=await h.send('prepareImport',{files:[input('duplicates.yaml','aggregates: [{id: SAME}, {id: SAME}]\n')]});
  await h.send('commitCandidate',{token:await ready(h,'replace',candidateId),confirmed:true,...confirmation(h)});
  const keys=h.ws.queryIndex(index=>index.records.map(r=>r.key));assert.notEqual(keys[0],keys[1]);
  await Promise.all(keys.map((k,i)=>h.send('setReview',{key:k,field:'note',value:`定义${i}`,baseRevision:0},i?'b':'a')));
  assert.equal(h.ws.readReview(keys[0]).note.value,'定义0');assert.equal(h.ws.readReview(keys[1]).note.value,'定义1');
});
test('workspace-core: malformed import errors have stable domain codes, retain cause and do not mutate authority',async()=>{
  const h=await loaded(),before=h.ws.metadata(),k=key(h);
  for(const file of [input('bad.yaml','aggregates: ['),input('model.txt')]) {
    await assert.rejects(h.send('prepareImport',{files:[file]}),e=>e.code==='IMPORT_INVALID'&&e.cause instanceof Error&&e.message.includes(file.path));
    assert.deepEqual(h.ws.metadata(),before);assert.equal(h.ws.readReview(k).note.value,'');
  }
  await assert.rejects(h.send('prepareImport',{files:[{path:'encoding.yaml',bytes:new Uint8Array([255])}]}),
    e=>e.code==='IMPORT_INVALID'&&e.cause instanceof Error);
  assert.deepEqual(h.ws.metadata(),before);
});
