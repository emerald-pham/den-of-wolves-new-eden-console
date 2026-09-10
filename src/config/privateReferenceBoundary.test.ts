import { execFileSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

describe('private reference boundary', () => {
  it('keeps the proprietary docs/reference library out of Git', () => {
    const trackedReferencePaths = execFileSync(
      'git',
      ['ls-files', '--', 'docs/reference'],
      { encoding: 'utf8' },
    ).trim()

    expect(trackedReferencePaths).toBe('')
  })
})
