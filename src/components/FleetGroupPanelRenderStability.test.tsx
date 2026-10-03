import { Profiler } from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import FleetGroupPanel from './FleetGroupPanel';

it('keeps group-note controls usable when optional navigation and taxi data are absent', () => {
  let commits = 0;
  const onRender = () => {
    if (++commits > 5) throw new Error('Group-note panel entered a repeated-render loop.');
  };
  expect(() => render(<Profiler id="group-notes" onRender={onRender}>
    <FleetGroupPanel groupId="fleet-2" actorUid="player-1" notes={[]} draft="A local note"
      busy={false} notice="" onDraft={vi.fn()} onSend={vi.fn()} onRefresh={vi.fn()} />
  </Profiler>)).not.toThrow();
  expect(screen.getByRole('button', { name: 'Send group note' })).toBeEnabled();
  expect(commits).toBeLessThanOrEqual(3);
});
