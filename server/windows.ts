import { execFile } from 'node:child_process';
import path from 'node:path';

/** Static PowerShell source only. User data travels through environment variables, never through source. */
export function windowsScript(script: string, values: Record<string, string> = {}, timeout = 10_000): Promise<string> {
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const source = `$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = [Text.UTF8Encoding]::new(); ${script}`;
  return new Promise((resolve, reject) => {
    execFile(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(source, 'utf16le').toString('base64')],
      { windowsHide: true, timeout, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, ...values } },
      (error, stdout, stderr) => error ? reject(new Error(stderr.trim() || error.message)) : resolve(stdout.trim()));
  });
}

/** Sends a file to the Recycle Bin. On a drive without one (network share, some USB keys), Windows deletes it, as the Mac does without a Trash. */
export async function recycleFile(file: string): Promise<void> {
  await windowsScript("Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:OPEN_SPACE_RECYCLE_FILE, 'OnlyErrorDialogs', 'SendToRecycleBin', 'ThrowException')", { OPEN_SPACE_RECYCLE_FILE: file });
}
