import test from 'node:test';
import assert from 'node:assert/strict';
import {MessageChannel,Worker} from 'node:worker_threads';
import {createWorkspaceHost} from './workspace-host.js';
import {createWorkspaceClient,newWorkspaceAddress,sharedWorkerTarget} from './workspace-client.js';
const buildId='b'.repeat(64),address=newWorkspaceAddress(buildId);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const errorCode=code=>error=>error.code===code;
function setup(t,options={}) {
  const host=createWorkspaceHost({buildId,workspaceId:address.workspaceId,...options});
  const clients=[];t.after(()=>{for(const c of clients)c.disconnect();host.close();});
  const connect=async(mode='JOIN',extra={})=>{
    const {port1,port2}=new MessageChannel();host.attachPort(port1);
    const client=createWorkspaceClient({address,mode,...extra});clients.push(client);
    await client.connect(port2);return client;
  };
  return {host,connect};
}
async function load(a,others=[]) {
  const {candidateId}=await a.command('prepareImport',{files:[{path:'a.yaml',bytes:new TextEncoder().encode('aggregates: [{id: A}]\n')}]});
  const {barrier}=await a.command('beginBarrier',{kind:'replace',candidateId});
  for(const client of [a,...others])await client.command('ackBarrier',{token:barrier.token,paused:true});
  await a.command('commitCandidate',{token:barrier.token,confirmed:true,reviewRevision:0,exportedReviewRevision:0});
  await wait(15);
  return (await a.query({type:'definitions'})).items[0].key;
}
test('runtime: JOIN on an empty worker expires; bad credential/build do not create authority',async t=>{
  const {connect}=setup(t);
  await assert.rejects(connect(),errorCode('WORKSPACE_EXPIRED'));
  const a=await connect('CREATE');assert.equal(a.state().writable,true);
  await assert.rejects(connect('JOIN',{address:{...address,credential:'f'.repeat(64)}}),errorCode('UNAUTHORIZED'));
  await assert.rejects(connect('JOIN',{address:{...address,buildId:'c'.repeat(64)}}),errorCode('BUILD_MISMATCH'));
});
test('runtime: snapshot plus increments have no gap; retry broadcasts once and binds identity',async t=>{
  const {connect}=setup(t),a=await connect('CREATE'),b=await connect();
  const key=await load(a,[b]),events=[];b.onEvent(e=>events.push(e));
  const request=a.request('setReview',{key,field:'note',value:'一次',baseRevision:0});
  const one=await a.send(request);await assert.rejects(a.send(request),errorCode('REQUEST_RETIRED'));assert.equal(one.current.revision,1);
  await wait(15);assert.equal(events.filter(e=>e.type==='reviewChanged').length,1);
  assert.equal((await b.query({type:'review',key})).note.value,'一次');
  await assert.rejects(a.send({...a.request('setReview',{key,field:'note',value:'spoof',baseRevision:1}),clientId:b.clientId}),errorCode('IDENTITY_MISMATCH'));
  assert.equal(a.state().metadata.sequence,b.state().metadata.sequence);
});
test('runtime: deadline timer aborts without commands, no waiting lock and no automatic ACK/eviction',async t=>{
  const {connect}=setup(t,{barrierTimeoutMs:50}),a=await connect('CREATE'),b=await connect();
  const key=await load(a,[b]);const {draftId}=await b.command('openDraft',{key,field:'note'});
  const {barrier}=await a.command('beginBarrier',{kind:'export'});
  await b.command('setReview',{key,field:'note',value:'flush',baseRevision:0,draftId,token:barrier.token});
  await a.command('ackBarrier',{token:barrier.token,paused:true});
  await wait(85);assert.equal(a.state().metadata.barrier,null);
  assert.equal(b.state().writable,true);
  await assert.rejects(a.command('finishExport',{token:barrier.token}),errorCode('STALE_BARRIER'));
});
test('runtime: pagehide LEAVE and fresh authenticated rejoin keep drafts/cache, old requests never execute again',async t=>{
  const {host,connect}=setup(t),a=await connect('CREATE');const key=await load(a);
  a.setDraft('note','local');await a.query({type:'definition',key});
  const request=a.request('setReview',{key,field:'note',value:'saved',baseRevision:0});await a.send(request);
  a.pagehide();await wait(10);assert.equal(a.state().writable,false);
  assert.equal(a.recoveryCopy().drafts[0].value,'local');
  const {port1,port2}=new MessageChannel();host.attachPort(port1);await a.connect(port2);
  await assert.rejects(a.send(request),errorCode('IDENTITY_MISMATCH'));assert.equal((await a.query({type:'review',key})).note.revision,1);assert.equal(a.state().writable,true);
});
test('runtime: fixed same-origin URL/name; file mode and unavailable SharedWorker never fallback',()=>{
  const target=sharedWorkerTarget('http://127.0.0.1:1234/omf-auditor.html',address);
  assert.equal(target.url,'http://127.0.0.1:1234/workspace-worker.js');
  assert.equal(target.name,`omf:${buildId}:${address.workspaceId}`);
  assert.throws(()=>sharedWorkerTarget('file:///tmp/a.html',address),errorCode('SHARED_MODE_UNAVAILABLE'));
});
test('runtime: slow consumers have a bounded ACK window, resync does not evict/approve them',async t=>{
  const {host,connect}=setup(t,{windowFrames:4,barrierTimeoutMs:80}),a=await connect('CREATE');
  const key=await load(a),{port1,port2}=new MessageChannel(),messages=[];
  t.after(()=>port2.close());host.attachPort(port1);port2.on('message',m=>messages.push(m));
  const rawId='d'.repeat(64);
  port2.postMessage({type:'HELLO',v:1,mode:'JOIN',...address,datasetVersion:1,clientId:rawId});
  await wait(15);const snapshot=messages.find(m=>m.type==='SNAPSHOT');assert.ok(snapshot);
  port2.postMessage({type:'ACK',deliveryId:snapshot.deliveryId});await wait(5);
  for(let i=0;i<12;i++)await a.command('setReview',{key,field:'note',value:`n${i}`,baseRevision:i});
  await wait(10);
  assert.equal(messages.filter(m=>m.type==='RESYNC_REQUIRED').length,1);
  assert.ok(host.diagnostics().unacknowledged.every(p=>p.frames<=4&&p.bytes<=262144));
  const {barrier}=await a.command('beginBarrier',{kind:'export'});
  assert.ok(barrier.participants.includes(rawId));
  await a.command('ackBarrier',{token:barrier.token,paused:true});
  await assert.rejects(a.command('finishExport',{token:barrier.token}),errorCode('BARRIER_NOT_READY'));
  port2.postMessage({type:'RESYNC'});await wait(15);
  const last=messages.filter(m=>m.type==='SNAPSHOT').at(-1);
  assert.equal(last.metadata.reviewRevision,12);assert.equal('files' in last.metadata,false);
});
test('runtime: unretired receipt window backpressures, retries replay once, ACK frees capacity and old sequences expire',async t=>{
  const {host,connect}=setup(t,{maxCommands:2}),a=await connect('CREATE',{autoRetire:false});
  const request=a.request('prepareClear'),result=await a.send(request),cancel=a.request('cancelPreparation',{targetRequestId:request.requestId});await a.send(cancel);
  await assert.rejects(a.command('prepareClear'),errorCode('REQUEST_BACKPRESSURE'));
  assert.deepEqual(await a.send(request),result);
  await assert.rejects(a.send({...request,type:'exportConfirmedSnapshot',allowIncomplete:true}),errorCode('REQUEST_REUSE'));
  assert.equal(host.diagnostics().receipts,2);a.retire(request);a.retire(cancel);
  await a.command('prepareClear');await assert.rejects(a.send(request),errorCode('REQUEST_RETIRED'));
});
test('runtime: unauthenticated commands and unsupported protocol close without write authority',async t=>{
  const {host}=setup(t,{handshakeTimeoutMs:25});
  for(const message of [{type:'COMMAND',requestId:'x'},
    {type:'HELLO',v:2,mode:'CREATE',...address,clientId:'e'.repeat(64)}]) {
    const {port1,port2}=new MessageChannel();host.attachPort(port1);
    const got=new Promise(resolve=>port2.once('message',resolve));port2.postMessage(message);
    const m=await got;assert.equal(m.type,'ERROR');port2.close();
  }
  assert.equal(host.diagnostics().commands,0);
  const {port1,port2}=new MessageChannel();host.attachPort(port1);
  const m=await new Promise(resolve=>port2.once('message',resolve));
  assert.equal(m.error.code,'HANDSHAKE_TIMEOUT');port2.close();
});
test('runtime: export is requester-only chunked JSON; saved confirmation is separate from generation',async t=>{
  const {connect}=setup(t),a=await connect('CREATE'),b=await connect();const key=await load(a,[b]);
  await a.command('setReview',{key,field:'note',value:'已确认',baseRevision:0});
  const {barrier}=await a.command('beginBarrier',{kind:'export'});
  for(const c of [a,b])await c.command('ackBarrier',{token:barrier.token,paused:true});
  const {download}=await a.command('finishExport',{token:barrier.token});
  assert.ok(download.complete);assert.equal(a.state().metadata.dirty,true);
  await assert.rejects(b.query({type:'exportChunk',snapshotId:download.snapshotId}),errorCode('STALE_EXPORT'));
  let text='',offset=0;do {const chunk=await a.query({type:'exportChunk',snapshotId:download.snapshotId,offset,limit:32});text+=chunk.text;offset=chunk.next;}while(offset!==null);
  assert.equal(JSON.parse(text).reviews[0].note,'已确认');
  await a.command('confirmExport',{snapshotId:download.snapshotId,saved:true});assert.equal(a.state().metadata.dirty,false);
});
test('runtime: real worker_threads host remains usable after creator LEAVE',async t=>{
  const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');
    import(workerData.module).then(({createWorkspaceHost})=>{
      const host=createWorkspaceHost(workerData.options);
      parentPort.on('message',port=>host.attachPort(port));parentPort.postMessage('ready');
    });`,{eval:true,workerData:{module:new URL('./workspace-host.js',import.meta.url).href,options:{buildId,workspaceId:address.workspaceId}}});
  t.after(()=>worker.terminate());await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});
  const clients=[];t.after(()=>clients.forEach(c=>c.disconnect()));
  const connect=async mode=>{const {port1,port2}=new MessageChannel();worker.postMessage(port1,[port1]);
    const c=createWorkspaceClient({address,mode});clients.push(c);await c.connect(port2);return c;};
  const a=await connect('CREATE'),b=await connect('JOIN');a.pagehide();await wait(10);
  assert.equal((await b.command('prepareClear')).stats.definitions,0);
});
test('runtime: snapshot resync requests cannot bypass the ACK window; initial join increments are contiguous',async t=>{
  const {host,connect}=setup(t),a=await connect('CREATE'),{port1,port2}=new MessageChannel(),messages=[];
  host.attachPort(port1);t.after(()=>port2.close());port2.on('message',m=>messages.push(m));
  port2.postMessage({type:'HELLO',v:1,mode:'JOIN',...address,clientId:'9'.repeat(64)});await wait(10);
  const first=messages.find(m=>m.type==='SNAPSHOT');
  const {barrier}=await a.command('beginBarrier',{kind:'export'});await wait(10);
  const increments=messages.filter(m=>m.type==='EVENT');
  assert.equal(increments[0].event.sequence,first.metadata.sequence+1);
  assert.equal(increments[0].event.barrier.token,barrier.token);
  for(let i=0;i<30;i++)port2.postMessage({type:'RESYNC'});
  await wait(10);assert.equal(messages.filter(m=>m.type==='SNAPSHOT').length,1);
});
test('runtime: client timeout is read-only and unavailable native SharedWorker never creates a copy',async t=>{
  const {port1,port2}=new MessageChannel();t.after(()=>port1.close());
  const c=createWorkspaceClient({address,timeoutMs:15});
  await assert.rejects(c.connect(port2),errorCode('HANDSHAKE_TIMEOUT'));
  assert.equal(c.state().writable,false);
  await assert.rejects(c.command('prepareClear'),errorCode('READ_ONLY'));
  const {connectSharedWorkspace}=await import('./workspace-client.js');
  await assert.rejects(connectSharedWorkspace('http://127.0.0.1:1234/omf-auditor.html',{address,mode:'CREATE'}),errorCode('SHARED_MODE_UNAVAILABLE'));
});
test('runtime: large accepted scalar exports through bounded cursor blocks without a whole-JSON gate',async t=>{
  const {connect}=setup(t),a=await connect('CREATE'),events=[];a.onEvent(e=>events.push(e));
  const {candidateId}=await a.command('prepareImport',{files:[{path:'long.yaml',bytes:new TextEncoder().encode('aggregates: [{id: '+ 'A'.repeat(3*1024*1024)+'}]\n')}]});
  const {barrier}=await a.command('beginBarrier',{kind:'replace',candidateId});
  await a.command('ackBarrier',{token:barrier.token,paused:true});
  await a.command('commitCandidate',{token:barrier.token,confirmed:true,reviewRevision:0,exportedReviewRevision:0});await wait(15);
  const {download}=await a.command('exportConfirmedSnapshot',{allowIncomplete:true});let offset=0,text='';
  do{const block=await a.query({type:'exportChunk',snapshotId:download.snapshotId,offset});assert.ok(block.text.length<=16384);text+=block.text;offset=block.next;}while(offset!==null);
  assert.equal(JSON.parse(text).reviews[0].id.length,3*1024*1024);
  assert.equal(events.filter(e=>e.type==='exportGenerated').length,1);await a.command('releaseExport',{snapshotId:download.snapshotId});
});
test('runtime: maximum-size Chinese review gets one event and a bounded receipt without resync',async t=>{
  const {connect}=setup(t),a=await connect('CREATE'),key=await load(a);
  const result=await a.command('setReview',{key,field:'note',value:'中'.repeat(65536),baseRevision:0});
  assert.equal(result.current.value.length,65536);assert.equal('event' in result,false);
  assert.equal(a.state().status,'ready');assert.equal(a.state().metadata.reviewRevision,1);
});
test('runtime: ACK reclaims a small receipt window while export/cleanup remain usable across repeated attempts',async t=>{
  const {connect}=setup(t,{maxCommands:2}),a=await connect('CREATE');
  const request=a.request('prepareClear');await a.send(request);
  await a.command('cancelPreparation',{targetRequestId:request.requestId});
  for(let i=0;i<6;i++){const next=a.request('prepareClear');await a.send(next);await a.command('cancelPreparation',{targetRequestId:next.requestId});}
  const {barrier}=await a.command('beginBarrier',{kind:'export'});
  await a.command('ackBarrier',{token:barrier.token,paused:true});
  const {download}=await a.command('finishExport',{token:barrier.token});
  assert.equal(download.complete,true);await a.command('confirmExport',{snapshotId:download.snapshotId,saved:true});
});
test('runtime: stale identities/spoofed reconnects are refused and recovery fragments retain query attribution',async t=>{
  const {connect}=setup(t),a=await connect('CREATE'),key=await load(a);
  const response=await a.query({type:'review',key});await a.query({type:'source',key,path:[],limit:1});
  assert.equal(response.datasetVersion,1);assert.match(response.requestId,/^q[0-9]+$/);
  const request=a.request('setReview',{key,field:'note',value:'old',baseRevision:0});
  await assert.rejects(a.send({...request,instanceId:'expired'}),errorCode('STALE_INSTANCE'));
  await assert.rejects(a.send({...request,datasetVersion:0}),errorCode('STALE_DATASET'));
  await assert.rejects(connect('JOIN',{address:{...address,datasetVersion:1},clientId:a.clientId}),errorCode('UNAUTHORIZED'));
  a.disconnect();const recovery=a.recoveryCopy();
  assert.equal(recovery.datasetVersion,1);assert.equal(recovery.authoritative,false);
  assert.ok(recovery.views.some(v=>v.query.type==='review'&&v.query.key===key&&v.datasetVersion===1));
  assert.ok(recovery.views.some(v=>v.query.type==='source'&&v.value.fileSha256));
  assert.equal('snapshotId' in recovery,false);assert.equal(recovery.completeness.complete,false);
});
