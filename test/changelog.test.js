// -----------------------------------------------------------------------------
// The changelog roll of the Release workflow (.github/scripts/changelog-release.mjs).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-webrtccamera';

test('the Unreleased section moves under the version, and an empty one is left on top', () => {
  const before = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- A thing.\n\n[Unreleased]: ${REPO}/commits/main\n`;
  const after = rollChangelog(before, '1.0.0', '2026-11-20');
  assert.match(
    after,
    /## \[Unreleased\]\n\n## \[1\.0\.0\] - 2026-11-20\n\n### Added\n\n- A thing\./,
  );
  assert.match(after, new RegExp(`\\[Unreleased\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.HEAD`));
  assert.match(after, new RegExp(`\\[1\\.0\\.0\\]: ${REPO}/releases/tag/v1\\.0\\.0`));
});

test('the next release compares with the previous tag', () => {
  const before = `## [Unreleased]\n\n- Fix.\n\n## [1.0.0] - 2026-11-20\n\n- First.\n\n[Unreleased]: ${REPO}/compare/v1.0.0...HEAD\n`;
  const after = rollChangelog(before, '1.0.1', '2026-12-01');
  assert.match(after, new RegExp(`\\[1\\.0\\.1\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.v1\\.0\\.1`));
  assert.equal(rollChangelog(after, '1.0.1', '2026-12-02'), after, 'a version is rolled once');
});

test('the real CHANGELOG.md has an Unreleased section and links to this repository', async () => {
  const text = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.match(text, /^## \[Unreleased\][ \t]*$/m);
  assert.match(text, new RegExp(`^\\[Unreleased\\]: ${REPO}/`, 'm'));
});
