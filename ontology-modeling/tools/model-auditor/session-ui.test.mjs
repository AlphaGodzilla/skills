import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionActions} from './session-ui.js';
import {LIMITS} from './schema.js';

function selected(name,size=1,relative='') {
  return {name,size,webkitRelativePath:relative,reads:0,
    async arrayBuffer(){this.reads++;return new Uint8Array([65]).buffer;}};
}
async function attempt(files) {
  const oldDocument=globalThis.document,oldConfirm=globalThis.confirm;
  const nodes=new Map(['busy','busy-text','file-input','folder-input'].map(id=>[id,{hidden:true,value:'selected',textContent:''}]));
  globalThis.document={getElementById:id=>nodes.get(id)};globalThis.confirm=()=>true;
  const messages=[],requests=[];
  const client={state:()=>({status:'ready',metadata:{}}),
    request:(type,payload)=>{const r={type,...payload,requestId:'probe'};requests.push(r);return r;},
    send:async()=>{throw new Error('STOP_AFTER_READ');},command:async()=>({})};
  const actions=createSessionActions({client,editor:{},message:text=>messages.push(text),readyDataset:()=>{},statusChanged:()=>{}});
  try{await actions.replace(files);return {messages,requests,busy:nodes.get('busy').hidden};}
  finally{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
    if(oldConfirm===undefined)delete globalThis.confirm;else globalThis.confirm=oldConfirm;}
}

test('session import: oversized selected file is rejected before any arrayBuffer read',async()=>{
  const file=selected('large.yaml',LIMITS.fileBytes+1),r=await attempt([file]);
  assert.equal(file.reads,0);assert.equal(r.requests.length,0);assert.match(r.messages.join('\n'),/12 MiB/);assert.equal(r.busy,true);
});
test('session import: excessive selected file count is rejected before any bytes are read',async()=>{
  const files=Array.from({length:LIMITS.files+1},(_,i)=>selected(i+'.yaml',0)),r=await attempt(files);
  assert.ok(files.every(f=>f.reads===0));assert.equal(r.requests.length,0);assert.match(r.messages.join('\n'),/80/);
});
test('session import: cumulative selected byte limit is checked before reading the first file',async()=>{
  const files=Array.from({length:4},(_,i)=>selected(i+'.yaml',LIMITS.fileBytes)),r=await attempt(files);
  assert.ok(files.every(f=>f.reads===0));assert.equal(r.requests.length,0);assert.match(r.messages.join('\n'),/40 MiB/);
});
test('session import: late invalid extension, duplicate path and invalid size never trigger a partial read',async()=>{
  for(const files of [[selected('ok.yaml'),selected('bad.txt')],
    [selected('one.yaml',1,'yaml/same.yaml'),selected('two.yaml',1,'yaml/same.yaml')],
    [selected('ok.yaml'),selected('invalid.yaml',Infinity)]]) {
    const r=await attempt(files);assert.ok(files.every(f=>f.reads===0));assert.equal(r.requests.length,0);
    assert.ok(r.messages.length);assert.doesNotMatch(r.messages.join('\n'),/STOP_AFTER_READ/);
  }
});
test('session import: valid directory metadata retains its path and reaches byte preparation',async()=>{
  const file=selected('ok.yaml',1,'yaml/sub/ok.yaml'),r=await attempt([file]);
  assert.equal(file.reads,1);assert.equal(r.requests.length,1);
  assert.equal(r.requests[0].files[0].path,'yaml/sub/ok.yaml');assert.match(r.messages.join('\n'),/STOP_AFTER_READ/);
});
