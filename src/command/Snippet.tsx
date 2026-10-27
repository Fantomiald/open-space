/** A snippet of found text with the words found in it marked. */
export function Snippet({ text, start, length }: { text: string; start: number; length: number }) {
  return <>{text.slice(0, start)}<mark>{text.slice(start, start + length)}</mark>{text.slice(start + length)}</>;
}
