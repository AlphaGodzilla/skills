import {LIMITS} from './schema.js';
import {parseFile} from './parser.js';
import {buildIndex} from './indexer.js';
import {runChecks} from './checks.js';
export async function importModels(selected,currentFiles,progress=()=>{}) {
  const inputs=[...selected];
  if (!inputs.length) throw new Error('没有选择 YAML 文件。');
  const names=new Set();
  for (const f of inputs) {
    const name=f.webkitRelativePath||f.name;
    if (!/\.ya?ml$/i.test(name)) throw new Error(`不支持的文件：${name}。请选择 .yaml / .yml。`);
    if (names.has(name)) throw new Error(`本批包含同路径文件：${name}。请用目录导入保留路径。`);
    names.add(name);
    if (f.size>LIMITS.fileBytes) throw new Error(`${name} 超过 12 MiB。`);
  }
  const retained=currentFiles.filter(f=>!names.has(f.name));
  if (retained.length+inputs.length>LIMITS.files) throw new Error('合并后超过 80 个文件。');
  if (retained.reduce((n,f)=>n+f.bytes,0)+inputs.reduce((n,f)=>n+f.size,0)>LIMITS.totalBytes) throw new Error('合并后超过 40 MiB。');
  if (!globalThis.crypto?.subtle) throw new Error('当前浏览器无法计算文件指纹，请使用近期 Chrome / Edge / Firefox 打开本地 HTML。');
  const parsed=[];
  for (const [i,input] of inputs.entries()) {
    const name=input.webkitRelativePath||input.name;
    progress(`解析 ${i+1} / ${inputs.length}：${name}`);
    const bytes=await input.arrayBuffer();
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    const file=parseFile(name,text);file.bytes=input.size;
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    file.hash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
    parsed.push(file);
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  // Reparse retained files to keep the current index untouched until commit.
  const fresh=retained.map(f=>Object.assign(parseFile(f.name,f.text),{bytes:f.bytes,hash:f.hash}));
  return runChecks(buildIndex([...fresh,...parsed]));
}
