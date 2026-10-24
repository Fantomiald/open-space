import { execFile } from 'node:child_process';
import path from 'node:path';

export function parseKnownFolders(raw: string): string[] {
  try {
    const values: unknown = JSON.parse(raw);
    return Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0')) : [];
  } catch { return []; }
}

/** Windows known folders may live under OneDrive or on another drive. No folder contents are read. */
export async function windowsKnownFolders(home: string, supplied?: string): Promise<string[]> {
  const given = supplied ? parseKnownFolders(supplied) : [];
  if (given.length) return given;
  const output = await new Promise<string>((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); ConvertTo-Json -Compress -InputObject @([Environment]::GetFolderPath('DesktopDirectory'), [Environment]::GetFolderPath('MyDocuments'))"],
    { timeout: 5000, windowsHide: true }, (_error, stdout) => resolve(stdout));
  });
  const found = parseKnownFolders(output);
  return found.length ? found : [path.join(home, 'Desktop'), path.join(home, 'Documents')];
}
