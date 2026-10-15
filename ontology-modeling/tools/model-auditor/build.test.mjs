import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {loadBuild,startStaticServer} from './serve.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
function run(output,action,n) {
  const args=['build.mjs',action,...(n===undefined?[]:[String(n)]),'--output',output];
  const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:65536});
  return {...result,info:result.status===0?JSON.parse(result.stdout):null};
}
test('build: ordered bounded parts publish a complete version, never replace usable HTML early',async t=>{
  const output=await mkdtemp(path.join('/tmp','omf-build-test-'));t.after(()=>rm(output,{recursive:true,force:true}));
  await writeFile(path.join(output,'omf-auditor.html'),'last usable');
  const start=run(output,'start');assert.equal(start.status,0,start.stderr);
  const {parts,buildId}=start.info;assert.match(buildId,/^[a-f0-9]{64}$/);assert.ok(parts>2);
  assert.equal(run(output,'part',1).status,1);
  assert.equal(run(output,'finish').status,1);
  assert.equal(await readFile(path.join(output,'omf-auditor.html'),'utf8'),'last usable');
  for(let n=0;n<parts;n++) {
    const part=run(output,'part',n);assert.equal(part.status,0,part.stderr);
    assert.equal(part.info.next,n+1);assert.equal(part.info.buildId,buildId);
    assert.ok(part.info.written<=16384);
  }
  assert.equal(run(output,'part',parts-1).status,1);
  const finish=run(output,'finish');assert.equal(finish.status,0,finish.stderr);
  const build=await loadBuild(output);assert.equal(build.buildId,buildId);
  const html=await readFile(path.join(output,'omf-auditor.html'),'utf8');
  assert.ok(html.includes(`"buildId":"${buildId}"`));assert.ok(html.includes('OMFWorkspaceRuntime'));
  assert.equal(html,build.resources.get('/').data.toString());
  assert.ok((await stat(path.join(output,`builds/${buildId}/workspace-worker.js`))).size>10000);
  const syntax=spawnSync(process.execPath,['--check',path.join(output,`builds/${buildId}/workspace-worker.js`)],{encoding:'utf8'});
  assert.equal(syntax.status,0,syntax.stderr);
  const server=await startStaticServer({root:output});t.after(()=>server.close());
  const {request}=await import('node:http');
  const served=await new Promise((resolve,reject)=>{const r=request(server.url+'workspace-worker.js',s=>{let text='';s.on('data',b=>text+=b);s.on('end',()=>resolve(text));});r.on('error',reject);r.end();});
  assert.equal(served,build.resources.get('/workspace-worker.js').data.toString());
  assert.equal(run(output,'finish').status,1);
});
test('build: same-size staged corruption fails its hash checkpoint without replacing old output',async t=>{
  const output=await mkdtemp(path.join('/tmp','omf-build-corrupt-'));t.after(()=>rm(output,{recursive:true,force:true}));
  await writeFile(path.join(output,'omf-auditor.html'),'last usable');
  const start=run(output,'start');assert.equal(start.status,0,start.stderr);
  const {open}=await import('node:fs/promises'),file=await open(path.join(start.info.scratch,'omf-auditor.html'),'r+');
  try {await file.write(Buffer.from('X'),0,1,0);}finally{await file.close();}
  const part=run(output,'part',0);assert.equal(part.status,1);assert.match(part.stderr,/checkpoint/);
  assert.equal(await readFile(path.join(output,'omf-auditor.html'),'utf8'),'last usable');
});
