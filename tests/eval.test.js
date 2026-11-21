import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('benchmark: v1.0 term extraction stays precise and clearly beats v0.4', async () => {
  const { default: r } = await import('../eval/run.mjs');
  assert.ok(r.summary.v10.precision >= 0.9, `precision ${r.summary.v10.precision}`);
  assert.ok(r.summary.v10.mustRecall >= 0.85, `must recall ${r.summary.v10.mustRecall}`);
  assert.ok(r.summary.v10.junk <= 0.2, `junk ${r.summary.v10.junk}`);
  assert.ok(r.summary.v10.precision > r.summary.v04.precision + 0.3);
  // Published numbers on the website must match a fresh run.
  const published = JSON.parse(fs.readFileSync(new URL('../web/data/eval.json', import.meta.url)));
  assert.deepEqual(published.summary, r.summary, 'web/data/eval.json is stale: run node eval/run.mjs --write');
});
