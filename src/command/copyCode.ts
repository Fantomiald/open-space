/** Copies the code block whose copy button was clicked (see mdToHtml), and shows a tick for a moment. */
export function copyCodeOnClick(target: EventTarget | null) {
  const button = target instanceof Element ? target.closest<HTMLElement>('[data-copy]') : null;
  const code = button?.closest('.cp-code')?.querySelector('pre');
  if (!button || !code) return;
  void navigator.clipboard.writeText((code.textContent ?? '').replace(/\n$/, '')).then(() => {
    button.dataset.copied = 'true';
    window.setTimeout(() => { delete button.dataset.copied; }, 1500);
  }, () => { /* refused: nothing copied, the button stays as it is */ });
}
