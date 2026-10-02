import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('./fixtures/readonly.mjs', import.meta.url));
for (const load of ['cold', 'warm']) {
  for (const value of ['true', 'false', 'omitted']) {
    test(`readOnly ${value}: ${load} upgrade and reactive toggles`, () => {
      const result = spawnSync(process.execPath, [fixture, load, value], {
        encoding: 'utf8', timeout: 30_000,
      });
      assert.equal(result.error, undefined, result.error?.message);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    });
  }
}
