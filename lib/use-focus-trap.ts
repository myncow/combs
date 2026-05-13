"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(", ");

/**
 * Modal dialog accessibility helper. While `active`:
 *   - Captures the previously-focused element
 *   - Moves focus to the first focusable element inside `containerRef`
 *     (or the container itself if nothing focusable is found)
 *   - Traps Tab / Shift+Tab inside the container
 *   - Restores focus to the original element on close
 *
 * Use alongside an Escape key handler and a backdrop-click handler — those
 * concerns are intentionally separate.
 */
export function useFocusTrap<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  active: boolean,
) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    previousFocusRef.current =
      typeof document !== "undefined" && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    const first = focusables[0];
    if (first) {
      first.focus();
    } else {
      if (!container.hasAttribute("tabindex")) {
        container.setAttribute("tabindex", "-1");
      }
      container.focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const live = container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!live || live.length === 0) {
        event.preventDefault();
        container?.focus();
        return;
      }
      const elements = Array.from(live).filter((el) => !el.hasAttribute("data-focus-trap-skip"));
      if (elements.length === 0) {
        event.preventDefault();
        container?.focus();
        return;
      }
      const firstEl = elements[0];
      const lastEl = elements[elements.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (activeEl === firstEl || !container?.contains(activeEl)) {
          event.preventDefault();
          lastEl.focus();
        }
      } else {
        if (activeEl === lastEl) {
          event.preventDefault();
          firstEl.focus();
        }
      }
    }

    container.addEventListener("keydown", handleKeyDown);
    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      const previous = previousFocusRef.current;
      if (previous && typeof previous.focus === "function") {
        previous.focus();
      }
    };
  }, [active, containerRef]);
}
