import { act, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WolfAttackMemberView } from '@/types/game';
import { WolfAttackDradisPanel, WolfAttackDradisView } from './WolfAttackDradis';

const STAMP = '2026-10-04T12:00:00.000Z';

function result(
  patch: Partial<WolfAttackMemberView['results'][number]> = {},
): WolfAttackMemberView['results'][number] {
  return {
    range: 'long',
    sourceId: 'aegis:missile-launchers',
    targetId: 'dione',
    bearing: null,
    contactReference: 'ship:dione',
    effect: 'Missile hit',
    outcome: { damage: 2, destroyed: false },
    serverTime: STAMP,
    ...patch,
  };
}

function view(patch: Partial<WolfAttackMemberView> = {}): WolfAttackMemberView {
  return {
    type: 'wolf-attack-member-view',
    schemaVersion: 1,
    sessionId: 'session-1',
    attackId: 'attack-1',
    turn: 2,
    revision: 7,
    status: 'declared',
    phase: 'active',
    currentStep: 'medium-range',
    range: 'medium',
    deadlineAt: '2026-10-04T12:10:00.000Z',
    serverTime: STAMP,
    visibility: 'members',
    redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'],
    results: [],
    ...patch,
  };
}

describe('Wolf attack DRADIS presenter', () => {
  it('shows current phase and committed source, local target, bearing, effect, and outcome', () => {
    render(
      <WolfAttackDradisView
        view={view({ results: [result()] })}
        visibleTargetIds={['dione']}
      />,
    );

    const region = screen.getByRole('region', { name: /wolf attack dradis/i });
    expect(region).toHaveTextContent(/medium range/i);
    const row = within(region).getByRole('listitem');
    expect(row).toHaveTextContent(/source.*aegis.*missile/i);
    expect(row).toHaveTextContent(/target.*dione/i);
    expect(row).toHaveTextContent(/bearing.*(unknown|unavailable|not published)/i);
    expect(row).toHaveTextContent(/effect.*missile hit/i);
    expect(row).toHaveTextContent(/outcome.*2 damage/i);
    expect(region.querySelectorAll('[data-x], [data-y]')).toHaveLength(0);
  });

  it('renders only local fleet targets while keeping opaque Wolf contacts textual', () => {
    const current = view({
      results: [
        result(),
        result({
          sourceId: 'pdf-escort-wing',
          targetId: 'shepherd',
          contactReference: 'ship:shepherd',
          effect: 'Escort attack hit',
        }),
        result({
          sourceId: 'aegis-alpha-wing',
          targetId: 'opaque-wolf-contact-17',
          bearing: null,
          contactReference: 'Wolf contact 3',
          effect: 'Fighter Wing attack hit',
        }),
        result({
          sourceId: 'highwall',
          targetId: null,
          contactReference: 'Highwall Cannon',
          effect: 'Highwall Cannon missed',
          outcome: { damage: 0 },
        }),
      ],
    });
    render(<WolfAttackDradisView view={current} visibleTargetIds={['dione']} />);

    const region = screen.getByRole('region', { name: /wolf attack dradis/i });
    const list = within(region).getByRole('list', { name: /committed/i });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(region).toHaveTextContent(/dione/i);
    expect(region).toHaveTextContent(/wolf contact 3/i);
    expect(region).toHaveTextContent(/highwall cannon missed/i);
    expect(region).not.toHaveTextContent(/shepherd/i);
    expect(region).not.toHaveTextContent(/opaque-wolf-contact-17/i);
    expect(rows[1]).toHaveTextContent(/bearing.*(unknown|unavailable|not published)/i);
    expect(rows[2]).toHaveTextContent(/target.*(none|unassigned|unavailable)/i);
  });

  it('shows a published numeric bearing verbatim and marks a completed attack', () => {
    const published = view({
      status: 'resolved',
      currentStep: 'resolved',
      range: null,
      results: [result({ bearing: 42 })],
    });
    render(<WolfAttackDradisView view={published} visibleTargetIds={['dione']} />);

    const region = screen.getByRole('region', { name: /wolf attack dradis/i });
    expect(region).toHaveTextContent(/attack complete/i);
    expect(within(region).getByRole('listitem')).toHaveTextContent(/bearing.*42(?:\.0+)?\s*°/i);
  });

  it('does not render hidden preparation, rolls, facilitator notes, or actor identity', () => {
    const privateResult = {
      ...result(),
      rolls: [6],
      actorUid: 'private-actor-uid-sentinel',
      gmNote: 'private-facilitator-note-sentinel',
    } as unknown as WolfAttackMemberView['results'][number];
    const privateView = {
      ...view({ results: [privateResult] }),
      preparation: {
        shipIds: ['hidden-wolf-composition-sentinel'],
        notes: 'hidden-preparation-note-sentinel',
      },
    } as unknown as WolfAttackMemberView;
    const { container } = render(
      <WolfAttackDradisView view={privateView} visibleTargetIds={['dione']} />,
    );

    expect(container).not.toHaveTextContent(/private-actor-uid-sentinel/i);
    expect(container).not.toHaveTextContent(/private-facilitator-note-sentinel/i);
    expect(container).not.toHaveTextContent(/hidden-wolf-composition-sentinel/i);
    expect(container).not.toHaveTextContent(/hidden-preparation-note-sentinel/i);
    expect(container).not.toHaveTextContent(/rolls/i);
  });
});

describe('Wolf attack DRADIS live adapter', () => {
  it('subscribes to the supplied current session and rejects foreign or late session views', () => {
    const listeners: Array<{
      sessionId: string;
      publish: (next: WolfAttackMemberView | null) => void;
    }> = [];
    const subscribe = vi.fn((
      sessionId: string,
      publish: (next: WolfAttackMemberView | null) => void,
    ) => {
      listeners.push({ sessionId, publish });
      return vi.fn();
    });
    const { rerender } = render(
      <WolfAttackDradisPanel
        sessionId="session-1"
        enabled
        visibleTargetIds={['dione']}
        subscribe={subscribe}
      />,
    );
    expect(subscribe).toHaveBeenCalledWith('session-1', expect.any(Function));
    const oldSessionListener = listeners[0]!.publish;
    act(() => oldSessionListener(view({ results: [result()] })));
    expect(screen.getByRole('region', { name: /wolf attack dradis/i })).toHaveTextContent(/dione/i);

    rerender(
      <WolfAttackDradisPanel
        sessionId="session-2"
        enabled
        visibleTargetIds={['aegis']}
        subscribe={subscribe}
      />,
    );
    expect(screen.queryByRole('region', { name: /wolf attack dradis/i })).not.toBeInTheDocument();
    expect(subscribe).toHaveBeenLastCalledWith('session-2', expect.any(Function));

    act(() => oldSessionListener(view({ results: [result()] })));
    expect(screen.queryByText(/session-1/i)).not.toBeInTheDocument();
    act(() => listeners[1]!.publish(view({ sessionId: 'session-1', results: [result()] })));
    expect(screen.queryByRole('region', { name: /wolf attack dradis/i })).not.toBeInTheDocument();
    act(() => listeners[1]!.publish(view({ sessionId: 'session-2', results: [result()] })));
    expect(screen.getByRole('region', { name: /wolf attack dradis/i })).toHaveTextContent(/dione/i);
  });

  it('withdraws on authority loss, drops stale revisions, and replaces the view after reconnect', () => {
    const listeners: Array<(next: WolfAttackMemberView | null) => void> = [];
    const unsubscribed: string[] = [];
    const subscribe = vi.fn((
      sessionId: string,
      publish: (next: WolfAttackMemberView | null) => void,
    ) => {
      listeners.push(publish);
      return () => { unsubscribed.push(sessionId); };
    });
    const props = {
      sessionId: 'session-1',
      visibleTargetIds: ['dione'],
      subscribe,
    };
    const { rerender } = render(<WolfAttackDradisPanel {...props} enabled />);
    const original = view({ revision: 9, results: [result({ effect: 'current revision result' })] });
    act(() => listeners[0]!(original));
    expect(screen.getByRole('region', { name: /wolf attack dradis/i })).toHaveTextContent(/current revision result/i);

    act(() => listeners[0]!(view({ revision: 8, results: [result({ effect: 'stale revision result' })] })));
    expect(screen.getByRole('region', { name: /wolf attack dradis/i })).toHaveTextContent(/current revision result/i);
    expect(screen.queryByText(/stale revision result/i)).not.toBeInTheDocument();

    rerender(<WolfAttackDradisPanel {...props} enabled={false} />);
    expect(screen.queryByRole('region', { name: /wolf attack dradis/i })).not.toBeInTheDocument();
    expect(unsubscribed).toContain('session-1');
    act(() => listeners[0]!(original));
    expect(screen.queryByRole('region', { name: /wolf attack dradis/i })).not.toBeInTheDocument();

    rerender(<WolfAttackDradisPanel {...props} enabled />);
    const reconnected = listeners.at(-1)!;
    act(() => reconnected(null));
    expect(screen.queryByRole('region', { name: /wolf attack dradis/i })).not.toBeInTheDocument();
    act(() => reconnected(original));
    expect(screen.getByRole('region', { name: /wolf attack dradis/i })).toHaveTextContent(/current revision result/i);
  });

  it('reapplies local target visibility immediately when the current plot changes', () => {
    const listeners: Array<(next: WolfAttackMemberView | null) => void> = [];
    const subscribe = vi.fn((
      _sessionId: string,
      publish: (next: WolfAttackMemberView | null) => void,
    ) => {
      listeners.push(publish);
      return vi.fn();
    });
    const { rerender } = render(
      <WolfAttackDradisPanel
        sessionId="session-1"
        enabled
        visibleTargetIds={['dione']}
        subscribe={subscribe}
      />,
    );
    act(() => listeners[0]!(view({ results: [result()] })));
    expect(screen.getByRole('region', { name: /wolf attack dradis/i })).toHaveTextContent(/dione/i);

    rerender(
      <WolfAttackDradisPanel
        sessionId="session-1"
        enabled
        visibleTargetIds={['shepherd']}
        subscribe={subscribe}
      />,
    );
    expect(screen.queryByRole('region', { name: /wolf attack dradis/i })).not.toHaveTextContent(/dione/i);
  });
});
