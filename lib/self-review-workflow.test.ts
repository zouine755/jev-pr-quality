import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../.github/workflows/jev-review.yml", import.meta.url),
  "utf8"
);

test("sample review workflow uses RawTree WIF without a permanent API key", () => {
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /environment: workload-federation-demo/);
  assert.match(
    workflow,
    /RAWTREE_FEDERATION_RULE_ID: \$\{\{ vars\.RAWTREE_FEDERATION_RULE_ID \}\}/
  );
  assert.match(
    workflow,
    /RAWTREE_AUDIENCE: \$\{\{ vars\.RAWTREE_AUDIENCE \|\| 'rawtree' \}\}/
  );
  assert.match(
    workflow,
    /RAWTREE_JEV_DATABASE: \$\{\{ secrets\.RAWTREE_JEV_DATABASE \}\}/
  );
  assert.match(
    workflow,
    /RAWTREE_JEV_TABLE: \$\{\{ secrets\.RAWTREE_JEV_TABLE \}\}/
  );
  assert.match(
    workflow,
    /RAWTREE_JEV_BASE_URL: \$\{\{ secrets\.RAWTREE_JEV_BASE_URL \}\}/
  );
  assert.match(workflow, /node scripts\/jev-review\/log-sample-rawtree\.mjs/);
  assert.doesNotMatch(workflow, /JEV_API_KEY|RAWTREE_JEV_API_KEY/);
});
