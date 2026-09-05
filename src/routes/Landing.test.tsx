import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Landing from './Landing';

describe('Landing', () => {
  it('names the project', () => {
    render(<Landing />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Den of Wolves: New Eden');
    expect(heading).toHaveTextContent('Unofficial Companion Console');
  });
});
