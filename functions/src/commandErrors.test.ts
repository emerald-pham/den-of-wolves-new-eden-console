import { expect, it } from 'vitest';
import { commandError } from './commandErrors';

it('attaches only the stable taxonomy discriminant to callable errors', () => {
  const error = commandError(
    'failed-precondition',
    'The session is closed.',
    'terminal-session',
  );
  expect(error.code).toBe('failed-precondition');
  expect(error.details).toEqual({ commandError: 'terminal-session' });
  expect(error.message).toBe('The session is closed.');
});
