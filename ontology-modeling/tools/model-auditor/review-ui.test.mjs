import test from 'node:test';
import assert from 'node:assert/strict';
import {MessageChannel} from 'node:worker_threads';
import {createWorkspaceHost} from './workspace-host.js';
import {createWorkspaceClient,newWorkspaceAddress} from './workspace-client.js';
import {createReviewEditor} from './review-ui.js';
const buildId='b'.repeat(64);
async function fixture(t) {
  const address=newWorkspaceAddress(buildId),host=createWorkspaceHost({buildId,workspaceId:address.workspaceId}),clients=[];
  t.after(()=>{clients.forEach(c=>c.disconnect());host.close();});
  async function connect(mode='JOIN',version=0){const channel=new MessageChannel();host.attachPort(channel.port1);const c=createWorkspaceClient({address:{...address,datasetVersion:version},mode});clients.push(c);await c.connect(channel.port2);return c;}
  const a=await connect('CREATE'),{candidateId}=await a.command('prepareImport',{files:[{path:'a.yaml',bytes:new TextEncoder().encode('aggregates: [{id: A}]')}]});
  const {barrier}=await a.command('beginBarrier',{kind:'replace',candidateId});await a.command('ackBarrier',{token:barrier.token,paused:true});
  await a.command('commitCandidate',{token:barrier.token,confirmed:true,reviewRevision:0,exportedReviewRevision:0});await a.whenReady();
  const key=(await a.query({type:'definitions'})).items[0].key,b=await connect('JOIN',1);
  return {a,b,key,host};
}
function editorFor(c){const e=createReviewEditor(c,()=>{});c.onEvent(event=>{if(event.type==='reviewChanged')e.remote(event);});return e;}

test('review UI: readiness is explicit; registered lease precedes input; later typing and IME survive confirmations',async t=>{
  const {a,b,key}=await fixture(t),editor=editorFor(a),field=await editor.ensure(key,'note');assert.ok(field.lease);
  editor.composition(field,true);editor.input(field,'组');editor.input(field,'组合');
  assert.equal((await b.query({type:'review',key})).note.value,'');assert.equal(field.value,'组合');
  editor.composition(field,false);editor.input(field,'后续输入');await editor.flush(field);
  assert.equal((await b.query({type:'review',key})).note.value,'后续输入');assert.equal(field.value,'后续输入');
  assert.equal(field.dirty,false);assert.ok(field.lease);
  const leaseId=field.lease;editor.input(field,'continuous typing');await editor.flush(field);assert.equal(field.lease,leaseId,'editing lease stays registered between keystrokes');
});
test('review UI: same-field conflict retains both values and explicit merge is CAS, idle peer updates without redraw',async t=>{
  const {a,b,key}=await fixture(t),ea=editorFor(a),eb=editorFor(b),fa=await ea.ensure(key,'note'),fb=await eb.ensure(key,'note');
  ea.composition(fa,true);eb.composition(fb,true);ea.input(fa,'local A');eb.input(fb,'local B');
  ea.composition(fa,false);await ea.flush(fa);eb.composition(fb,false);await assert.rejects(eb.flush(fb));
  assert.equal(fb.value,'local B');assert.equal(fb.conflict.current.value,'local A');
  await eb.resolve(fb,'merge','merged A + B');assert.equal((await a.query({type:'review',key})).note.value,'merged A + B');
});
test('review UI: barrier rejects composition/conflict, freezes new input, discards idle leases before ACK and unfreezes cancel',async t=>{
  const {a,key}=await fixture(t),editor=editorFor(a),field=await editor.ensure(key,'note');
  editor.composition(field,true);editor.input(field,'尚未完成');
  const {barrier}=await a.command('beginBarrier',{kind:'export'});
  await assert.rejects(editor.pause(barrier.token));assert.throws(()=>editor.input(field,'forbidden'));
  await a.command('cancelBarrier',{token:barrier.token});await editor.resume();
  editor.composition(field,false);await editor.flush(field);
  const next=await a.command('beginBarrier',{kind:'export'});await editor.pause(next.barrier.token);
  assert.equal(field.lease,null);await a.command('ackBarrier',{token:next.barrier.token,paused:true});
  await a.command('cancelBarrier',{token:next.barrier.token});await editor.resume();assert.ok(field.lease);
});

test('review UI: concurrent view departure releases an idle lease once and retires clean local reservations',async t=>{
  const {a,key,host}=await fixture(t),editor=editorFor(a);await editor.ensure(key,'note');
  await Promise.all([editor.activate('other-view'),editor.activate('another-view')]);
  assert.equal(editor.entries.size,0);assert.equal(host.diagnostics().core.drafts,0);assert.equal(a.recoveryCopy().drafts.length,0);
});
