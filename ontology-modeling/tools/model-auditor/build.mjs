import {build} from 'esbuild';
import {readFile,writeFile,appendFile,stat,mkdir,rename,rm} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {CONTENT_SECURITY_POLICY,loadBuild} from './serve.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const flag=process.argv.indexOf('--output'),output=flag<0?root:path.resolve(process.argv[flag+1]);
const digest=s=>createHash('sha256').update(s).digest('hex'),CHUNK=16384;
const scratch=path.join('/tmp','omf-model-auditor-build-'+digest(root+'\0'+output).slice(0,12));
const progress=path.join(scratch,'build-progress.json'),staged=path.join(scratch,'omf-auditor.html'),workerStage=path.join(scratch,'workspace-worker.js');
await mkdir(scratch,{recursive:true});
const shell=await readFile(path.join(root,'shell.html'),'utf8'),css=await readFile(path.join(root,'style.css'),'utf8');
const [head,rest]=shell.split('<!--CSS-->'),[body,tail]=rest.split('<!--APP-->');
const license=await readFile(path.join(root,'node_modules/yaml/LICENSE'),'utf8');
if (!shell.includes(`content="${CONTENT_SECURITY_POLICY}"`)) throw new Error('HTML meta/header CSP must match.');
async function bundle(entry,options={}) {
  const result=await build({entryPoints:[path.join(root,entry)],bundle:true,write:false,format:'iife',platform:'browser',
    target:['chrome100','firefox100','safari15'],minify:true,legalComments:'inline',charset:'utf8',...options});
  return result.outputFiles[0].text;
}
async function assets() {
  const app=await bundle('app.js'),client=await bundle('workspace-client.js',{globalName:'OMFWorkspaceRuntime'});
  const workerBase=await bundle('workspace-worker.js',{define:{__OMF_BUILD_ID__:JSON.stringify('0'.repeat(64))}});
  const buildId=digest(JSON.stringify([shell,css,license,app,client,workerBase]));
  const config=JSON.stringify({buildId,protocolVersion:1,workerScript:'workspace-worker.js'});
  const js=Buffer.from((`globalThis.OMF_AUDITOR_BUILD=Object.freeze(${config});\n`+client+app).replace(/<\/script/gi,'<\\/script'));
  const worker=Buffer.from(`/* omf-build:${buildId} */\n`+await bundle('workspace-worker.js',{define:{__OMF_BUILD_ID__:JSON.stringify(buildId)}}));
  const prefix=head+`<meta name="omf-build-id" content="${buildId}">\n<style>\n`+css+'\n</style>'+body+
    '\n<!-- YAML parser: yaml 2.8.1, ISC license\n'+license.replace(/--/g,'—')+'\n-->\n<script>\n';
  return {buildId,js,worker,prefix,htmlParts:Math.ceil(js.length/CHUNK),workerParts:Math.ceil(worker.length/CHUNK)};
}
async function fileHash(file) {
  const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');
}
async function checkpoint() {
  const info=JSON.parse(await readFile(progress,'utf8'));
  if ((await stat(staged)).size!==info.htmlBytes||(await stat(workerStage)).size!==info.workerBytes||
    await fileHash(staged)!==info.htmlHash||await fileHash(workerStage)!==info.workerHash) throw new Error('Staged files do not match checkpoint. Restart from start.');
  return info;
}
const action=process.argv[2];
if (action==='start') {
  const a=await assets();
  await writeFile(staged,a.prefix);await writeFile(workerStage,'');
  const info={buildId:a.buildId,next:0,parts:a.htmlParts+a.workerParts,htmlParts:a.htmlParts,
    htmlBytes:Buffer.byteLength(a.prefix),workerBytes:0,htmlHash:digest(a.prefix),workerHash:digest('')};
  await writeFile(progress,JSON.stringify(info));console.log(JSON.stringify({stage:'start',...info,scratch}));
} else if (action==='part') {
  const info=await checkpoint(),n=Number(process.argv[3]);
  if (n!==info.next||n>=info.parts) throw new Error('分批写入顺序错误。');
  const a=await assets();if(a.buildId!==info.buildId)throw new Error('构建源文件已变化，请从 start 重新构建。');
  const html=n<info.htmlParts,part=(html?a.js:a.worker).subarray((html?n:n-info.htmlParts)*CHUNK,(html?n+1:n-info.htmlParts+1)*CHUNK);
  await appendFile(html?staged:workerStage,part);
  if(html){info.htmlBytes+=part.length;info.htmlHash=await fileHash(staged);}
  else {info.workerBytes+=part.length;info.workerHash=await fileHash(workerStage);}
  info.next++;await writeFile(progress,JSON.stringify(info));console.log(JSON.stringify({stage:'part',...info,written:part.length}));
} else if (action==='finish') {
  const info=await checkpoint();
  if(info.next!==info.parts)throw new Error('构建分批写入尚未完成。');
  const a=await assets();if(a.buildId!==info.buildId)throw new Error('构建源文件已变化，请从 start 重新构建。');
  await appendFile(staged,'\n</script>'+tail);
  const relative=`builds/${info.buildId}`,directory=path.join(scratch,relative);
  await mkdir(directory,{recursive:true});
  // Streaming copies retain 16 KiB writes; no one-shot HTML or worker publication.
  for(const [source,name] of [[staged,'omf-auditor.html'],[workerStage,'workspace-worker.js']])
    await pipeline(createReadStream(source,{highWaterMark:CHUNK}),createWriteStream(path.join(directory,name)));
  const resources={};
  for(const name of ['omf-auditor.html','workspace-worker.js']) {
    const file=path.join(directory,name);
    resources[name]={file:`${relative}/${name}`,sha256:await fileHash(file),bytes:(await stat(file)).size};
  }
  const manifest=JSON.stringify({v:1,buildId:info.buildId,resources},null,2)+'\n';
  const manifestStage=path.join(scratch,'omf-auditor-manifest.json');await writeFile(manifestStage,manifest);
  await loadBuild(scratch); // Validate the complete set before replacing any usable entrypoint.
  await mkdir(path.join(output,'builds'),{recursive:true});
  const destination=path.join(output,relative);
  let exists=false;try{await stat(destination);exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
  if(exists) {
    for(const [name,r] of Object.entries(resources))if(await fileHash(path.join(destination,name))!==r.sha256)throw new Error('Existing build ID has different resources.');
  } else await rename(directory,destination);
  await rename(staged,path.join(output,'omf-auditor.html'));
  // This is the service's atomic publication pointer. Older version directories remain usable.
  await rename(manifestStage,path.join(output,'omf-auditor-manifest.json'));
  // Keep the published version visible to source distribution; historical build directories stay ignored.
  const ignorePath=path.join(output,'.gitignore');let ignore='node_modules/\n*.log\n';
  try{ignore=await readFile(ignorePath,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  const kept=ignore.split(/\r?\n/).filter(line=>line&&line!=='builds/'&&line!=='builds/*'&&line!=='omf-auditor-manifest.json'&&!/^!builds\/[a-f0-9]{64}\/$/.test(line));
  await writeFile(ignorePath,kept.join('\n')+`\nbuilds/*\n!builds/${info.buildId}/\n`);
  await rm(progress);console.log(JSON.stringify({stage:'complete',buildId:info.buildId,parts:info.parts,resources}));
} else throw new Error('Usage: node build.mjs start | part <n> | finish [--output <directory>]');
