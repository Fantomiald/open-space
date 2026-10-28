import { useLayoutEffect, type RefObject } from 'react';

/**
 * A window clips what overflows it: an open menu goes in the top layer (`popover="manual"`), its right edge under its
 * button's, below it or above when it would not fit (`--menu-top`, `--menu-right`, see .cp-detail__menu).
 */
export function useMenuBelow(open: boolean, button: RefObject<HTMLElement | null>, menu: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const element = menu.current, anchor = button.current;
    if (!open || !element || !anchor) return;
    element.showPopover();
    const box = anchor.getBoundingClientRect(), height = element.offsetHeight, gap = 4;
    const fitsBelow = box.bottom + gap + height <= window.innerHeight;
    element.style.setProperty('--menu-right', `${Math.round(window.innerWidth - box.right)}px`);
    element.style.setProperty('--menu-top', `${Math.round(fitsBelow ? box.bottom + gap : Math.max(gap, box.top - gap - height))}px`);
  }, [open, button, menu]);
}
