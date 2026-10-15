import {createWorkspaceHost} from './workspace-host.js';
import {createWorkspaceClient} from './workspace-client.js';

/** Explicit file:// adapter, not a SharedWorker failure fallback. Same core and bounded wire DTOs. */
export async function connectLocalWorkspace(address) {
  const host=createWorkspaceHost({buildId:address.buildId,workspaceId:address.workspaceId});
  const client=createWorkspaceClient({address,mode:'CREATE'}),channel=new MessageChannel();
  host.attachPort(channel.port1);await client.connect(channel.port2);
  return {client,host,close(){client.pagehide();host.close();}};
}
