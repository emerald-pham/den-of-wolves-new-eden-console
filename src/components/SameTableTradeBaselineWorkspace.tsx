import type { Player } from '@/types/game';
import { attestPlayerHeldTokenBaseline } from '@/lib/sameTableTradeService';
import {
  SameTableTradeBaselinePanel,
  type SameTableTradeBaselinePanelProps,
} from './SameTableTradeBaselinePanel';

export default function SameTableTradeBaselineWorkspace({
  players,
}: {
  readonly players: readonly Player[];
}) {
  const onAttest: SameTableTradeBaselinePanelProps['onAttest'] = async ({
    targetUid,
    balances,
    attestationId,
  }) => {
    const reply = await attestPlayerHeldTokenBaseline(targetUid, balances, attestationId);
    if (reply.status !== 'attested' && reply.status !== 'replayed') {
      throw new Error('The facilitator baseline result was not confirmed.');
    }
    return { status: reply.status };
  };

  return (
    <div className="gm-console__module">
      <SameTableTradeBaselinePanel players={players} onAttest={onAttest} />
    </div>
  );
}
