import {MessageChannel} from 'node:worker_threads';
import {webcrypto} from 'node:crypto';

/** Real Node channels with receiver-realm DTOs for JSDOM's explicit local adapter. Not browser emulation. */
export function installDOMPrimitives(w) {
  Object.assign(w,{TextDecoder,TextEncoder,File,Blob});
  Object.defineProperty(w.crypto,'subtle',{value:webcrypto.subtle});
  function clone(value) {
    if(value===null||typeof value!=='object')return value;
    if(Object.prototype.toString.call(value)==='[object ArrayBuffer]')return w.Uint8Array.from(new Uint8Array(value)).buffer;
    if(ArrayBuffer.isView(value))return w.Uint8Array.from(new Uint8Array(value.buffer,value.byteOffset,value.byteLength));
    if(Array.isArray(value))return w.Array.from(value,clone);
    const result=new w.Object();for(const [key,item] of Object.entries(value))Object.defineProperty(result,key,{value:clone(item),enumerable:true,writable:true,configurable:true});return result;
  }
  w.structuredClone=clone;
  function port(native) {
    const target=new w.EventTarget();
    native.on('message',data=>target.dispatchEvent(new w.MessageEvent('message',{data:clone(data)})));
    native.on('messageerror',()=>target.dispatchEvent(new w.Event('messageerror')));
    native.on('close',()=>target.dispatchEvent(new w.Event('close')));
    target.postMessage=value=>native.postMessage(value);target.start=()=>native.start();target.close=()=>native.close();return target;
  }
  w.MessageChannel=class {constructor(){const channel=new MessageChannel();this.port1=port(channel.port1);this.port2=port(channel.port2);}};
}
