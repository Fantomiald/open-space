// Files the page sends the server: POSTed with the page's cookie (server/http.ts takes them from Open Space's own page only).

/** Sends `body` to `path` (/upload, /project-icon); the id the server keeps it under. */
export async function upload(path: string, body: Blob): Promise<string> {
  const response = await fetch(path, { method: 'POST', body, credentials: 'same-origin' });
  if (!response.ok) throw new Error(String(response.status));
  return ((await response.json()) as { id: string }).id;
}
