"use client";

import { useEffect, useRef } from "react";

/**
 * Trap keyboard focus inside a dialog-like element while it's open.
 *
 * Wave 5 H.2. Pairs with `role="dialog"` + `aria-modal="true"` on the
 * container. When `active` flips true:
 *   1. Remembers the element that had focus (the trigger button).
 *   2. Focuses the first focusable element inside `containerRef`.
 *   3. Intercepts Tab / Shift+Tab so focus cycles within the container
 *      instead of escaping to the page behind the dialog.
 *
 * When `active` flips false (or the component unmounts), focus returns
 * to the original trigger. Without this, screen-reader and keyboard
 * users tabbed straight into the page behind the modal — a long-running
 * a11y gap on every modal/drawer in the app.
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null);
 *   useFocusTrap(ref, open);
 *   return <div ref={ref} role="dialog" aria-modal="true">...</div>;
 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useFocusTrap<T extends HTMLElement>(
  containerRef: React.RefObject<T | null>,
  active: boolean,
): void {
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    // Remember the trigger to restore focus on close.
    triggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // Focus the first focusable element inside the container. Use a
    // requestAnimationFrame so the container's enter animation has
    // started and the focusable elements are in the DOM.
    requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const focusables = container.querySelectorAll<HTMLElement>(
        FOCUSABLE_SELECTOR,
      );
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        // No focusable children — focus the container itself so
        // screen-reader users land somewhere sensible. Container
        // needs tabindex=-1 for this to work (we set it inline).
        container.tabIndex = -1;
        container.focus();
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (el) =>
          // skip elements that are visually hidden (display: none, etc)
          el.offsetParent !== null || el === document.activeElement,
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Restore focus to the original trigger. Skip if it's gone from
      // the DOM (rare — usually means the trigger was inside another
      // component that unmounted with the modal).
      const trigger = triggerRef.current;
      if (trigger && document.contains(trigger)) {
        trigger.focus();
      }
      triggerRef.current = null;
    };
  }, [active, containerRef]);
}
