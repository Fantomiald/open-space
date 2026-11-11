import { useLayoutEffect, type RefObject } from 'react';

/**
 * A window clips what overflows it: an open menu goes in the top layer (`popover="manual"`), its right edge under its
 * button's (or its left edge under the button's left, when it would pass the page's left edge), below it or above when it would not fit (`--menu-top`,
 * `--menu-right`, see .cp-detail__menu).
 */
export function useMenuBelow(open: boolean, button: RefObject<HTMLElement | null>, menu: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const element = menu.current, anchor = button.current;
    if (!open || !element || !anchor) return;
    element.showPopover();
    const box = anchor.getBoundingClientRect(), height = element.offsetHeight, width = element.offsetWidth, gap = 4;
    const right = box.right - width >= gap ? box.right : Math.min(box.left + width, window.innerWidth - gap);
    const fitsBelow = box.bottom + gap + height <= window.innerHeight;
    element.style.setProperty('--menu-right', `${Math.round(window.innerWidth - right)}px`);
    element.style.setProperty('--menu-top', `${Math.round(fitsBelow ? box.bottom + gap : Math.max(gap, box.top - gap - height))}px`);
  }, [open, button, menu]);
}
