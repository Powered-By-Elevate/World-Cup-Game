import { useRef, useLayoutEffect } from 'react';

/** FLIP animation: when a keyed list reorders, registered rows slide from their
 *  old position to the new one instead of snapping. Returns a ref-callback you
 *  attach to each row (`ref={register(id)}`); pass an order signature as `key`
 *  so the effect runs whenever the order changes. Honors reduced-motion. */
export function useFlip(key: unknown) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const prev = useRef(new Map<string, DOMRect>());

  useLayoutEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const last = prev.current;
    const next = new Map<string, DOMRect>();
    nodes.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      next.set(id, r);
      const p = last.get(id);
      if (p && !reduce) {
        const dy = p.top - r.top;
        if (Math.abs(dy) > 1) {
          el.style.transition = 'none';
          el.style.transform = `translateY(${dy}px)`;
          requestAnimationFrame(() => {
            el.style.transition = 'transform .55s cubic-bezier(.2,.8,.2,1)';
            el.style.transform = '';
          });
        }
      }
    });
    prev.current = next;
  }, [key]);

  return (id: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(id, el); else nodes.current.delete(id);
  };
}
