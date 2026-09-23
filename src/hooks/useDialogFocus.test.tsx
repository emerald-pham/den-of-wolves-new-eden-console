import { StrictMode, useRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { useDialogFocus } from './useDialogFocus';

function HeadingFocusFixture() {
  const dialogRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useDialogFocus({ open: true, dialogRef, initialFocusRef: headingRef });
  return <main>
    <button type="button">Underlying action</button>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-label="Heading focus">
      <h2 ref={headingRef} tabIndex={-1}>Dialog purpose</h2>
      <button type="button">Continue</button>
    </section>
  </main>;
}

it('moves Tab from a programmatically focused purpose heading into the dialog controls', async () => {
  const user = userEvent.setup();
  render(<HeadingFocusFixture />);

  expect(screen.getByRole('heading', { name: 'Dialog purpose' })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus();
  await user.keyboard('{Shift>}{Tab}{/Shift}');
  expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus();
});

function RemovedDialog({ close }: { readonly close: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus({ open: true, dialogRef });
  return <section ref={dialogRef} role="dialog" aria-modal="true" aria-label="Temporary">
    <button type="button" onClick={close}>Close temporary</button>
  </section>;
}

function RemovedDialogFixture() {
  const [open, setOpen] = useState(false);
  return <main>
    <button type="button" onClick={() => setOpen(true)}>Open temporary</button>
    {open && <RemovedDialog close={() => setOpen(false)} />}
  </main>;
}

it('restores the opener when the dialog-owning component unmounts', async () => {
  const user = userEvent.setup();
  render(<RemovedDialogFixture />);
  const opener = screen.getByRole('button', { name: 'Open temporary' });
  await user.click(opener);
  await user.click(screen.getByRole('button', { name: 'Close temporary' }));
  expect(opener).toHaveFocus();
});

it('preserves the active dialog through StrictMode effect replay', async () => {
  const user = userEvent.setup();
  render(<StrictMode><RemovedDialogFixture /></StrictMode>);
  const opener = screen.getByRole('button', { name: 'Open temporary' });
  await user.click(opener);
  expect(screen.getByRole('button', { name: 'Close temporary' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Close temporary' }));
  expect(opener).toHaveFocus();
});

function FocusFixture() {
  const [outerOpen, setOuterOpen] = useState(false);
  const [innerOpen, setInnerOpen] = useState(false);
  const [replacement, setReplacement] = useState(false);
  const [removeOpener, setRemoveOpener] = useState(false);
  const outerRef = useRef<HTMLElement>(null);
  const outerTriggerRef = useRef<HTMLButtonElement>(null);
  const innerRef = useRef<HTMLElement>(null);
  const innerTriggerRef = useRef<HTMLButtonElement>(null);

  useDialogFocus({
    open: outerOpen,
    dialogRef: outerRef,
    restoreRef: outerTriggerRef,
    onEscape: () => setOuterOpen(false),
    dialogKey: 'outer',
  });
  useDialogFocus({
    open: innerOpen,
    dialogRef: innerRef,
    restoreRef: innerTriggerRef,
    onEscape: () => setInnerOpen(false),
    dialogKey: replacement ? 'replacement' : 'inner',
  });

  return (
    <main>
      {!removeOpener && (
        <button ref={outerTriggerRef} type="button" onClick={() => setOuterOpen(true)}>
          Open outer
        </button>
      )}
      <button type="button">Fallback</button>
      {outerOpen && (
        <section ref={outerRef} role="dialog" aria-modal="true" aria-label="Outer">
          <button ref={innerTriggerRef} type="button" onClick={() => setInnerOpen(true)}>
            Open inner
          </button>
          <button type="button" onClick={() => setRemoveOpener(true)}>
            Remove opener
          </button>
        </section>
      )}
      {innerOpen && (
        <section ref={innerRef} role="alertdialog" aria-modal="true" aria-label="Inner">
          {replacement ? (
            <button type="button">Replacement action</button>
          ) : (
            <>
              <button type="button">Inner action</button>
              <button type="button" onClick={() => setReplacement(true)}>
                Replace inner
              </button>
            </>
          )}
        </section>
      )}
    </main>
  );
}

it('keeps only the topmost dialog active across replacement and nested dismissal', async () => {
  const user = userEvent.setup();
  render(<FocusFixture />);

  const outerTrigger = screen.getByRole('button', { name: 'Open outer' });
  await user.click(outerTrigger);
  const innerTrigger = screen.getByRole('button', { name: 'Open inner' });
  await user.click(innerTrigger);
  const inner = screen.getByRole('alertdialog', { name: 'Inner' });
  expect(screen.getByRole('button', { name: 'Inner action' })).toHaveFocus();

  screen.getByRole('button', { name: 'Open inner' }).focus();
  expect(screen.getByRole('button', { name: 'Inner action' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Replace inner' }));
  expect(inner).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Replacement action' })).toHaveFocus();

  await user.keyboard('{Escape}');
  expect(screen.queryByRole('alertdialog', { name: 'Inner' })).not.toBeInTheDocument();
  expect(innerTrigger).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog', { name: 'Outer' })).not.toBeInTheDocument();
  expect(outerTrigger).toHaveFocus();
});

it('falls back to the first page control when the opener disappears', async () => {
  const user = userEvent.setup();
  render(<FocusFixture />);

  await user.click(screen.getByRole('button', { name: 'Open outer' }));
  await user.click(screen.getByRole('button', { name: 'Remove opener' }));
  await user.keyboard('{Escape}');

  expect(screen.queryByRole('dialog', { name: 'Outer' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Fallback' })).toHaveFocus();
});
