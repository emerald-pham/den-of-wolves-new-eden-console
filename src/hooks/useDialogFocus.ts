import { useLayoutEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const MODAL_SELECTOR = '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]';

export interface UseDialogFocusOptions {
  readonly open: boolean;
  readonly dialogRef: RefObject<HTMLElement | null>;
  readonly restoreRef?: RefObject<HTMLElement | null>;
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  readonly onEscape?: () => void;
  /** Rebind and refocus when a modal is replaced without closing first. */
  readonly dialogKey?: string | number | boolean | null;
}

function isFocusable(element: HTMLElement | null | undefined): element is HTMLElement {
  return Boolean(element && element.isConnected && !element.hasAttribute('disabled'));
}

function restoreFocus(target: HTMLElement | null, fallback: HTMLElement | null | undefined): void {
  if (isFocusable(target)) {
    target.focus();
    return;
  }
  if (isFocusable(fallback)) {
    fallback.focus();
    return;
  }
  const pageControl = document.querySelector<HTMLElement>(
    'main button:not([disabled]), main a[href], main [tabindex]:not([tabindex="-1"])',
  );
  if (isFocusable(pageControl)) pageControl.focus();
}

/**
 * Keep one currently visible modal keyboard-contained and return focus to the
 * control that opened it. DOM order makes nested confirmations topmost, so an
 * underlying dialog never steals focus from the active confirmation.
 */
export function useDialogFocus({
  open,
  dialogRef,
  restoreRef,
  initialFocusRef,
  onEscape,
  dialogKey,
}: UseDialogFocusOptions): void {
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const onEscapeRef = useRef(onEscape);
  const restoreRefRef = useRef(restoreRef);
  const initialFocusRefRef = useRef(initialFocusRef);
  onEscapeRef.current = onEscape;
  restoreRefRef.current = restoreRef;
  initialFocusRefRef.current = initialFocusRef;

  useLayoutEffect(() => {
    if (!open) {
      if (wasOpen.current) {
        const restoreTarget = previouslyFocused.current;
        previouslyFocused.current = null;
        restoreFocus(restoreTarget, restoreRefRef.current?.current);
      }
      wasOpen.current = false;
      return undefined;
    }

    const wasAlreadyOpen = wasOpen.current;
    wasOpen.current = true;
    if (!wasAlreadyOpen) {
      const active = document.activeElement;
      previouslyFocused.current = restoreRefRef.current?.current ?? (
        active instanceof HTMLElement ? active : null
      );
    }

    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const getFocusable = (): HTMLElement[] => [
      ...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ];
    const isTopmost = (): boolean => {
      const modals = [...document.querySelectorAll<HTMLElement>(MODAL_SELECTOR)];
      return modals.at(-1) === dialog;
    };
    const focusFirst = (): void => {
      const requested = initialFocusRefRef.current?.current;
      if (requested && dialog.contains(requested) && isFocusable(requested)) {
        requested.focus();
        return;
      }
      const first = getFocusable()[0];
      if (first) {
        first.focus();
        return;
      }
      if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
      dialog.focus();
    };
    const onFocusIn = (event: FocusEvent): void => {
      if (!isTopmost() || dialog.contains(event.target as Node)) return;
      focusFirst();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isTopmost()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscapeRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        focusFirst();
        return;
      }
      const current = document.activeElement;
      const currentIndex = focusable.indexOf(current as HTMLElement);
      if (currentIndex < 0) {
        event.preventDefault();
        focusFirst();
        return;
      }
      const nextIndex = event.shiftKey
        ? (currentIndex === 0 ? focusable.length - 1 : currentIndex - 1)
        : (currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
      event.preventDefault();
      focusable[nextIndex]?.focus();
    };

    // A replaced dialog keeps the opener restoration target, but starts its
    // own focus cycle with the new first control.
    focusFirst();
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [dialogKey, dialogRef, open]);
}
