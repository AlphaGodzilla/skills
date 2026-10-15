import test from 'node:test';
import assert from 'node:assert/strict';
import {MessageChannel} from 'node:worker_threads';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createWorkspaceHost} from './workspace-host.js';
import {createWorkspaceClient,newWorkspaceAddress} from './workspace-client.js';
import {createExportStream} from './export-stream.js';
async function fixture(t,options={}) {
  const address=newWorkspaceAddress('b'.repeat(64)),host=createWorkspaceHost({buildId:address.buildId,workspaceId:address.workspaceId,...options}),{port1,port2}=new MessageChannel();host.attachPort(port1);
  const a=createWorkspaceClient({address,mode:'CREATE'});await a.connect(port2);t.after(()=>{a.disconnect();host.close();});return {a,host};
}
const batch=text=>({files:[{path:'model.yaml',bytes:new TextEncoder().encode(text)}],replaceAll:true});
async function load(a,text='aggregates: [{id: A, lifecycle: [draft]}]') {
  const {candidateId}=await a.command('prepareImport',batch(text)),{barrier}=await a.command('beginBarrier',{kind:'replace',candidateId});
  await a.command('ackBarrier',{token:barrier.token,paused:true});await a.command('commitCandidate',{token:barrier.token,confirmed:true,reviewRevision:0,exportedReviewRevision:0});await a.whenReady();
  return (await a.query({type:'definitions'})).items[0].key;
}
async function exportComplete(a) {
  const {barrier}=await a.command('beginBarrier',{kind:'export'});await a.command('ackBarrier',{token:barrier.token,paused:true});
  const {download}=await a.command('finishExport',{token:barrier.token});let offset=0,text='';
  do{const part=await a.query({type:'exportChunk',snapshotId:download.snapshotId,offset});assert.ok(part.text.length<=16384);text+=part.text;offset=part.next;}while(offset!==null);
  return {download,text,snapshot:JSON.parse(text)};
}

test('capacity R3: repeated failed and cancelled candidates release active resources; a valid third import succeeds',async t=>{
  const {a,host}=await fixture(t);
  for(let i=0;i<5;i++)await assert.rejects(a.command('prepareImport',batch('aggregates: [')),e=>e.code==='IMPORT_INVALID');
  for(let i=0;i<5;i++){const cmd=a.request('prepareClear');await a.send(cmd);await a.command('cancelPreparation',{targetRequestId:cmd.requestId});}
  await load(a);assert.equal(a.state().metadata.stats.definitions,1);assert.ok(host.diagnostics().core.preparations<=2);
});
test('capacity R1: twelve actual saved/confirmed downloads remain possible; released handles expire',async t=>{
  const {a,host}=await fixture(t),key=await load(a),directory=await mkdtemp('/tmp/omf-capacity-saved-');
  for(let i=0;i<12;i++) {
    await a.command('setReview',{key,field:'note',value:'revision '+i,baseRevision:i});const {download,text,snapshot}=await exportComplete(a);
    const file=directory+`/review-${i}.json`;await writeFile(file,text);assert.equal(JSON.parse(await readFile(file,'utf8')).reviews[0].note,'revision '+i);
    assert.equal(snapshot.reviewRevision,i+1);await a.command('confirmExport',{snapshotId:download.snapshotId,saved:true});assert.equal(a.state().metadata.dirty,false);
  }
  assert.equal(host.diagnostics().downloads,0);assert.equal(host.diagnostics().core.exports,0);
});
for(const count of [1000,2001,5001])test(`capacity R2: ${count} accepted definitions export completely with exact provenance and immutable review values`,async t=>{
  const {a}=await fixture(t),text='aggregates:\n'+Array.from({length:count},(_,i)=>`  - {id: A${i}, lifecycle: [draft]}`).join('\n'),key=await load(a,text);
  const {download,snapshot}=await exportComplete(a);
  assert.equal(snapshot.reviews.length,count);assert.equal(snapshot.issues.length,0);assert.equal(snapshot.files[0].sha256,createHash('sha256').update(text).digest('hex'));
  for(let i=0;i<count;i++){assert.equal(snapshot.reviews[i].id,'A'+i);assert.equal(snapshot.reviews[i].fileSha256,snapshot.files[0].sha256);assert.deepEqual(snapshot.reviews[i].path,['aggregates',i]);}
  await a.command('setReview',{key,field:'note',value:'newer',baseRevision:0});await a.command('confirmExport',{snapshotId:download.snapshotId,saved:true});assert.equal(a.state().metadata.dirty,true);
});
test('capacity R4: thousands of acknowledged lease commands keep receipts bounded; retired requests never reexecute',async t=>{
  const {a,host}=await fixture(t),key=await load(a);let old;
  for(let i=0;i<1600;i++){
    const {draftId}=await a.command('openDraft',{key,field:'note'}),command=a.request('setReview',{key,field:'note',value:'edit '+i,baseRevision:i,draftId});
    await a.send(command);old||=command;
  }
  assert.ok(host.diagnostics().receipts<=8);assert.ok(host.diagnostics().core.requests<=8);
  await assert.rejects(a.send(old),e=>e.code==='REQUEST_RETIRED');assert.equal((await a.query({type:'review',key})).note.revision,1600);
  const {download,snapshot}=await exportComplete(a);assert.equal(snapshot.reviews[0].note,'edit 1599');await a.command('confirmExport',{snapshotId:download.snapshotId,saved:true});
});

test('capacity: async import admission preserves sequence order, active candidates/downloads are reclaimed explicitly',async t=>{
  const {a,host}=await fixture(t);
  const importCommand=a.request('prepareImport',batch('aggregates: [{id: A, lifecycle: [draft]}]\n#'+ 'x'.repeat(200000)));
  const importing=a.send(importCommand),clearCommand=a.request('prepareClear'),clearing=a.send(clearCommand);
  await Promise.all([importing,clearing]);
  await assert.rejects(a.command('prepareClear'),e=>e.code==='CANDIDATE_CAPACITY');
  await a.command('cancelPreparation',{targetRequestId:importCommand.requestId});await a.command('cancelPreparation',{targetRequestId:clearCommand.requestId});
  await load(a);const handles=[];
  for(let i=0;i<4;i++)handles.push((await a.command('exportConfirmedSnapshot',{allowIncomplete:true})).download);
  await assert.rejects(a.command('exportConfirmedSnapshot',{allowIncomplete:true}),e=>e.code==='EXPORT_CAPACITY');
  await a.command('releaseExport',{snapshotId:handles[0].snapshotId});
  await assert.rejects(a.query({type:'exportChunk',snapshotId:handles[0].snapshotId}),e=>e.code==='STALE_EXPORT');
  await a.command('exportConfirmedSnapshot',{allowIncomplete:true});assert.equal(host.diagnostics().downloads,4);
});

test('capacity: retired request identity cannot be relabeled with a new sequence to execute twice',async t=>{
  const {a}=await fixture(t),key=await load(a),old=a.request('setReview',{key,field:'note',value:'once',baseRevision:0});await a.send(old);
  await assert.rejects(a.send({...old,requestSequence:old.requestSequence+1,baseRevision:1}),e=>e.code==='INVALID_COMMAND');
  assert.equal((await a.query({type:'review',key})).note.revision,1);
});

test('capacity: explicit LEAVE recycles client slots beyond 32 tabs without allowing an old session command to execute',async t=>{
  const channelAddress=newWorkspaceAddress('b'.repeat(64)),owner=createWorkspaceHost({buildId:channelAddress.buildId,workspaceId:channelAddress.workspaceId});
  const connect=async(mode='JOIN',clientId)=>{const {port1,port2}=new MessageChannel();owner.attachPort(port1);const c=createWorkspaceClient({address:channelAddress,mode,...(clientId?{clientId}:{})});await c.connect(port2);return c;};
  const anchor=await connect('CREATE');t.after(()=>{anchor.disconnect();owner.close();});let old,oldId;
  for(let i=0;i<40;i++){
    const b=await connect();if(i===0){oldId=b.clientId;old=b.request('prepareClear');await b.send(old);await b.command('cancelPreparation',{targetRequestId:old.requestId});}
    const leavingId=b.clientId,left=new Promise(resolve=>{const off=anchor.onEvent(e=>{if(e.type==='clientLeft'&&e.clientId===leavingId){off();resolve();}});});b.pagehide();await left;
  }
  assert.equal(owner.diagnostics().clients,1);
  const reused=await connect('JOIN',oldId);await assert.rejects(reused.send(old),e=>e.code==='STALE_SESSION');reused.pagehide();
});

test('capacity: export blocks preserve astral Unicode when Blob encodes each downloaded part',async()=>{
  for(const prefix of ['', 'x']){
    const snapshot={note:prefix+'🙂'.repeat(10000)},stream=createExportStream(snapshot),parts=[];let offset=0;
    do{const chunk=stream.read(offset,16384);parts.push(chunk.text);offset=chunk.next;}while(offset!==null);
    assert.equal(await new Blob(parts).text(),JSON.stringify(snapshot));
  }
});
