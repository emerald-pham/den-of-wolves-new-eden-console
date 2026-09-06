import type { ReactNode } from 'react';

interface Props<Page extends string> {
  readonly label: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly telemetry: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly pages?: readonly { readonly id: Page; readonly label: string }[];
  readonly activePage?: Page;
  readonly onPageChange?: (page: Page) => void;
}

/** Shared role workspace chrome. Role modules own only their content and real actions. */
export default function RoleConsoleTemplate<Page extends string>({
  label, eyebrow, title, telemetry, children, className = '', pages, activePage, onPageChange,
}: Props<Page>) {
  return (
    <section className={`console-workspace cic-frame ${className}`} aria-label={label}>
      <header className="console-workspace__header">
        <div>
          <p className="console-workspace__eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <dl className="console-workspace__telemetry">{telemetry}</dl>
      </header>
      {pages && onPageChange && (
        <nav className="console-workspace__nav" aria-label={`${label} pages`}>
          {pages.map((page) => (
            <button key={page.id} type="button" aria-pressed={activePage === page.id}
              onClick={() => onPageChange(page.id)}>{page.label}</button>
          ))}
        </nav>
      )}
      {children}
    </section>
  );
}
