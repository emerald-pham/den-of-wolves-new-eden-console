import { expect, it } from 'vitest';
import { HACKING_MESSAGES, hackingMessageForNoticeId } from './hackingMessages';

it('chooses the same existing approved hacking line for every console receiving one notice', () => {
  const noticeId = 'a1b2c3d4-e5f6-4abc-9def-0123456789ab';
  const first = hackingMessageForNoticeId(noticeId);
  expect(hackingMessageForNoticeId(noticeId)).toBe(first);
  expect(HACKING_MESSAGES).toContain(first);
});
