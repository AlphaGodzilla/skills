/** Immutable v2 DTO cursor. Only the current serialized record and one output block are retained; no whole-JSON size gate. */
import {textBlockEnd} from './text-blocks.js';

export function createExportStream(snapshot) {
  function* tokens() {
    yield '{';let first=true;
    for(const [key,value] of Object.entries(snapshot)) {
      if(!first)yield ',';first=false;yield JSON.stringify(key)+':';
      if(Array.isArray(value)) {
        yield '[';let firstItem=true;
        for(const item of value){if(!firstItem)yield ',';firstItem=false;yield JSON.stringify(item);}yield ']';
      }else yield JSON.stringify(value);
    }
    yield '}';
  }
  const iterator=tokens();let buffer='',position=0,done=false,last=null;
  return {read(offset,limit) {
    if(last&&offset===last.offset&&limit===last.limit)return structuredClone(last.result);
    if(offset!==position)throw Object.assign(new Error('Export cursor position has expired.'),{code:'EXPORT_POSITION'});
    while(buffer.length<=limit&&!done){const next=iterator.next();done=next.done;if(!done)buffer+=next.value;}
    const text=buffer.slice(0,textBlockEnd(buffer,0,limit));buffer=buffer.slice(text.length);position+=text.length;
    const result={text,next:done&&!buffer.length?null:position,total:done&&!buffer.length?position:null};
    last={offset,limit,result};return structuredClone(result);
  }};
}
