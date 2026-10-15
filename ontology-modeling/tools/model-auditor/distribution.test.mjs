import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,copyFile,mkdir,readdir} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('.',import.meta.url));

test('distribution: declared visible release resources alone serve matching HTML and worker with Node stdlib',async()=>{
  const manifest=JSON.parse(await readFile(path.join(root,'omf-auditor-manifest.json'),'utf8'));
  const files=['serve.mjs','omf-auditor.html','omf-auditor-manifest.json',...Object.values(manifest.resources).map(r=>r.file)];
  const ignored=spawnSync('git',['check-ignore',...files],{cwd:root,encoding:'utf8',env:{...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'}});
  assert.equal(ignored.stdout,'','Published files must not be ignored: '+ignored.stdout);assert.equal(ignored.status,1,ignored.stderr);
  const directory=await mkdtemp('/tmp/omf-clean-distribution-');
  for(const file of files){await mkdir(path.dirname(path.join(directory,file)),{recursive:true});await copyFile(path.join(root,file),path.join(directory,file));}
  assert.equal((await readdir(directory)).includes('node_modules'),false);
  assert.deepEqual(await readdir(path.join(directory,'builds')),[manifest.buildId]);
  const server=spawn(process.execPath,[path.join(directory,'serve.mjs')],{cwd:directory,stdio:['ignore','pipe','pipe']});const stopped=new Promise(resolve=>server.once('exit',resolve));let errors='';server.stderr.on('data',b=>errors+=b);
  try {
    const url=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error('Node-only serve timed out: '+errors)),5000);server.once('exit',code=>{clearTimeout(timer);reject(new Error('serve exited '+code+': '+errors));});server.stdout.on('data',b=>{output+=b;const match=output.match(/http:\/\/127\.0\.0\.1:\d+\//);if(match){clearTimeout(timer);resolve(match[0]);}});});
    for(const [name,entry] of Object.entries(manifest.resources)){
      const response=await fetch(url+name);assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.length,entry.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
    }
  }finally{server.kill();await stopped;}
});
