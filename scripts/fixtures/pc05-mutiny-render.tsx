import { createRoot } from 'react-dom/client';
import GmMutinyRecovery from '@/components/GmMutinyRecovery';

export function mountPc05MutinyFixture(container: HTMLElement) {
  createRoot(container).render(
    <div className="gm-console gm-console__module" role="region"
      aria-label="PC05 mutiny recovery fixture">
      <GmMutinyRecovery
        shipId="base-capybara"
        shipName="Base Capybara"
        unrest={8}
        mutiny={{
          status: 'active',
          triggeredAt: '2089-07-16T12:00:00.000Z',
          triggeredBy: 'unrest-threshold',
        }}
        mode="replacement-transfer"
        currentCaptain={{
          uid: 'captain-one',
          displayName: 'Captain Arden',
          roleId: 'base-capybara-captain',
        }}
        expectedRevision={12}
        writable
        candidates={[{
          uid: 'captain-two',
          displayName: 'Lieutenant Reyes',
          roleId: 'aegis-engineer',
        }]}
      />
      <GmMutinyRecovery
        shipId="voyage-33-0"
        shipName="Voyage 33-0"
        unrest={9}
        mutiny={{
          status: 'active',
          triggeredAt: '2089-07-16T12:00:00.000Z',
          triggeredBy: 'unrest-threshold',
        }}
        mode="crew-attestation"
        expectedRevision={7}
        writable
        candidates={[]}
      />
    </div>,
  );
}
