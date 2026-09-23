import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '@/hooks/useDialogFocus';

function hasExistingModal(): boolean {
  return [...document.querySelectorAll<HTMLElement>(
    '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]',
  )].some((element) => !element.classList.contains('focus-dialog'));
}

export interface FocusDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly dialogKey?: string | number | boolean | null;
  readonly restoreRef?: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly closeLabel?: string;
  readonly children: ReactNode;
}

/** A CIC announcement surface with a named purpose and a contained focus loop. */
export default function FocusDialog({
  open,
  title,
  description,
  dialogKey,
  restoreRef,
  onClose,
  closeLabel = 'Continue',
  children,
}: FocusDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const [blockedByExistingModal, setBlockedByExistingModal] = useState(hasExistingModal);
  const visible = open && !blockedByExistingModal;

  useEffect(() => {
    const update = () => setBlockedByExistingModal(hasExistingModal());
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    update();
    return () => observer.disconnect();
  }, []);

  useDialogFocus({
    open: visible,
    dialogRef,
    initialFocusRef: titleRef,
    onEscape: onClose,
    ...(restoreRef ? { restoreRef } : {}),
    ...(dialogKey === undefined ? {} : { dialogKey }),
  });

  if (!visible) return null;

  return createPortal((
    <div className="focus-dialog-backdrop" data-focus-dialog-backdrop="true">
      <section
        ref={dialogRef}
        className="focus-dialog cic-frame"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="focus-dialog__header">
          <p className="cic-overline">CIC // STATUS UPDATE</p>
          <h2 id={titleId} ref={titleRef} tabIndex={-1}>{title}</h2>
          <p id={descriptionId}>{description}</p>
        </header>
        <div className="focus-dialog__content">{children}</div>
        <button className="cic-action-button focus-dialog__close" type="button" onClick={onClose}>
          {closeLabel}
        </button>
      </section>
    </div>
  ), document.body);
}
