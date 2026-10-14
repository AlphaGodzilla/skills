import {build} from 'esbuild';
import {readFile,writeFile,appendFile,stat,mkdir,rename,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url)),out=path.join(root,'omf-auditor.html');
const scratch=path.join('/tmp','omf-model-auditor-build-'+createHash('sha256').update(root).digest('hex').slice(0,12));
const progress=path.join(scratch,'build-progress.json'),staged=path.join(scratch,'omf-auditor.html'),CHUNK=16384;
await mkdir(scratch,{recursive:true});
const shell=await readFile(path.join(root,'shell.html'),'utf8');
const css=await readFile(path.join(root,'style.css'),'utf8');
const [head,rest]=shell.split('<!--CSS-->'),[body,tail]=rest.split('<!--APP-->');
const license=await readFile(path.join(root,'node_modules/yaml/LICENSE'),'utf8');
const action=process.argv[2];
async function bundle() {
  const result=await build({entryPoints:[path.join(root,'app.js')],bundle:true,write:false,
    format:'iife',platform:'browser',target:['chrome100','firefox100','safari15'],
    minify:true,legalComments:'inline',charset:'utf8'});
  // Prevent an accidental HTML parser breakout in an embedded JS string.
  return Buffer.from(result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script'));
}
const digest=s=>createHash('sha256').update(s).digest('hex');
if (action==='start') {
  const js=await bundle();
  const prefix=head+'<style>\n'+css+'\n</style>'+body+
    '\n<!-- YAML parser: yaml 2.8.1, ISC license\n'+license.replace(/--/g,'—')+'\n-->\n<script>\n';
  await writeFile(staged,prefix);
  const info={next:0,parts:Math.ceil(js.length/CHUNK),hash:digest(js),bytes:Buffer.byteLength(prefix)};
  await writeFile(progress,JSON.stringify(info));
  console.log(JSON.stringify({stage:'start',...info}));
} else if (action==='part') {
  const info=JSON.parse(await readFile(progress,'utf8')),n=Number(process.argv[3]);
  if (n!==info.next||n>=info.parts) throw new Error('分批写入顺序错误。');
  if ((await stat(staged)).size!==info.bytes) throw new Error('HTML 落盘大小与检查点不符。');
  const js=await bundle();if (digest(js)!==info.hash) throw new Error('构建源文件已变化，请从 start 重新构建。');
  const part=js.slice(n*CHUNK,(n+1)*CHUNK);
  await appendFile(staged,part);info.bytes+=Buffer.byteLength(part);info.next++;
  await writeFile(progress,JSON.stringify(info));
  console.log(JSON.stringify({stage:'part',...info}));
} else if (action==='finish') {
  const info=JSON.parse(await readFile(progress,'utf8'));
  if (info.next!==info.parts||(await stat(staged)).size!==info.bytes) throw new Error('构建分批写入尚未完成。');
  await appendFile(staged,'\n</script>'+tail);
  await rename(staged,out);
  await rm(progress);
  console.log(JSON.stringify({stage:'complete',path:out,bytes:(await stat(out)).size}));
} else throw new Error('Usage: node build.mjs start | part <n> | finish');
