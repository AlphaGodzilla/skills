import {BY_SECTION,LIMITS} from './schema.js';

const KEY=/^def_[a-f0-9]{64}$/;
const TOKEN=/^[A-Za-z0-9_-]{16,128}$/;
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;

/**
 * @typedef {Object} Route
 * @property {1} v
 * @property {string} workspaceId Random URL-safe token (16..128 characters).
 * @property {string} credential Same token constraints; kept exclusively in the fragment.
 * @property {number} datasetVersion Nonnegative safe integer, not a message/review revision.
 * @property {'models'|'issues'|'files'|'matrix'} page
 * @property {string} [key] Stable def_ SHA-256 key; also the explicit review owner on non-definition pages.
 * @property {'audit'|'fields'|'refs'|'source'} [view] Requires a definition key.
 * @property {Array<string|number>} [path] Definition-relative typed field path; requires key.
 * @property {string} [sourceKey] Independent source owner; requires key and path.
 */

/** Validate an imported relative path, never an OS path or a fetch target. */
export function validateFilePath(path) {
  if (typeof path!=='string'||!path||path.length>4096||/[\\\x00-\x1f\x7f]/.test(path)||
      path.startsWith('/')||/^[a-z]:/i.test(path)||path.split('/').some(part=>!part||part==='.'||part==='..')) {
    fail('INVALID_PATH','Expected a bounded relative file path.');
  }
  return path;
}
function validPath(path) {
  return Array.isArray(path)&&path.length<=LIMITS.depth&&Array.from(path).every(part=>
    typeof part==='string'?part.length<=1024:
      Number.isSafeInteger(part)&&part>=0&&!Object.is(part,-0));
}
/** Paths are definition-relative JSON arrays; string keys and numeric indices differ. */
export function getPathValue(root,path) {
  if (!validPath(path)) fail('INVALID_PATH','Invalid typed field path.');
  let value=root;
  for (const part of path) {
    if (value===null||typeof value!=='object'||!Object.hasOwn(value,part)||
        (Array.isArray(value)?typeof part!=='number'||part>=value.length:typeof part!=='string')) {
      fail('INVALID_PATH','Field path does not name an own value in this definition.');
    }
    value=value[part];
  }
  return value;
}
/** SHA-256 of [relative file path, original SHA-256, section, absolute definition path]. */
export async function definitionKey(record) {
  validateFilePath(record.file.name);
  if (!/^[a-f0-9]{64}$/.test(record.file.hash)||!BY_SECTION.has(record.section)||
      !validPath(record.path)||record.path.length!==2||record.path[0]!==record.section||typeof record.path[1]!=='number') {
    fail('INVALID_DEFINITION','Definition identity requires an original file fingerprint and section path.');
  }
  const source=JSON.stringify([record.file.name,record.file.hash,record.section,record.path]);
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
  return 'def_'+[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
/** Assign keys in place without changing uid, references, issue records or index Maps. */
export async function assignDefinitionKeys(index) {
  const entries=[];
  for (const record of index.records) entries.push([await definitionKey(record),record]);
  if (new Set(entries.map(([key])=>key)).size!==entries.length) fail('DUPLICATE_KEY','Duplicate definition identity.');
  for (const [key,record] of entries) record.key=key;
  index.byKey=new Map(entries);
  return index;
}
function validateRoute(route) {
  const allowed=['v','workspaceId','credential','datasetVersion','page','key','view','path','sourceKey'];
  if (!plain(route)||Object.keys(route).some(key=>!allowed.includes(key))||route.v!==1||
      typeof route.workspaceId!=='string'||!TOKEN.test(route.workspaceId)||typeof route.credential!=='string'||!TOKEN.test(route.credential)||
      !Number.isSafeInteger(route.datasetVersion)||route.datasetVersion<0||
      !['models','issues','files','matrix'].includes(route.page)) fail('INVALID_ROUTE','Invalid route envelope.');
  const result={v:1,workspaceId:route.workspaceId,credential:route.credential,datasetVersion:route.datasetVersion,page:route.page};
  if (Object.hasOwn(route,'key')) {
    if (typeof route.key!=='string'||!KEY.test(route.key)) fail('INVALID_ROUTE','Invalid definition target.');
    result.key=route.key;
  }
  if (Object.hasOwn(route,'view')) {
    if (!result.key||!['audit','fields','refs','source'].includes(route.view)) fail('INVALID_ROUTE','Invalid definition view.');
    result.view=route.view;
  }
  if (Object.hasOwn(route,'path')) {
    if (!result.key||!validPath(route.path)) fail('INVALID_ROUTE','Invalid field path.');
    result.path=[...route.path];
  }
  if (Object.hasOwn(route,'sourceKey')) {
    if (!result.key||!Object.hasOwn(result,'path')||typeof route.sourceKey!=='string'||!KEY.test(route.sourceKey)) fail('INVALID_ROUTE','Invalid source owner.');
    result.sourceKey=route.sourceKey;
  }
  return result;
}
/** Canonical, versioned fragment. Credentials and navigation never enter HTTP requests. */
export function encodeRoute(route) {
  const hash='#audit='+encodeURIComponent(JSON.stringify(validateRoute(route)));
  if (hash.length>32768) fail('INVALID_ROUTE','Route exceeds size limit.');
  return hash;
}

/** Reject noncanonical JSON too: duplicate keys cannot silently choose a protocol version. */
export function decodeRoute(hash) {
  if (typeof hash!=='string'||hash.length>32768||!hash.startsWith('#audit=')) fail('INVALID_ROUTE','Unknown navigation fragment.');
  let parsed;
  try {parsed=JSON.parse(decodeURIComponent(hash.slice(7)));}
  catch {fail('INVALID_ROUTE','Malformed navigation fragment.');}
  const route=validateRoute(parsed);
  if (encodeRoute(route)!==hash) fail('INVALID_ROUTE','Noncanonical navigation fragment.');
  return route;
}
function legacyRoute(hash,index,context) {
  let target;
  try {target=JSON.parse(decodeURIComponent(hash.slice(7)));}
  catch {fail('INVALID_ROUTE','Malformed legacy model fragment.');}
  if (!Array.isArray(target)||target.length!==3||target.some(v=>typeof v!=='string'||v.length>4096)||!BY_SECTION.has(target[0])) {
    fail('INVALID_ROUTE','Invalid legacy target.');
  }
  try {validateFilePath(target[2]);}
  catch {fail('INVALID_ROUTE','Invalid legacy file path.');}
  const matches=index.records.filter(r=>r.section===target[0]&&r.id===target[1]&&r.file.name===target[2]);
  if (matches.length>1) fail('AMBIGUOUS_LEGACY','Legacy model target is not unique.');
  if (!matches.length) fail('MISSING_DEFINITION','Legacy model target has not been imported.');
  return validateRoute({v:1,...context,page:'models',key:matches[0].key,view:'audit'});
}
/** Owner-side resolution only; never guesses by business ID across datasets or definitions. */
export function resolveRoute(hash,index,context) {
  if (typeof hash!=='string'||hash.length>32768) fail('INVALID_ROUTE','Invalid navigation fragment.');
  const route=hash.startsWith('#model=')?legacyRoute(hash,index,context):decodeRoute(hash);
  if (route.workspaceId!==context.workspaceId||route.credential!==context.credential) fail('WRONG_WORKSPACE','Workspace or credential mismatch.');
  if (route.datasetVersion!==context.datasetVersion) fail('STALE_DATASET','Navigation targets an old dataset.');
  if (!route.key) return {route};
  const record=index.byKey.get(route.key);
  if (!record) fail('MISSING_DEFINITION','Definition no longer exists.');
  const result={route,record};
  const sourceRecord=route.sourceKey?index.byKey.get(route.sourceKey):record;
  if (!sourceRecord) fail('MISSING_DEFINITION','Source owner no longer exists.');
  result.sourceRecord=sourceRecord;
  if (route.path) result.value=getPathValue(sourceRecord.data,route.path);
  return result;
}
