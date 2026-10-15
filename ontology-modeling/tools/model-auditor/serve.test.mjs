import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {request} from 'node:http';
import {startStaticServer,CONTENT_SECURITY_POLICY} from './serve.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t) {
  const root=await mkdtemp(path.join('/tmp','omf-serve-')),buildId='a'.repeat(64);
  t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(path.join(root,'builds',buildId),{recursive:true});
  const html=`<!doctype html><meta name="omf-build-id" content="${buildId}"><meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">`;
  const worker=`/* omf-build:${buildId} */\nvoid 0;`;
  const resources={};
  for(const [name,data] of [['omf-auditor.html',html],['workspace-worker.js',worker]]) {
    const file=`builds/${buildId}/${name}`;await writeFile(path.join(root,file),data);
    resources[name]={file,sha256:hash(data),bytes:Buffer.byteLength(data)};
  }
  await writeFile(path.join(root,'omf-auditor-manifest.json'),JSON.stringify({v:1,buildId,resources}));
  return {root,html,worker,buildId};
}
function get(server,url='/',method='GET',headers={}) {
  return new Promise((resolve,reject)=>{
    const r=request(server.url+url.slice(1),{method,headers},res=>{const chunks=[];res.on('data',c=>chunks.push(c));
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()}));});
    r.on('error',reject);r.end();
  });
}
test('serve: OS-selected 127.0.0.1, whitelist MIME/security headers and HEAD only',async t=>{
  const f=await fixture(t),server=await startStaticServer({root:f.root});t.after(()=>server.close());
  assert.match(server.url,/^http:\/\/127\.0\.0\.1:\d+\/$/);
  const html=await get(server);assert.equal(html.status,200);assert.equal(html.body,f.html);
  assert.match(html.headers['content-type'],/^text\/html/);assert.equal(html.headers['cache-control'],'no-store');
  assert.equal(html.headers['x-content-type-options'],'nosniff');assert.equal(html.headers['x-frame-options'],'DENY');
  assert.equal(html.headers['content-security-policy'],`${CONTENT_SECURITY_POLICY}; frame-ancestors 'none'`);
  const worker=await get(server,'/workspace-worker.js');assert.match(worker.headers['content-type'],/^text\/javascript/);
  assert.equal(worker.body,f.worker);
  const head=await get(server,'/','HEAD');assert.equal(head.body,'');assert.equal(Number(head.headers['content-length']),Buffer.byteLength(f.html));
});
test('serve: rejects foreign Host, traversal, encoded/absolute paths, bodies and all non-read methods',async t=>{
  const f=await fixture(t),server=await startStaticServer({root:f.root});t.after(()=>server.close());
  assert.equal((await get(server,'/','GET',{Host:'localhost:1'})).status,421);
  for(const method of ['POST','PUT','DELETE','OPTIONS','PATCH'])assert.equal((await get(server,'/',method)).status,405);
  assert.equal((await get(server,'/','GET',{'Content-Length':'0'})).status,400);
  assert.equal((await get(server,'/','GET',{'Transfer-Encoding':'chunked'})).status,400);
  for(const url of ['/app.js','/../app.js','/%2e%2e/app.js','//evil.test/','/workspace-worker.js?secret=x','/builds/']) {
    // request.path avoids WHATWG normalization, preserving traversal probes on the wire.
    const response=await new Promise((resolve,reject)=>{const r=request(server.url,{path:url},s=>{s.resume();s.on('end',()=>resolve(s.statusCode));});r.on('error',reject);r.end();});
    assert.ok([400,404].includes(response),url);
  }
});
test('serve: startup verifies a whole build; running responses stay pinned after disk mutation',async t=>{
  const f=await fixture(t),server=await startStaticServer({root:f.root});t.after(()=>server.close());
  await writeFile(path.join(f.root,'builds',f.buildId,'workspace-worker.js'),'changed');
  assert.equal((await get(server,'/workspace-worker.js')).body,f.worker);
  await assert.rejects(startStaticServer({root:f.root}),/integrity/i);
});
test('serve: duplicate Host, absolute request targets, Expect bodies and WebSocket upgrades are rejected on real TCP',async t=>{
  const f=await fixture(t),server=await startStaticServer({root:f.root});t.after(()=>server.close());
  const {connect}=await import('node:net'),url=new URL(server.url);
  const probe=lines=>new Promise((resolve,reject)=>{
    const socket=connect(Number(url.port),'127.0.0.1',()=>socket.end(lines.join('\r\n')+'\r\n\r\n'));
    let result='';socket.on('data',b=>result+=b);socket.on('end',()=>resolve(result));socket.on('error',reject);
  });
  for(const lines of [
    ['GET / HTTP/1.1',`Host: ${url.host}`,'Host: evil.test'],
    ['GET http://evil.test/ HTTP/1.1',`Host: ${url.host}`],
    ['GET / HTTP/1.1',`Host: ${url.host}`,'Content-Length: 4','Expect: 100-continue'],
    ['GET / HTTP/1.1',`Host: ${url.host}`,'Connection: Upgrade','Upgrade: websocket']
  ])assert.match(await probe(lines),/^HTTP\/1\.1 (400|421)/);
});
test('serve: symlinked resources and mismatched page/worker build markers cannot start',async t=>{
  const f=await fixture(t),{symlink,unlink}=await import('node:fs/promises');
  const workerFile=path.join(f.root,'builds',f.buildId,'workspace-worker.js');
  await unlink(workerFile);await writeFile(path.join(f.root,'unexpected.js'),f.worker);
  await symlink(path.join(f.root,'unexpected.js'),workerFile);
  await assert.rejects(startStaticServer({root:f.root}),/integrity/i);
  await unlink(workerFile);const wrong=f.worker.replace(f.buildId,'b'.repeat(64));await writeFile(workerFile,wrong);
  const {readFile}=await import('node:fs/promises'),manifestPath=path.join(f.root,'omf-auditor-manifest.json');
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));manifest.resources['workspace-worker.js'].sha256=hash(wrong);
  await writeFile(manifestPath,JSON.stringify(manifest));
  await assert.rejects(startStaticServer({root:f.root}),/Worker build integrity/i);
});
