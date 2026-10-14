import test from 'node:test';
import assert from 'node:assert/strict';
import {stringify} from 'yaml';
import {parseFile,location,displayPath} from './parser.js';
import {buildIndex,objectContext} from './indexer.js';
import {runChecks} from './checks.js';
import {importModels} from './importer.js';
import {detailView} from './detail.js';
import {inspectorView,exportReviews} from './inspector.js';
import {DEMO} from './demo.js';
const parse=data=>parseFile('test.yaml',stringify(data));
const index=files=>runChecks(buildIndex(files));
test('demo models form a resolved cross-model index',()=>{
  const model=index(DEMO.map(([name,text])=>parseFile(name,text)));
  assert.equal(model.files.length,7);assert.equal(model.issues.length,0);
  const contract=model.records.find(r=>r.id==='AGG-CONTRACT-001');
  assert.ok(objectContext(contract).some(x=>x.record.id==='RULE-CONTRACT-CLOSE'));
});
test('YAML multiline, comments, quotes and flow mappings preserve exact source line',()=>{
  const f=parseFile('source.yaml','# comment\nbehaviors:\n  - id: A\n    name: test\n    preconditions: ["x > 0"]\n    expression: |\n      RETURN true\n');
  const r=index([f]).records[0];
  assert.equal(r.loc.line,3);assert.equal(location(r,['expression']).line,6);
  assert.equal(r.data.expression,'RETURN true\n');
  assert.equal(location(r,['preconditions',0]).line,5);
  assert.equal(displayPath(['steps',0,'behaviorRef']),'steps[0].behaviorRef');
});
for (const [name,text] of [
  ['duplicate mapping','aggregates: []\naggregates: []'],
  ['top array','- id: A'],['top JSON','{"aggregates":[]}'],
  ['multi-document','aggregates: []\n---\nbehaviors: []'],
  ['custom tag','aggregates: !foo []'],['bad YAML','aggregates: ['],
  ['non-string ID','aggregates: [{id: 123}]'],['missing ID','behaviors: [{name: A}]'],
  ['wrong section type','behaviors: {}'],['unsupported root','unrelated: []'],
  ['cyclic alias','aggregates: [{id: A, x: &a {self: *a}}]']
]) test('reject '+name,()=>assert.throws(()=>parseFile(name+'.yaml',text)));
test('flow-local IDs never resolve against another flow',()=>{
  const model=index([parse({flows:[
    {id:'F1',startActivity:'A01',endActivities:['A02'],activities:[{activityId:'A01',activityType:'START',nextActivities:['A02']}]},
    {id:'F2',startActivity:'A01',endActivities:['A02'],activities:[{activityId:'A01',activityType:'START'},{activityId:'A02',activityType:'END'}]}
  ]})]);
  const first=model.records[0],second=model.records[1];
  assert.equal(first.refs.find(r=>r.key==='endActivities').status,'missing');
  assert.equal(second.refs.find(r=>r.key==='endActivities').status,'resolved');
});
test('same typed IDs are ambiguous, never silently choose a definition',()=>{
  const model=index([parse({behaviors:[{id:'B',ownerEntity:'O'},{id:'B',ownerEntity:'O'}],events:[
    {eventId:'E',producerType:'BEHAVIOR',producerBehaviorRef:'B'}]})]);
  const ref=model.records[2].refs[0];
  assert.equal(ref.status,'ambiguous');assert.equal(ref.targets.length,2);
  assert.ok(model.issues.some(i=>i.code==='duplicate'));
});
test('references are type-specific; arbitrary names are not guessed',()=>{
  const model=index([parse({behaviors:[{id:'same',ownerEntity:'same'}],rules:[{id:'same',name:'R'}]})]);
  assert.equal(model.records[0].refs[0].status,'missing');
  assert.equal(model.records[1].refs.length,0);
});
test('unknown Ref fields are explicitly disclosed',()=>{
  const model=index([parse({behaviors:[{id:'B',customThingRef:'unknown'}]})]);
  assert.equal(model.records[0].unknown[0].key,'customThingRef');
});
test('untrusted YAML values remain escaped in all detail and inspector HTML',()=>{
  const payload='<img src=x onerror=alert(1)>';
  const model=index([parse({aggregates:[{id:'A',name:payload,lifecycle:[payload],attributes:[{name:'x',label:payload}]}]})]);
  const r=model.records[0],html=detailView(r,model,'fields');
  assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));
  const state={index:model,selected:r.uid,reviews:new Map([[r.uid,{status:'pending',note:'</textarea><script>alert(1)</script>'}]])};
  assert.ok(!inspectorView(state).includes('<script>'));
});
test('imports append, replace paths, fingerprint original bytes and remain atomic',async()=>{
  const first=await importModels([new File(['aggregates: [{id: A, lifecycle: [a]}]'],'m1.yaml')],[]);
  const hash=first.files[0].hash;assert.match(hash,/^[0-9a-f]{64}$/);
  const second=await importModels([new File(['behaviors: [{id: B, ownerEntity: A}]'],'m2.yaml')],first.files);
  assert.equal(second.files.length,2);assert.equal(second.records[1].refs[0].status,'resolved');
  const before=second.records[0].incoming.length;
  await assert.rejects(()=>importModels([new File(['bad: ['],'broken.yaml')],second.files));
  assert.equal(second.records[0].incoming.length,before);assert.equal(second.files[0].hash,hash);
  const replaced=await importModels([new File(['aggregates: [{id: A2, lifecycle: [a]}]'],'m1.yaml')],second.files);
  assert.equal(replaced.files.length,2);assert.ok(replaced.issues.some(i=>i.code==='reference'));
});
test('invalid UTF-8 is rejected rather than silently replaced',async()=>{
  await assert.rejects(()=>importModels([new File([new Uint8Array([255,254])],'bad.yaml')],[]));
});
test('duplicate incoming names and oversized files are rejected',async()=>{
  const f=new File(['aggregates: []'],'same.yaml');
  await assert.rejects(()=>importModels([f,f],[]),/同路径/);
  await assert.rejects(()=>importModels([{name:'big.yaml',size:13*1024*1024}],[]),/12 MiB/);
});
test('review exports bind every review to a file fingerprint',async()=>{
  const model=await importModels([new File(['rules: [{id: R, expression: x > 0}]'],'rules.yaml')],[]);
  const r=model.records[0],state={index:model,reviews:new Map([[r.uid,{status:'changes',note:'Check threshold'}]])};
  const data=exportReviews(state);assert.equal(data.reviews[0].fileSha256,model.files[0].hash);
  assert.equal(data.reviews[0].status,'changes');
});
test('2000-record index and page rendering stay bounded',()=>{
  const model=index([parse({aggregates:[{id:'A',lifecycle:['draft']}],behaviors:Array.from({length:2000},(_,i)=>({id:'B'+i,ownerEntity:'A',preconditions:['x > 0']}))})]);
  assert.equal(model.records[0].incoming.length,2000);
  const html=detailView(model.records[0],model);
  assert.equal((html.match(/data-card=/g)||[]).length,40);
});
test('YAML alias children navigate to the anchor definition, not an unrelated parent',()=>{
  const model=index([parseFile('alias.yaml','defaults: &base\n  expression: x > 0\nrules:\n  - id: R\n    conditions: *base\n')]);
  const r=model.records[0];assert.equal(location(r,['conditions','expression']).line,2);
});
test('permission target type cannot accidentally use Object prototype properties',()=>{
  const model=index([parse({permissions:[{permissionId:'P',targetType:'__proto__',targetRef:'X'}]})]);
  assert.equal(model.records[0].unknown[0].key,'targetRef');
});
test('directory import preserves relative paths for same-basename files',async()=>{
  const a=new File(['rules: [{id: RA}]'],'rules.yaml');Object.defineProperty(a,'webkitRelativePath',{value:'a/rules.yaml'});
  const b=new File(['rules: [{id: RB}]'],'rules.yaml');Object.defineProperty(b,'webkitRelativePath',{value:'b/rules.yaml'});
  const model=await importModels([a,b],[]);assert.equal(model.files.length,2);
  assert.deepEqual(model.files.map(f=>f.name),['a/rules.yaml','b/rules.yaml']);
});
test('non-string display names fail parsing before workspace commit',()=>{
  assert.throws(()=>parse({rules:[{id:'R',name:{toString:'not-callable'}}]}),/必须是字符串/);
});
test('structured descriptions cannot cause implicit object coercion failures',()=>{
  const model=index([parse({rules:[{id:'R',description:{toString:'text'},expression:'x'}]})]);
  assert.doesNotThrow(()=>detailView(model.records[0],model));
});
