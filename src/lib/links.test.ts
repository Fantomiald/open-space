import assert from 'node:assert/strict';
import { it } from 'node:test';
import { withLinks } from './links.ts';

const PR = 'https://github.com/Fantomiald/open-space/pull/52';

it('leaves a copy without links as it is', () => {
  assert.equal(withLinks('Just words,\nover two lines.', []), 'Just words,\nover two lines.');
});

it('writes a link out as Markdown, keeping the text around it and its line breaks', () => {
  const plain = 'Opened:\nopen-space #52, ready.';
  assert.equal(withLinks(plain, [{ text: 'open-space #52', href: PR }]), `Opened:\n[open-space #52](${PR}), ready.`);
});

it('gives each of two links with the same text its own address', () => {
  const links = [{ text: 'here', href: 'https://example.org/a' }, { text: 'here', href: 'https://example.org/b' }];
  assert.equal(withLinks('The PR is here and the docs are here.', links), 'The PR is [here](https://example.org/a) and the docs are [here](https://example.org/b).');
});

it('finds the link after the same words written before it in the selection', () => {
  const plain = 'PR #52 is up: PR #52';
  assert.equal(withLinks(plain, [{ text: 'PR #52', href: PR, before: 'PR #52 is up: ' }]), `PR #52 is up: [PR #52](${PR})`);
});

it('leaves a link whose text is its address, with or without the scheme', () => {
  const links = [
    { text: PR, href: PR },
    { text: 'example.org/docs/', href: 'https://example.org/docs/' },
    { text: 'www.example.org', href: 'http://www.example.org' },
    { text: 'ada@example.org', href: 'mailto:ada@example.org' },
  ];
  const plain = `${PR} example.org/docs/ www.example.org ada@example.org`;
  assert.equal(withLinks(plain, links), plain);
});

it('keeps the address of a link the selection cut, but not of a bare address cut in two', () => {
  assert.equal(withLinks('en-space #52 and more', [{ text: 'en-space #52', href: PR, label: 'open-space #52' }]), `[en-space #52](${PR}) and more`);
  assert.equal(withLinks('hub.com/Fantomiald and more', [{ text: 'hub.com/Fantomiald', href: 'https://github.com/Fantomiald', label: 'https://github.com/Fantomiald' }]), 'hub.com/Fantomiald and more');
});

it('writes out only http(s) and mailto addresses', () => {
  const links = [
    { text: 'top', href: '#top' },
    { text: 'run', href: 'javascript:alert(1)' },
    { text: 'file', href: '/attachments/a.txt' },
    { text: 'mail', href: 'mailto:ada@example.org' },
  ];
  assert.equal(withLinks('top, run, file, mail', links), 'top, run, file, [mail](mailto:ada@example.org)');
});

it('skips a link whose text is not in the copy, and goes on with the next one', () => {
  const links = [{ text: 'gone', href: 'https://example.org/gone' }, { text: 'docs', href: 'https://example.org/docs' }];
  assert.equal(withLinks('Read the docs', links), 'Read the [docs](https://example.org/docs)');
});
