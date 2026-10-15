import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFile} from './parser.js';
import {buildIndex} from './indexer.js';
import {assignDefinitionKeys} from './navigation.js';
import {queryView,viewMetadata} from './snapshot.js';

async function fixture() {
  const file=parseFile('模型.yaml','aggregates:\n  - id: A\n    attributes: &fields\n      - name: 中文\n        expression: "<script>never()</script>"\n  - id: A\n    attributes: *fields\nbehaviors: [{id: B, ownerEntity: A}]\n');
  file.hash='a'.repeat(64);file.bytes=200;
  const index=await assignDefinitionKeys(buildIndex([file]));
  return {index,key:index.records[1].key};
}
test('snapshot: bounded definition summaries preserve duplicate identities without raw/index graphs',async()=>{
  const {index}=await fixture(),dto=queryView(index,{type:'definitions',offset:0,limit:1});
  assert.equal(dto.total,3);assert.equal(dto.items.length,1);assert.equal(dto.next,1);
  assert.ok(dto.items[0].key);assert.equal('data' in dto.items[0],false);
  assert.equal('text' in dto.items[0],false);assert.doesNotThrow(()=>JSON.stringify(dto));
  dto.items[0].name='tamper';assert.notEqual(index.records[0].name,'tamper');
});
test('snapshot: typed field pages and scalar slices never clone an entire definition',async()=>{
  const {index,key}=await fixture();
  const dto=queryView(index,{type:'fields',key,path:['attributes'],offset:0,limit:1});
  assert.equal(dto.kind,'array');assert.equal(dto.items[0].kind,'object');
  assert.equal('value' in dto.items[0],false);
  const scalar=queryView(index,{type:'scalar',key,path:['attributes',0,'expression'],offset:0,limit:8});
  assert.equal(scalar.text,'<script>');assert.equal(scalar.next,8);
  assert.equal(queryView(index,{type:'definition',key}).key,key);
});
test('snapshot: source retains original alias lines and resolved field locations, checks remain attributable',async()=>{
  const {index,key}=await fixture();
  const source=queryView(index,{type:'source',key,path:['attributes'],offset:0,limit:2});
  assert.equal(source.location.line,7);assert.match(source.lines[0].text,/\*fields/);
  const child=queryView(index,{type:'source',key,path:['attributes',0,'expression'],offset:0,limit:1});
  assert.equal(child.location.line,5);assert.match(child.lines[0].text,/never/);
  const issues=queryView(index,{type:'issues',offset:0,limit:10});
  assert.ok(issues.items.some(x=>x.code==='duplicate'&&x.key===key));
  const refs=queryView(index,{type:'refs',key:index.records[2].key,offset:0,limit:10});
  assert.equal(refs.items[0].status,'ambiguous');assert.equal(refs.items[0].targets.total,2);
});
test('snapshot: rejects oversized, unknown and prototype/path queries; metadata omits full file list',async()=>{
  const {index,key}=await fixture();
  for(const q of [{type:'index'},{type:['definitions']},{type:new String('definitions')},{type:'definitions',limit:101},{type:'fields',key,path:['__proto__']},
    {type:'definitions',offset:-1},{type:'source',key,limit:17},{type:'scalar',key,path:[]}]) {
    assert.throws(()=>queryView(index,q));
  }
  const meta=viewMetadata({workspaceId:'w',files:[{path:'a'}],sequence:2,stats:{definitions:3}});
  assert.equal(meta.fileCount,1);assert.equal('files' in meta,false);
});

test('snapshot: incoming, permission matrix, exact references and legacy targets are bounded and attributable',async()=>{
  const file=Object.assign(parseFile('roles.yaml','aggregates: [{id: O}]\nbehaviors: [{id: B, ownerEntity: O}]\npermissions: [{permissionId: P, targetType: behavior, targetRef: B, dataScope: OWN}]\nroles: [{roleId: R, permissions: [P]}]\n'),{hash:'b'.repeat(64),bytes:200});
  const index=await assignDefinitionKeys(buildIndex([file])),[object,behavior]=index.records;
  assert.equal(queryView(index,{type:'incoming',key:object.key,limit:1}).items[0].source.key,behavior.key);
  const ref=queryView(index,{type:'reference',key:behavior.key,path:['ownerEntity']});
  assert.equal(ref.status,'resolved');assert.equal(ref.targets.items[0].key,object.key);
  const matrix=queryView(index,{type:'matrix',limit:1});
  assert.equal(matrix.items[0].role.id,'R');assert.equal(matrix.items[0].permission.id,'P');
  assert.equal(queryView(index,{type:'legacy',target:['aggregates','O','roles.yaml']}).key,object.key);
  assert.throws(()=>queryView(index,{type:'legacy',target:['aggregates','missing','roles.yaml']}));
});

test('snapshot: file metadata and warnings retain complete scalar text through bounded pages',async()=>{
  const file=Object.assign(parseFile('meta.yaml','domain: '+ 'd'.repeat(9000)+'\nversion: 1\ncustom_root: warning\naggregates: [{id: A}]'),{hash:'c'.repeat(64),bytes:9100});
  const index=await assignDefinitionKeys(buildIndex([file]));let offset=0,text='';
  do{const dto=queryView(index,{type:'fileText',file:'meta.yaml',field:'domain',offset,limit:4096});text+=dto.text;offset=dto.next;}while(offset!==null);
  assert.equal(text,'d'.repeat(9000));assert.match(queryView(index,{type:'fileText',file:'meta.yaml',field:'warning:0'}).text,/custom_root/);
  assert.throws(()=>queryView(index,{type:'fileText',file:'../meta.yaml',field:'domain'}));
});

test('snapshot: scalar and source blocks do not split an astral Unicode pair at the UI boundary',async()=>{
  const text='x'+'🙂'.repeat(5000),raw='rules: [{id: R, expression: '+JSON.stringify(text)+'}]';
  const file=Object.assign(parseFile('unicode.yaml',raw),{hash:'e'.repeat(64),bytes:20010}),index=await assignDefinitionKeys(buildIndex([file])),key=index.records[0].key;
  const scalar=queryView(index,{type:'scalar',key,path:['expression'],limit:4096});
  assert.equal(/[\uD800-\uDBFF]$/.test(scalar.text),false);assert.equal(scalar.text+queryView(index,{type:'scalar',key,path:['expression'],offset:scalar.next,limit:4096}).text,text.slice(0,scalar.next+4096));
  const source=queryView(index,{type:'source',key,path:[],limit:1});assert.equal(/[\uD800-\uDBFF]$/.test(source.lines[0].text),false);
});
