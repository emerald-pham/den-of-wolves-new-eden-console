import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RoleSelect from './RoleSelect';

describe('RoleSelect', () => {
  it('offers every table role on the role-select screen', () => {
    render(<RoleSelect />);

    expect(screen.getByRole('heading', { name: /choose your role/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /player/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /game master/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /observer/i })).toBeInTheDocument();
  });
});
