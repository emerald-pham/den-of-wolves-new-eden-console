import { useRef, useState, type FormEvent } from 'react';
import type { Player } from '@/types/game';
import './SameTableTradeBaselinePanel.css';

export interface SameTableTradeBaselineBalances {
  readonly ore: number;
  readonly fuel: number;
  readonly food: number;
  readonly water: number;
  readonly materials: number;
  readonly securityTeams: number;
}

export type SameTableTradeBaselineResult = { readonly status: 'attested' | 'replayed' };

export interface SameTableTradeBaselinePanelProps {
  readonly players: readonly Player[];
  readonly submitting?: boolean;
  readonly errorMessage?: string;
  readonly onAttest: (request: {
    readonly targetUid: Player['uid'];
    readonly balances: SameTableTradeBaselineBalances;
    readonly attestationId: string;
  }) => Promise<SameTableTradeBaselineResult>;
}

const RESOURCE_FIELDS = [
  { key: 'ore', label: 'Ore' },
  { key: 'fuel', label: 'Fuel' },
  { key: 'food', label: 'Food' },
  { key: 'water', label: 'Water' },
  { key: 'materials', label: 'Materials' },
  { key: 'securityTeams', label: 'Security Teams' },
] as const satisfies readonly { key: keyof SameTableTradeBaselineBalances; label: string }[];

type ResourceKey = (typeof RESOURCE_FIELDS)[number]['key'];
type RawBalances = Record<ResourceKey, string>;

interface AttemptIdentity {
  readonly signature: string;
  readonly attestationId: string;
}

const EMPTY_BALANCES: RawBalances = {
  ore: '',
  fuel: '',
  food: '',
  water: '',
  materials: '',
  securityTeams: '',
};

const GENERIC_SUBMISSION_ERROR = 'The baseline result was not confirmed. Retry the same target and counts to check the original request.';
const INVALID_COUNTS_ERROR = 'Enter a whole count from 0 through 9,007,199,254,740,991 for each resource.';

function safeDisplayName(name: string): string {
  const cleaned = Array.from(name)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return !(
        codePoint <= 0x1f
        || (codePoint >= 0x7f && codePoint <= 0x9f)
        || (codePoint >= 0x202a && codePoint <= 0x202e)
        || (codePoint >= 0x2066 && codePoint <= 0x2069)
      );
    })
    .join('')
    .trim()
    .slice(0, 80);
  return cleaned || 'Unnamed player';
}

function playerChoices(players: readonly Player[]): Array<{ readonly player: Player; readonly label: string }> {
  const activePlayers = players.filter((player) => player.role === 'player' && player.connected === true);
  const counts = new Map<string, number>();
  activePlayers.forEach((player) => {
    const label = safeDisplayName(player.displayName);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  const seen = new Map<string, number>();

  return activePlayers.map((player) => {
    const label = safeDisplayName(player.displayName);
    const nextNumber = (seen.get(label) ?? 0) + 1;
    seen.set(label, nextNumber);
    return {
      player,
      label: (counts.get(label) ?? 0) > 1 ? `${label} (${nextNumber})` : label,
    };
  });
}

function signatureFor(targetUid: string, balances: RawBalances): string {
  return JSON.stringify([targetUid, ...RESOURCE_FIELDS.map(({ key }) => balances[key])]);
}

function parseBalances(rawBalances: RawBalances): { readonly balances: SameTableTradeBaselineBalances; readonly invalidField?: ResourceKey } {
  const balances: Record<ResourceKey, number> = {
    ore: 0,
    fuel: 0,
    food: 0,
    water: 0,
    materials: 0,
    securityTeams: 0,
  };
  for (const { key } of RESOURCE_FIELDS) {
    const raw = rawBalances[key];
    if (!/^\d+$/.test(raw)) return { balances, invalidField: key };
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0) {
      return { balances, invalidField: key };
    }
    balances[key] = value;
  }
  return { balances };
}

export function SameTableTradeBaselinePanel({
  players,
  submitting = false,
  errorMessage,
  onAttest,
}: SameTableTradeBaselinePanelProps) {
  const choices = playerChoices(players);
  const hasPlayers = choices.length > 0;
  const [targetUid, setTargetUid] = useState('');
  const targetUidRef = useRef('');
  const [rawBalances, setRawBalances] = useState<RawBalances>({ ...EMPTY_BALANCES });
  const rawBalancesRef = useRef<RawBalances>({ ...EMPTY_BALANCES });
  const [invalidFields, setInvalidFields] = useState<Partial<Record<ResourceKey, boolean>>>({});
  const [targetInvalid, setTargetInvalid] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ readonly status: 'attested' | 'replayed'; readonly playerName: string } | null>(null);
  const [pending, setPending] = useState(false);
  const targetRef = useRef<HTMLSelectElement>(null);
  const inputRefs = useRef<Partial<Record<ResourceKey, HTMLInputElement>>>({});
  const attemptRef = useRef<AttemptIdentity | null>(null);
  const inFlightRef = useRef(false);
  const busy = submitting || pending;
  const selectedChoice = choices.find(({ player }) => player.uid === targetUid);

  function clearTransientMessages() {
    setLocalError(null);
    setSuccess(null);
  }

  function invalidateChangedAttempt(nextTarget: string, nextBalances: RawBalances) {
    const attempt = attemptRef.current;
    if (attempt && attempt.signature !== signatureFor(nextTarget, nextBalances)) {
      attemptRef.current = null;
    }
  }

  function updateTarget(nextTarget: string) {
    targetUidRef.current = nextTarget;
    setTargetUid(nextTarget);
    invalidateChangedAttempt(nextTarget, rawBalancesRef.current);
    setTargetInvalid(false);
    setInvalidFields({});
    clearTransientMessages();
  }

  function updateBalance(key: ResourceKey, value: string) {
    const nextBalances = { ...rawBalancesRef.current, [key]: value };
    rawBalancesRef.current = nextBalances;
    setRawBalances(nextBalances);
    invalidateChangedAttempt(targetUidRef.current, nextBalances);
    setInvalidFields({});
    setTargetInvalid(false);
    clearTransientMessages();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || inFlightRef.current || !hasPlayers) return;
    setLocalError(null);
    setSuccess(null);

    const currentTarget = choices.find(({ player }) => player.uid === targetUidRef.current);
    if (!currentTarget) {
      setTargetInvalid(true);
      setInvalidFields({});
      setLocalError('Choose an active connected player before recording counts.');
      targetRef.current?.focus();
      return;
    }

    const parsed = parseBalances(rawBalancesRef.current);
    if (parsed.invalidField) {
      setInvalidFields({ [parsed.invalidField]: true });
      setTargetInvalid(false);
      setLocalError(INVALID_COUNTS_ERROR);
      inputRefs.current[parsed.invalidField]?.focus();
      return;
    }

    const signature = signatureFor(targetUidRef.current, rawBalancesRef.current);
    let attempt = attemptRef.current;
    if (!attempt || attempt.signature !== signature) {
      attempt = { signature, attestationId: globalThis.crypto.randomUUID() };
      attemptRef.current = attempt;
    }

    inFlightRef.current = true;
    setPending(true);
    try {
      const result = await onAttest({
        targetUid: currentTarget.player.uid,
        balances: parsed.balances,
        attestationId: attempt.attestationId,
      });
      setSuccess({ status: result.status, playerName: currentTarget.label });
      targetUidRef.current = '';
      rawBalancesRef.current = { ...EMPTY_BALANCES };
      setTargetUid('');
      setRawBalances({ ...EMPTY_BALANCES });
      setInvalidFields({});
      setTargetInvalid(false);
      attemptRef.current = null;
    } catch {
      setLocalError(GENERIC_SUBMISSION_ERROR);
    } finally {
      inFlightRef.current = false;
      setPending(false);
    }
  }

  return (
    <section className="same-table-trade-baseline cic-frame" aria-labelledby="same-table-trade-baseline-title">
      <p className="same-table-trade-baseline__overline cic-overline">Facilitator // Held Tokens</p>
      <h2 id="same-table-trade-baseline-title">Physical Tabletop Baseline</h2>
      <p className="same-table-trade-baseline__guidance" id="same-table-trade-baseline-guidance">
        Record the physical counts the facilitator sees at the table. This records held tokens; it does not grant ship inventory.
      </p>

      {!hasPlayers && (
        <p className="same-table-trade-baseline__empty" role="status">
          No connected players are available for baseline entry.
        </p>
      )}

      <form
        aria-label="Physical tabletop baseline"
        aria-describedby="same-table-trade-baseline-guidance"
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="same-table-trade-baseline__target-field">
          <label htmlFor="same-table-trade-baseline-target">Player to attest</label>
          <select
            id="same-table-trade-baseline-target"
            ref={targetRef}
            value={selectedChoice ? targetUid : ''}
            disabled={!hasPlayers || busy}
            aria-invalid={targetInvalid}
            aria-describedby={targetInvalid ? 'same-table-trade-baseline-target-error' : undefined}
            onChange={(event) => updateTarget(event.currentTarget.value)}
          >
            <option value="">Choose a connected player</option>
            {choices.map(({ player, label }) => (
              <option key={player.uid} value={player.uid}>{label}</option>
            ))}
          </select>
          {targetInvalid && (
            <span id="same-table-trade-baseline-target-error" className="same-table-trade-baseline__field-error">
              Choose an active connected player.
            </span>
          )}
        </div>

        <fieldset className="same-table-trade-baseline__fieldset" disabled={!hasPlayers || busy}>
          <legend>Counts on the table</legend>
          <div className="same-table-trade-baseline__count-grid">
            {RESOURCE_FIELDS.map(({ key, label }) => (
              <div className="same-table-trade-baseline__count-field" key={key}>
                <label htmlFor={`same-table-trade-baseline-${key}`}>{label}</label>
                <input
                  id={`same-table-trade-baseline-${key}`}
                  ref={(element) => {
                    if (element) inputRefs.current[key] = element;
                    else delete inputRefs.current[key];
                  }}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={Number.MAX_SAFE_INTEGER}
                  step={1}
                  required
                  value={rawBalances[key]}
                  aria-invalid={Boolean(invalidFields[key])}
                  aria-describedby={invalidFields[key] ? `same-table-trade-baseline-${key}-error` : undefined}
                  onChange={(event) => updateBalance(key, event.currentTarget.value)}
                />
                {invalidFields[key] && (
                  <span id={`same-table-trade-baseline-${key}-error`} className="same-table-trade-baseline__field-error">
                    Enter a whole count from 0 to {Number.MAX_SAFE_INTEGER.toLocaleString('en-US')}.
                  </span>
                )}
              </div>
            ))}
          </div>
        </fieldset>

        <button className="cic-action-button same-table-trade-baseline__submit" type="submit" disabled={!hasPlayers || busy}>
          {busy ? 'Recording counts…' : 'Record tabletop counts'}
        </button>
      </form>

      {(errorMessage || localError) && (
        <p className="same-table-trade-baseline__error" role="alert" aria-label="Baseline entry error">
          {errorMessage || localError}
        </p>
      )}

      {success && (
        <p
          className="same-table-trade-baseline__success"
          role="status"
          aria-label={success.status === 'attested' ? 'Baseline recorded' : 'Exact request replayed'}
        >
          {success.status === 'attested'
            ? `Physical tabletop counts recorded for ${success.playerName}. These are the counts the facilitator sees; this entry does not grant ship inventory.`
            : `These exact tabletop counts were already recorded for ${success.playerName}. They are the counts the facilitator sees; this entry does not grant ship inventory.`}
        </p>
      )}
    </section>
  );
}
