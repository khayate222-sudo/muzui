import { useEffect, useRef, type RefObject } from "react";
// Shared by ordinary modals and the persistent media panel when it fills the screen.
export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  close: () => void,
  active = true,
) {
  const closer = useRef(close);
  closer.current = close;
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null,
      element = ref.current!;
    const shell = document.querySelector<HTMLElement>(".app-shell");
    if (shell) shell.inert = true;
    for (const dialog of document.querySelectorAll<HTMLElement>(
      '[role="dialog"]',
    ))
      if (dialog !== element) {
        dialog.inert = true;
        dialog.setAttribute("aria-hidden", "true");
      }
    const items = () =>
      [
        ...element.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,a[href],[tabindex="0"]',
        ),
      ].filter((el) => el.getClientRects().length && !el.closest("[inert]"));
    const timer = setTimeout(() => items()[0]?.focus(), 0);
    const key = (e: KeyboardEvent) => {
      if ([...document.querySelectorAll('[role="dialog"]')].at(-1) !== element)
        return;
      if (e.key === "Escape") closer.current();
      if (e.key === "Tab") {
        const list = items(),
          first = list[0],
          last = list.at(-1);
        if (!first) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", key);
      const top = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')]
        .filter((d) => d !== element)
        .at(-1);
      if (top) {
        top.inert = false;
        top.removeAttribute("aria-hidden");
      }
      if (shell) shell.inert = top?.getAttribute("aria-modal") === "true";
      if (previous?.isConnected && !previous.closest("[inert]"))
        previous.focus();
    };
  }, [active, ref]);
}
