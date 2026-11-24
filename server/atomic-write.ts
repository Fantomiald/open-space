// A file written whole or not at all: to a temporary name first, then renamed over the file, so a crash or a full disk
// never leaves half a file. The temporary name is unique, so two writes that overlap each publish a complete file.
import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';

export async function writeFileAtomic(file: string, text: string, mode = 0o600): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, { mode });
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}
