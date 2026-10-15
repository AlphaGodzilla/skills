const ENTRY='omfReadingEntry';
const BUTTONS=['more','scalarMore','contextMore','stepMore','stepContextMore','unknownMore','refsMore','incomingMore','issuesMore','filesMore','fileTextMore','fileWarningsMore','matrixMore','sourceColumn'];
const IDENTITY=[...BUTTONS,'card','lazy','path','key','line','file','field','total'];

export function elementPath(root,node) {
  const path=[];
  while(node&&node!==root) {
    const parent=node.parentElement;if(!parent)return null;
    path.unshift(Array.prototype.indexOf.call(parent.children,node));node=parent;
  }
  return node===root?path:null;
}
export function elementAt(root,path) {
  if(!Array.isArray(path)||path.length>512)return null;
  let node=root;
  for(const i of path){if(!Number.isSafeInteger(i)||i<0||!node?.children[i])return null;node=node.children[i];}
  return node;
}
const identity=el=>Object.fromEntries(IDENTITY.filter(k=>Object.hasOwn(el.dataset,k)).map(k=>[k,el.dataset[k]]));
export function describeReadingControl(root,el) {
  const kind=el.tagName==='DETAILS'&&(el.dataset.card||el.dataset.lazy)?'details':
    el.tagName==='BUTTON'&&BUTTONS.some(k=>Object.hasOwn(el.dataset,k))?'button':null;
  const path=elementPath(root,el);
  return kind&&path?{kind,path,data:identity(el)}:null;
}
export function findReadingControl(root,descriptor) {
  if(!descriptor||!['button','details'].includes(descriptor.kind))return null;
  const el=elementAt(root,descriptor.path);if(!el)return null;
  const actual=describeReadingControl(root,el);
  return actual?.kind===descriptor.kind&&JSON.stringify(actual.data)===JSON.stringify(descriptor.data)?el:null;
}
export function captureScroll(root,anchor) {
  if(!root)return null;
  const path=anchor?elementPath(root,anchor):null;
  return {top:root.scrollTop,left:root.scrollLeft,...(path?{anchor:{path,href:anchor.getAttribute('href'),
    offset:anchor.getBoundingClientRect().top-root.getBoundingClientRect().top}}:{})};
}
export function restoreScroll(root,saved) {
  if(!root||!saved)return;
  const behavior=root.style.scrollBehavior;root.style.scrollBehavior='auto';
  root.scrollTop=saved.top;root.scrollLeft=saved.left;
  const anchor=saved.anchor&&elementAt(root,saved.anchor.path);
  if(anchor&&anchor.getAttribute('href')===saved.anchor.href)
    root.scrollTop+=anchor.getBoundingClientRect().top-root.getBoundingClientRect().top-saved.anchor.offset;
  root.style.scrollBehavior=behavior;
}

/** Per-document reading recipes only. Browser history stores an opaque entry ID, not models or notes. */
export function createReadingHistory(w,capture) {
  const snapshots=new Map();
  const valid=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(id);
  const fresh=()=>crypto.randomUUID();
  let currentId=valid(w.history.state?.[ENTRY])?w.history.state[ENTRY]:fresh(),currentHash=w.location.hash;
  let branch=[currentId],position=0;
  const tag=()=>w.history.replaceState({[ENTRY]:currentId},'');
  tag();
  if('scrollRestoration' in w.history)w.history.scrollRestoration='manual';
  function remember(anchor) {
    const reading=capture(anchor);
    if(reading)snapshots.set(currentId,{hash:currentHash,reading:structuredClone(reading)});
  }
  function cutForward() {for(const id of branch.splice(position+1))snapshots.delete(id);}
  function push(hash,anchor) {
    remember(anchor);
    if(w.location.protocol==='file:'&&hash===currentHash)return;
    cutForward();currentId=fresh();currentHash=hash;
    if(w.location.protocol==='file:'){w.location.hash=hash;tag();}
    else w.history.pushState({[ENTRY]:currentId},'',hash);
    branch.push(currentId);position=branch.length-1;
  }
  function replace(hash) {
    if(w.location.protocol==='file:'){w.location.replace(hash);tag();}
    else w.history.replaceState({[ENTRY]:currentId},'',hash);
    currentHash=w.location.hash;
  }
  function traverse() {
    const hash=w.location.hash,id=w.history.state?.[ENTRY];
    if(id===currentId&&hash===currentHash)return {changed:false,reading:null};
    remember();currentId=valid(id)&&id!==currentId?id:fresh();currentHash=hash;
    const known=branch.indexOf(currentId);
    if(known>=0)position=known;else{cutForward();branch.push(currentId);position=branch.length-1;}
    tag();const saved=snapshots.get(currentId);
    return {changed:true,reading:saved?.hash===hash?structuredClone(saved.reading):null};
  }
  function clear(){snapshots.clear();branch=[currentId];position=0;}
  return {push,replace,traverse,clear};
}
