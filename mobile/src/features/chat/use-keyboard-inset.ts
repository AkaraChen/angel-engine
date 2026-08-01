import { useEffect, useState } from "react";

/**
 * Height, in CSS pixels, that the on-screen keyboard covers at the bottom of
 * the layout viewport.
 *
 * iOS Safari does not shrink the layout viewport when the keyboard opens — it
 * only moves the *visual* viewport — so a bottom-anchored composer ends up
 * underneath the keyboard with no CSS-only way to notice. `visualViewport` is
 * the only surface that reports the overlap. Where it is missing (older
 * browsers, jsdom) this returns 0 and the composer keeps its safe-area padding,
 * which is the pre-keyboard layout.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      // `offsetTop` is how far the visual viewport has been scrolled down
      // inside the layout viewport; without it a page scrolled up under the
      // keyboard would report an inset far larger than the keyboard.
      const overlap = window.innerHeight - viewport.height - viewport.offsetTop;
      setInset(overlap > 0 ? Math.round(overlap) : 0);
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
