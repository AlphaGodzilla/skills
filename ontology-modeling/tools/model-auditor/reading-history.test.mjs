import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createReadingHistory,captureScroll,restoreScroll,describeReadingControl,findReadingControl} from './reading-history.js';
const popped=(w,hash)=>new Promise(resolve=>{const listener=()=>{if(hash!==undefined&&w.location.hash!==hash)return;w.removeEventListener('popstate',listener);resolve();};w.addEventListener('popstate',listener);});

test('reading history: each entry restores its own position, duplicate history events do nothing, history.state has no model data',async()=>{
  const dom=new JSDOM('<main/>',{url:'http://127.0.0.1/'}),w=dom.window;let position=10,captures=0;
  const h=createReadingHistory(w,()=>{captures++;return {position};});
  try{
    h.push('#one');position=20;h.push('#two');position=30;
    const back=popped(w);w.history.back();await back;const restored=h.traverse();
    assert.equal(restored.reading.position,20);position=20;
    const count=captures;assert.equal(h.traverse().changed,false);assert.equal(captures,count);
    const forward=popped(w);w.history.forward();await forward;assert.equal(h.traverse().reading.position,30);
    assert.deepEqual(Object.keys(w.history.state),['omfReadingEntry']);assert.equal(typeof w.history.state.omfReadingEntry,'string');
  }finally{w.close();}
});
test('reading history: identical route hashes do not merge distinct entries',async()=>{
  const dom=new JSDOM('',{url:'http://127.0.0.1/'}),w=dom.window;let position=11;
  const h=createReadingHistory(w,()=>({position}));
  try{h.push('#same');position=22;h.push('#same');position=33;
    const wait=popped(w);w.history.back();await wait;assert.equal(h.traverse().reading.position,22);
  }finally{w.close();}
});
test('reading history: fragment history works in standalone file mode and invalidation drops old recipes',async()=>{
  const dom=new JSDOM('',{url:'file:///tmp/omf-history-test.html'}),w=dom.window;
  const h=createReadingHistory(w,()=>({position:7}));
  try{h.replace('#initial');h.push('#next');h.clear();
    const wait=popped(w,'#initial');w.history.back();await wait;assert.equal(h.traverse().reading,null);
    assert.equal(w.location.hash,'#initial');
  }finally{w.close();}
});
test('reading controls: duplicate cards are distinguished by DOM position, mutation controls cannot be replayed',()=>{
  const dom=new JSDOM('<main><details data-card="same"></details><details data-card="same"></details><button data-more="24" data-key="key" data-path="[]"></button><button data-action="export">export</button></main>');
  const root=dom.window.document.querySelector('main'),second=root.children[1];
  try{const descriptor=describeReadingControl(root,second);assert.equal(findReadingControl(root,descriptor),second);
    assert.equal(describeReadingControl(root,root.lastElementChild),null);
    assert.equal(findReadingControl(root,{...descriptor,path:[3]}),null);
    assert.equal(findReadingControl(root,{...descriptor,path:[-1]}),null);
    const button=describeReadingControl(root,root.children[2]);assert.equal(findReadingControl(root,button),root.children[2]);
  }finally{dom.window.close();}
});
test('reading anchor: restore compensates for layout changes instead of blindly reusing a pixel offset',()=>{
  const dom=new JSDOM('<main><a href="#target">target</a></main>'),root=dom.window.document.querySelector('main'),link=root.firstElementChild;
  let contentY=600;root.scrollTop=500;root.scrollLeft=13;
  root.getBoundingClientRect=()=>({top:100});link.getBoundingClientRect=()=>({top:100+contentY-root.scrollTop});
  try{const saved=captureScroll(root,link);contentY=850;root.scrollTop=0;root.scrollLeft=0;
    restoreScroll(root,saved);assert.equal(root.scrollTop,750);assert.equal(root.scrollLeft,13);
    assert.equal(link.getBoundingClientRect().top-root.getBoundingClientRect().top,saved.anchor.offset);
  }finally{dom.window.close();}
});
