import { type ReactNode, useEffect, useRef, useState } from 'react';

/** Content that scrolls round when it is longer than its box (the second copy makes the loop seamless). */
export function Marquee({ className, live = false, children }: { className: string; live?: boolean; children: ReactNode }) {
  const box = useRef<HTMLSpanElement>(null);
  const first = useRef<HTMLSpanElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const measure = () => setScrolls((first.current?.offsetWidth ?? 0) > (box.current?.clientWidth ?? 0) + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box.current!);
    observer.observe(first.current!);
    return () => observer.disconnect();
  }, []);
  return (
    <span className={`cp-marquee ${className}`} ref={box} data-scroll={scrolls} aria-live={live ? 'polite' : undefined}>
      <span className="cp-marquee__track">
        <span ref={first}>{children}</span>
        {scrolls && <span aria-hidden="true">{children}</span>}
      </span>
    </span>
  );
}
