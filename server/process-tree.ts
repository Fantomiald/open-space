import { execFile } from 'node:child_process';

/** Unix process groups and Windows process trees need different termination APIs. */
export function signalTree(pid: number | undefined, signal: NodeJS.Signals) {
  if (pid === undefined) return;
  if (process.platform === 'win32') {
    execFile('taskkill.exe', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }, () => {});
  } else {
    try { process.kill(-pid, signal); } catch { /* already gone */ }
  }
}
