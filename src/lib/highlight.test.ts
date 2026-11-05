import assert from 'node:assert/strict';
import { it } from 'node:test';
import { highlighted, highlightedLines } from './highlight.ts';

it('wraps the tokens of a known language in the editor classes', async () => {
  assert.equal(await highlighted('const total = 1;', 'ts'), '<span class="tok-keyword">const</span> <span class="tok-variableName tok-definition">total</span> <span class="tok-operator">=</span> <span class="tok-number">1</span><span class="tok-punctuation">;</span>');
});

it('escapes the code, inside and outside the tokens', async () => {
  const html = await highlighted('const tag = "<b>" & 1 < 2', 'js');
  assert.ok(html?.includes('<span class="tok-string">&quot;&lt;b&gt;&quot;</span>'), html ?? 'null');
  assert.ok(!html?.includes('<b>'), html ?? 'null');
  assert.ok(html?.includes('&amp;'), html ?? 'null');
});

it('keeps the line breaks of the block', async () => {
  const html = await highlighted('a = 1\nb = 2', 'python');
  assert.equal(html?.split('\n').length, 2);
});

it('colours the lines of a file by its name, one HTML line per line', async () => {
  const lines = await highlightedLines('const a = 1;\nlet b = "<x>";', 'src/cart.ts');
  assert.equal(lines?.length, 2);
  assert.match(lines?.[0] ?? '', /^<span class="tok-keyword">const<\/span>/);
  assert.match(lines?.[1] ?? '', /&lt;x&gt;/);
  assert.equal(await highlightedLines('whatever', 'notes.unknownext'), null);
});

it('leaves a block in a language it does not know as it is', async () => {
  assert.equal(await highlighted('whatever', 'not-a-language'), null);
});
