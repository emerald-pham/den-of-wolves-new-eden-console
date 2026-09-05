/**
 * Something hostile has taken the screen.
 *
 * Reusable on any route: it is fullscreen and fixed, but it is decoration and
 * nothing more -- `pointer-events: none`, `aria-hidden`, no dialog semantics,
 * no focus trap. Whatever the player was doing underneath it keeps working,
 * and a screen reader never hears about it.
 *
 * The red and cyan colour-split ghosts behind the message are painted by CSS
 * from `data-text`, so the message exists exactly once in the DOM.
 */
export default function Intrusion({ message }: { message: string }) {
  return (
    <div className="intrusion" aria-hidden="true">
      <div className="intrusion__signal">
        <span className="cic-overline">UNAUTHORIZED TRANSMISSION / SOURCE UNKNOWN</span>
        <p className="intrusion__message" data-text={message}>
          {message}
        </p>
        <span className="cic-overline">SIGNAL INTEGRITY COMPROMISED</span>
      </div>
    </div>
  );
}
