import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFile} from './parser.js';
import {buildIndex} from './indexer.js';
import {assignDefinitionKeys,definitionKey,encodeRoute,decodeRoute,resolveRoute,getPathValue} from './navigation.js';
import {importModels} from './importer.js';

test('navigation: independent source owner survives routes without changing the review owner or view',async()=>{
  const index=await models(),r={...route(index.records[0].key),view:'fields',sourceKey:index.records[1].key};
  assert.deepEqual(decodeRoute(encodeRoute(r)),r);
  const resolved=resolveRoute(encodeRoute(r),index,context);
  assert.equal(resolved.record,index.records[0]);assert.equal(resolved.sourceRecord,index.records[1]);
  assert.equal(resolved.value,'次个');
  assert.throws(()=>encodeRoute({...r,sourceKey:'n0'}),code('INVALID_ROUTE'));
  assert.throws(()=>resolveRoute(encodeRoute({...r,sourceKey:'def_'+'f'.repeat(64)}),index,context),code('MISSING_DEFINITION'));
});

test('navigation: problem-page source focus preserves page and an explicit review owner',async()=>{
  const index=await models(),r={...route(index.records[0].key),page:'issues',sourceKey:index.records[1].key};
  assert.deepEqual(decodeRoute(encodeRoute(r)),r);
  assert.equal(resolveRoute(encodeRoute(r),index,context).sourceRecord,index.records[1]);
  const contextOnly={v:1,...context,page:'files',key:index.records[0].key,view:'fields'};
  assert.deepEqual(decodeRoute(encodeRoute(contextOnly)),contextOnly);
});

const context={workspaceId:'workspace_1234567890',credential:'credential_1234567890',datasetVersion:2};
const file=(name,text,hash='a'.repeat(64))=>Object.assign(parseFile(name,text),{hash});
const models=async()=>assignDefinitionKeys(buildIndex([
  file('目录/模型.yaml','flows:\n  - id: 重复\n    activities: [{activityId: A, name: 首个}]\n  - id: 重复\n    activities: [{activityId: A, name: 次个}]\n'),
  file('对象.yaml','aggregates: [{id: O}]\nbehaviors: [{id: B, ownerEntity: O}]\n')
]));
const route=key=>({v:1,...context,page:'models',key,view:'source',path:['activities',0,'name']});
const code=value=>error=>error.code===value;

test('navigation: stable keys distinguish duplicate IDs and preserve the index object graph',async()=>{
  const index=await models(),keys=index.records.map(r=>r.key);
  assert.equal(new Set(keys).size,4);
  assert.ok(keys.every(key=>/^def_[a-f0-9]{64}$/.test(key)));
  const again=await models();assert.deepEqual(again.records.map(r=>r.key),keys);
  const behavior=index.records[3],object=index.records[2];
  assert.equal(behavior.refs[0].targets[0],object);
  assert.equal(index.byKey.get(behavior.key),behavior);
  assert.equal(index.byUid.get(behavior.uid),behavior);
  const changed={...index.records[0],file:{...index.files[0],hash:'b'.repeat(64)}};
  assert.notEqual(await definitionKey(changed),keys[0]);
  assert.notEqual(await definitionKey({...changed,file:{...changed.file,name:'other.yaml'}}),await definitionKey(changed));
});

test('navigation: versioned fragment round-trips typed Chinese paths and resolves within its definition',async()=>{
  const index=await models(),r=route(index.records[1].key),hash=encodeRoute(r);
  assert.ok(hash.startsWith('#audit='));assert.deepEqual(decodeRoute(hash),r);
  const resolved=resolveRoute(hash,index,context);
  assert.equal(resolved.record,index.records[1]);assert.equal(resolved.value,'次个');
  const stringIndex={...r,path:['activities','0','name']};
  assert.throws(()=>resolveRoute(encodeRoute(stringIndex),index,context),code('INVALID_PATH'));
  assert.equal(getPathValue({'0':'键'},['0']),'键');
  assert.throws(()=>getPathValue({'0':'键'},[0]),code('INVALID_PATH'));
});

test('navigation: rejects malformed, oversized and unknown route data without falling back',async()=>{
  const index=await models(),r=route(index.records[0].key);
  for (const bad of ['#audit=%ZZ','#audit=null','#audit='+encodeURIComponent('{}'),'#other=x','#audit='+'a'.repeat(33000)]) {
    assert.throws(()=>decodeRoute(bad),code('INVALID_ROUTE'));
  }
  for (const patch of [{v:2},{datasetVersion:-1},{datasetVersion:1.5},{page:'execute'},{view:'eval'},
    {key:'n0'},{extra:'payload'},{credential:'short'},{path:[null]},{path:Array(71).fill('x')}]) {
    assert.throws(()=>encodeRoute({...r,...patch}),code('INVALID_ROUTE'));
  }
  assert.throws(()=>encodeRoute({...context,v:1,page:'files',path:[]}),code('INVALID_ROUTE'));
  assert.throws(()=>resolveRoute(encodeRoute(r),index,{...context,datasetVersion:3}),code('STALE_DATASET'));
  assert.throws(()=>resolveRoute(encodeRoute(r),index,{...context,workspaceId:'other_workspace_12345'}),code('WRONG_WORKSPACE'));
  assert.throws(()=>resolveRoute(encodeRoute({...r,key:'def_'+'f'.repeat(64)}),index,context),code('MISSING_DEFINITION'));
});

test('navigation: source paths enforce own properties, depth, types and array bounds',()=>{
  for (const path of [['__proto__'],['constructor'],['prototype'],['items',-1],['items',1],
    ['items',0.5],['items','length'],['items',0,'toString'],Array(71).fill('x')]) {
    assert.throws(()=>getPathValue({items:[{name:'safe'}]},path),code('INVALID_PATH'));
  }
  assert.throws(()=>getPathValue(Object.create({inherited:1}),['inherited']),code('INVALID_PATH'));
  assert.equal(getPathValue({empty:{'':'ok'}},['empty','']),'ok');
});

test('navigation: legacy model URLs convert only after exactly one imported match',async()=>{
  const index=await models(),old=(section,id,name)=>'#model='+encodeURIComponent(JSON.stringify([section,id,name]));
  const resolved=resolveRoute(old('aggregates','O','对象.yaml'),index,context);
  assert.equal(resolved.record,index.records[2]);assert.equal(resolved.route.key,index.records[2].key);
  assert.throws(()=>resolveRoute(old('flows','重复','目录/模型.yaml'),index,context),code('AMBIGUOUS_LEGACY'));
  assert.throws(()=>resolveRoute(old('flows','不存在','目录/模型.yaml'),index,context),code('MISSING_DEFINITION'));
  assert.throws(()=>resolveRoute('#model=%ZZ',index,context),code('INVALID_ROUTE'));
  assert.throws(()=>resolveRoute(old('flows','重复','../模型.yaml'),index,context),code('INVALID_ROUTE'));
});

test('navigation: strict schema rejects coercible identities, sparse paths and duplicate JSON keys',async()=>{
  const index=await models(),r=route(index.records[0].key);
  for (const patch of [{workspaceId:1234567890123456},{credential:1234567890123456},{path:new Array(1)}]) {
    assert.throws(()=>encodeRoute({...r,...patch}),code('INVALID_ROUTE'));
  }
  const duplicate=JSON.stringify(r).replace('"v":1','"v":2,"v":1');
  assert.throws(()=>decodeRoute('#audit='+encodeURIComponent(duplicate)),code('INVALID_ROUTE'));
  for (const path of ['/root.yaml','C:/root.yaml','a\\b.yaml','a//b.yaml','./a.yaml','a/../b.yaml','a\u0000.yaml']) {
    await assert.rejects(definitionKey({...index.records[0],file:{...index.files[0],name:path}}),code('INVALID_PATH'));
  }
});
for (const field of ['constructor','prototype','__proto__']) test(`navigation: imported own ${field} is a routable data field`,async()=>{
  const index=await assignDefinitionKeys(await importModels([new File([
    `aggregates:\n  - id: OWN\n    ${field}: legitimate-own-value\n`],'own.yaml')],[]));
  const record=index.records[0];assert.equal(Object.hasOwn(record.data,field),true);
  assert.equal(getPathValue(record.data,[field]),'legitimate-own-value');
  const target={v:1,...context,page:'models',key:record.key,view:'source',path:[field]};
  assert.deepEqual(decodeRoute(encodeRoute(target)),target);
  assert.equal(resolveRoute(encodeRoute(target),index,context).value,'legitimate-own-value');
  assert.throws(()=>getPathValue({},[field]),code('INVALID_PATH'));
  assert.throws(()=>getPathValue({},['constructor','prototype','polluted']),code('INVALID_PATH'));
  assert.equal(Object.hasOwn(Object.prototype,'polluted'),false);
});
