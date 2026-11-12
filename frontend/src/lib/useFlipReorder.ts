import { useLayoutEffect, useRef } from "react";

export function useFlipReorder<T extends { id: string }>(
  items: T[],
  layoutKey?: unknown
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const prevRects = useRef<Map<string, DOMRect>>(new Map());
  const prevLayoutKey = useRef(layoutKey);

  const registerItem = (id: string, el: HTMLElement | null) => {
    if (el) {
      itemRefs.current.set(id, el);
    } else {
      itemRefs.current.delete(id);
    }
  };

  useLayoutEffect(() => {
    // If layout mode (collapsed vs expanded) changed, do not animate across distinct layouts
    if (prevLayoutKey.current !== layoutKey) {
      prevLayoutKey.current = layoutKey;
      prevRects.current.clear();
      itemRefs.current.forEach((el, id) => {
        if (el) prevRects.current.set(id, el.getBoundingClientRect());
      });
      return;
    }

    const currentRects = new Map<string, DOMRect>();
    itemRefs.current.forEach((el, id) => {
      if (el) {
        currentRects.set(id, el.getBoundingClientRect());
      }
    });

    const animatingElements: Array<{
      el: HTMLElement;
      deltaX: number;
      deltaY: number;
      isMovingUp: boolean;
    }> = [];

    // Compare new rects with previous rects
    prevRects.current.forEach((oldRect, id) => {
      const el = itemRefs.current.get(id);
      const newRect = currentRects.get(id);

      if (el && newRect) {
        const deltaY = oldRect.top - newRect.top;
        const deltaX = oldRect.left - newRect.left;

        // If the element has moved
        if (Math.abs(deltaY) > 1 || Math.abs(deltaX) > 1) {
          const isMovingUp = deltaY > 0;
          animatingElements.push({
            el,
            deltaX,
            deltaY,
            isMovingUp,
          });

          // INVERT: Snap element back to its previous position immediately (no transition)
          el.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
          el.style.transition = "none";
          if (isMovingUp) {
            el.classList.add("connection-item-moving-up");
          }
        }
      }
    });

    // If an item is moving up and the container is scrolled, smoothly scroll container to top
    const hasItemMovingUp = animatingElements.some((a) => a.isMovingUp);
    if (hasItemMovingUp && containerRef.current && containerRef.current.scrollTop > 0) {
      containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }

    let frameId: number | null = null;
    let cleanupTimer: ReturnType<typeof setTimeout> | null = null;

    if (animatingElements.length > 0) {
      // PLAY: Animate to final position (transform: translateY(0)) in the next animation frame
      frameId = requestAnimationFrame(() => {
        // Force reflow
        animatingElements.forEach(({ el }) => void el.offsetHeight);

        animatingElements.forEach(({ el, isMovingUp }) => {
          el.style.transition = isMovingUp
            ? "transform 380ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 380ms ease, filter 380ms ease"
            : "transform 340ms cubic-bezier(0.16, 1, 0.3, 1)";
          el.style.transform = "";
        });

        cleanupTimer = setTimeout(() => {
          animatingElements.forEach(({ el }) => {
            el.style.transition = "";
            el.classList.remove("connection-item-moving-up");
          });
        }, 400);
      });
    }

    // Update previous rects
    prevRects.current = currentRects;

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      if (cleanupTimer !== null) clearTimeout(cleanupTimer);
    };
  }, [items, layoutKey]);

  return { containerRef, registerItem };
}
