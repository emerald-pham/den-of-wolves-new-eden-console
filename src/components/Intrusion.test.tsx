import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Intrusion from './Intrusion';

describe('Intrusion', () => {
  it('shows the message it was handed', () => {
    render(<Intrusion message="A COLD GRAVE AWAITS YOU" />);
    expect(screen.getByText('A COLD GRAVE AWAITS YOU')).toBeInTheDocument();
  });

  it('is atmosphere, not a dialog: hidden from assistive technology and unable to take focus', () => {
    const { container } = render(<Intrusion message="BE AFRAID" />);
    const overlay = container.firstElementChild;

    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container.querySelectorAll('a, button, input, select, [tabindex]')).toHaveLength(0);
  });

  it('hands the message to the colour-split layers without repeating it in the DOM', () => {
    // The red and cyan ghosts are drawn from a data attribute by CSS. If they
    // ever become real elements the message is in the document three times and
    // every getByText against it breaks.
    render(<Intrusion message="EARTH IS NOT FOR YOU" />);

    expect(screen.getByText('EARTH IS NOT FOR YOU')).toHaveAttribute(
      'data-text',
      'EARTH IS NOT FOR YOU',
    );
  });
});
