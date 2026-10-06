export interface MemberProjectionConfirmation {
  readonly sessionId: string;
  readonly uid: string;
  readonly subscriptionToken: symbol;
  readonly confirm: (current: () => boolean) => Promise<boolean>;
  readonly cancel: () => void;
}

// App owns one session identity at a time. Share that owner even when App and
// another consumer import Firestore through different development ESM URLs.
// Older listeners must not publish or clear a replacement listener's state.
export const sessionSubscriptionOwner: {
  token: symbol | undefined;
  memberProjectionConfirmation: MemberProjectionConfirmation | undefined;
} = {
  token: undefined,
  memberProjectionConfirmation: undefined,
};
