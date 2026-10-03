import {render, screen} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import ShipPlot from './ShipPlot';
vi.mock('./ContactPlot', () => ({default: () => <div>Prepared contacts</div>}));
vi.mock('./DradisEffectControls', () => ({default: () => <button>Live GM effect</button>}));
it('allows an isolated review to reuse expanded DRADIS without exposing live GM effects', () => {
 render(<ShipPlot hostile={false} aboard viewerId="aegis" expanded showGmEffects={false} requireLocalAuthority />);
 expect(screen.getByText('Prepared contacts')).toBeVisible();
 expect(screen.queryByRole('button',{name:'Live GM effect'})).not.toBeInTheDocument();
});
