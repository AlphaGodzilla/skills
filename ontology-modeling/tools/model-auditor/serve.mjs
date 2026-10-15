import {createServer} from 'node:http';
import {open,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const CONTENT_SECURITY_POLICY="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; worker-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const rootPath=path.dirname(fileURLToPath(import.meta.url));
async function readResource(root,file,max) {
  const resolved=path.resolve(root,file);
  if (!resolved.startsWith(root+path.sep)||await realpath(resolved)!==resolved) throw new Error('Resource path integrity failure.');
  const handle=await open(resolved,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const stat=await handle.stat();
    if (!stat.isFile()||stat.size>max) throw new Error('Resource size/type integrity failure.');
    const data=await handle.readFile();
    if (data.length>max||data.length!==stat.size) throw new Error('Resource changed during validation.');
    return data;
  } finally {await handle.close();}
}

/** Read/validate once before binding. Only these immutable buffers can be served until restart. */
export async function loadBuild(root=rootPath) {
  root=await realpath(root);
  const manifestBytes=await readResource(root,'omf-auditor-manifest.json',8192);
  const manifest=JSON.parse(manifestBytes);
  if (manifest.v!==1||!/^([a-f0-9]{64})$/.test(manifest.buildId)||!manifest.resources||
    Object.keys(manifest.resources).sort().join(',')!=='omf-auditor.html,workspace-worker.js') throw new Error('Invalid build manifest.');
  const resources=new Map();
  for(const [name,type] of [['omf-auditor.html','text/html; charset=utf-8'],['workspace-worker.js','text/javascript; charset=utf-8']]) {
    const entry=manifest.resources[name];
    if (entry.file!==`builds/${manifest.buildId}/${name}`||!Number.isSafeInteger(entry.bytes)||entry.bytes<=0||entry.bytes>4*1024*1024) throw new Error('Invalid resource manifest.');
    const data=await readResource(root,entry.file,4*1024*1024);
    if (data.length!==entry.bytes||digest(data)!==entry.sha256) throw new Error('Resource integrity failure.');
    const text=data.toString('utf8');
    if (name==='omf-auditor.html'&&(!text.includes(`<meta name="omf-build-id" content="${manifest.buildId}">`)||
      !text.includes(`<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">`))) throw new Error('Page build/CSP integrity failure.');
    if (name==='workspace-worker.js'&&!text.startsWith(`/* omf-build:${manifest.buildId} */`)) throw new Error('Worker build integrity failure.');
    resources.set('/'+name,{data,type});
  }
  resources.set('/',resources.get('/omf-auditor.html'));
  resources.set('/omf-auditor-manifest.json',{data:manifestBytes,type:'application/json; charset=utf-8'});
  return {buildId:manifest.buildId,resources};
}

/** No business routes, HTTP bodies, WS, uploads, persistence or non-loopback binding. Node builtins only. */
export async function startStaticServer({root=rootPath}={}) {
  const {buildId,resources}=await loadBuild(root);let authority;
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
    'Content-Security-Policy':`${CONTENT_SECURITY_POLICY}; frame-ancestors 'none'`,'Referrer-Policy':'no-referrer',
    'Cross-Origin-Resource-Policy':'same-origin','Connection':'close'};
  const reject=(res,status)=>{res.writeHead(status,{...headers,'Content-Length':'0'});res.end();};
  const server=createServer({maxHeaderSize:8192},(req,res)=>{
    const hosts=req.rawHeaders.filter((_,i)=>i%2===0&&req.rawHeaders[i].toLowerCase()==='host');
    if (hosts.length!==1||req.headers.host!==authority) return reject(res,421);
    if (!['GET','HEAD'].includes(req.method)) return reject(res,405);
    if (req.headers['content-length']!==undefined||req.headers['transfer-encoding']!==undefined||req.headers.expect!==undefined) return reject(res,400);
    if (!req.url.startsWith('/')||/[\\%?#\x00-\x20]/.test(req.url)||req.url.includes('..')||req.url.startsWith('//')) return reject(res,400);
    const asset=resources.get(req.url);if(!asset)return reject(res,404);
    res.writeHead(200,{...headers,'Content-Type':asset.type,'Content-Length':asset.data.length});
    res.end(req.method==='HEAD'?undefined:asset.data);
  });
  server.maxHeadersCount=32;server.headersTimeout=5000;server.requestTimeout=5000;server.setTimeout(5000);
  server.on('checkContinue',(_req,res)=>reject(res,400));server.on('checkExpectation',(_req,res)=>reject(res,417));
  server.on('upgrade',(_req,socket)=>socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  authority=`127.0.0.1:${server.address().port}`;
  return {url:`http://${authority}/`,buildId,close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}
if (process.argv[1]&&await realpath(path.resolve(process.argv[1]))===await realpath(fileURLToPath(import.meta.url))) {
  const server=await startStaticServer();
  console.log(`OMF read-only static build ${server.buildId}\n${server.url}omf-auditor.html\nExport reviews before stopping or upgrading; browser memory is not durable.`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void server.close();});
}
