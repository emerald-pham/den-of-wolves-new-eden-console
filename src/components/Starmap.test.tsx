import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import Starmap from './Starmap';

it('renders a selectable 3D projection of the printed chart without inventing spatial truth', async () => {
  const user = userEvent.setup();
  const onChartChange = vi.fn();
  const onSystemSelect = vi.fn();

  render(
    <Starmap
      chart="A"
      onChartChange={onChartChange}
      selectedCoordinate="0000"
      onSystemSelect={onSystemSelect}
      fleetMarkers={[{
        id: 'aegis', label: 'AEGIS', coordinate: '0000', color: 'var(--cic-faction-icn)',
      }]}
    />,
  );

  const map = screen.getByRole('region', { name: '3D starmap' });
  expect(map).toHaveAttribute('data-chart', 'A');
  expect(map).toHaveTextContent(/22 systems \/\/ 40 jump links/i);
  expect(map).toHaveTextContent(/perspective depth is display only/i);
  expect(screen.getAllByRole('button', { name: /system /i })).toHaveLength(22);
  expect(screen.getByRole('button', { name: /system 0000.*start/i })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText(/FLEET FIX \/\/ 0000/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Chart A' })).toHaveClass('cic-action-button');

  await user.click(screen.getByRole('button', { name: 'Chart B' }));
  expect(onChartChange).toHaveBeenCalledWith('B');

  await user.click(screen.getByRole('button', { name: /system 6798.*ancient jump ring/i }));
  expect(onSystemSelect).toHaveBeenCalledWith('6798');
});

it('keeps the selected site effect and every distinct fleet fix in the readout', () => {
  render(
    <Starmap
      chart="A"
      selectedCoordinate="6798"
      fleetMarkers={[
        { id: 'aegis', label: 'AEGIS', coordinate: '0000', color: 'var(--cic-faction-icn)' },
        { id: 'snn', label: 'SNN', coordinate: '6798', color: 'var(--cic-faction-fas)' },
      ]}
    />,
  );

  expect(screen.getByRole('region', { name: /selected system readout/i }))
    .toHaveTextContent(/repair, research and 5 fuel per ship to pass/i);
  expect(screen.getByText(/FLEET FIXES \/\/ 0000 \/\/ 6798 \/\/ 2 ships plotted/i))
    .toBeInTheDocument();
});

it('surfaces live fleet plotting state and the selected jump corridor', () => {
  const { container } = render(
    <Starmap
      chart="A"
      selectedCoordinate="6798"
      fleetMarkers={[
        { id: 'aegis', label: 'AEGIS', coordinate: '0000', color: 'var(--cic-faction-icn)' },
        { id: 'snn', label: 'SNN', coordinate: '6798', color: 'var(--cic-faction-fas)' },
      ]}
    />,
  );

  const map = screen.getByRole('region', { name: '3D starmap' });
  expect(map).toHaveTextContent(/FLEET PLOT \/\/ 2 SHIPS PLOTTED/i);
  expect(map).toHaveTextContent(/PERSPECTIVE OVERLAY \/\/ DISPLAY ONLY/i);

  const selectedNode = screen.getByRole('button', { name: /system 6798/i });
  expect(selectedNode.style.getPropertyValue('--starmap-faction'))
    .toBe('var(--cic-faction-fas)');
  expect(selectedNode).toHaveAttribute('data-fleet-count', '1');

  expect(container.querySelectorAll('line[data-route-state="selected"]')).toHaveLength(4);
});
