import {createWorkspaceHost} from './workspace-host.js';

// Injected at build time, shared by page metadata and the immutable resource manifest.
const buildId=__OMF_BUILD_ID__;
const match=/^omf:([a-f0-9]{64}):([a-f0-9]{64})$/.exec(globalThis.name);
if (!match||match[1]!==buildId) throw new Error('Worker name/build mismatch.');
const host=createWorkspaceHost({buildId,workspaceId:match[2]});
globalThis.addEventListener('connect',event=>{
  for (const port of event.ports) host.attachPort(port);
});
