// Text from elsewhere (a webhook's data, a worker's reply) handed to an agent as data: between tags whose name carries a
// random word, so that the text cannot close them early, after a sentence that says it is not instructions.
import { randomBytes } from 'node:crypto';

/** `body` between <name-word> tags, after `intro(tag)`; `fence` is the random word (fixed in tests). */
export function fenced(name: string, intro: (tag: string) => string, body: string, fence = randomBytes(6).toString('hex')): string {
  const tag = `${name}-${fence}`;
  return `${intro(tag)}\n<${tag}>\n${body}\n</${tag}>`;
}
