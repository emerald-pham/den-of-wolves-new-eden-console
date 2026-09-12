import { expect, it } from 'vitest';
import { expireTurnScopedResources } from './turnTransition';

it('expires Capybara bay refuel state and unused charges at the numbered-turn boundary', () => {
  const expired = expireTurnScopedResources({
    capybara: {
      step: 0, revision: 8, turn: 1, results: { '7': 'Maintenance cycle complete.' },
      charges: ['jump-drive'], refuelled: ['boa'],
    },
  }, { macaw: true, boa: true });

  expect(expired.maintenanceCycles.capybara).toMatchObject({ charges: [], refuelled: [] });
  expect(expired.shuttleFuelled).toEqual({ macaw: false, boa: false });
});
