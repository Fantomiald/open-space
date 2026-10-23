import { windowsScript } from './windows.ts';

/** SendToRecycleBin must succeed: never fall back to permanently deleting the user's file. */
export async function recycleFile(file: string): Promise<void> {
  await windowsScript("Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:OPEN_SPACE_RECYCLE_FILE, 'OnlyErrorDialogs', 'SendToRecycleBin', 'ThrowException')", { OPEN_SPACE_RECYCLE_FILE: file });
}
