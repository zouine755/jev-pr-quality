import { readFile } from 'node:fs/promises';
import { exchangeRawTreeToken, getGitHubOidcToken, insertReviewEvent } from './rawtree.mjs';

const githubEvent = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
const pullRequest = githubEvent.pull_request;
if (!pullRequest?.number || !pullRequest.head?.sha || !pullRequest.base?.sha) {
  throw new Error('This workflow expects a pull_request event with head and base commit details.');
}

const repository = process.env.GITHUB_REPOSITORY;
const runId = Number(process.env.GITHUB_RUN_ID);
const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT || '1');
const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
const ratings = [
  { key: 'change_scope', label: 'Change scope', score: 8, applicable: true, passed: true },
  { key: 'test_coverage', label: 'Test coverage', score: 8, applicable: true, passed: true },
  { key: 'documentation', label: 'Documentation', score: 7, applicable: true, passed: true },
  { key: 'maintainability', label: 'Maintainability', score: 9, applicable: true, passed: true },
];
const event = {
  event_type: 'jev_pr_review',
  event_version: 1,
  event_id: `${repository}:${pullRequest.number}:${pullRequest.head.sha}:${runId}:${runAttempt}`,
  recorded_at: new Date().toISOString(),
  repository,
  pr_number: pullRequest.number,
  pr_url: pullRequest.html_url || `${serverUrl}/${repository}/pull/${pullRequest.number}`,
  pr_title: pullRequest.title || '',
  author_login: pullRequest.user?.login || 'unknown',
  author_id: pullRequest.user?.id ?? null,
  head_sha: pullRequest.head.sha,
  base_sha: pullRequest.base.sha,
  base_ref: pullRequest.base.ref || '',
  run_id: runId,
  run_attempt: runAttempt,
  run_url: `${serverUrl}/${repository}/actions/runs/${runId}`,
  data_source: 'demo_fixture',
  model: 'deterministic-demo-fixture',
  rubric_version: 'demo-1',
  threshold: 7,
  passed: true,
  applicable_dimensions: ratings.length,
  passed_dimensions: ratings.length,
  minimum_score: 7,
  average_score: ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length,
  ratings,
};

const audience = process.env.RAWTREE_AUDIENCE || 'rawtree';
const baseUrl = process.env.RAWTREE_JEV_BASE_URL || 'https://api.rawtree.com';
const federationRuleId = process.env.RAWTREE_FEDERATION_RULE_ID;
if (!federationRuleId) throw new Error('RAWTREE_FEDERATION_RULE_ID is not configured.');
if (!process.env.RAWTREE_JEV_DATABASE) throw new Error('RAWTREE_JEV_DATABASE is not configured.');

console.log('Creating a clearly labeled sample PR review event...');
console.log('Requesting a short-lived GitHub identity token...');
const oidcToken = await getGitHubOidcToken({ audience });
const claimsSegment = oidcToken.split('.')[1];
if (!claimsSegment) throw new Error('GitHub returned an identity token with an unexpected format.');
const claims = JSON.parse(Buffer.from(claimsSegment, 'base64url').toString('utf8'));
console.log('GitHub OIDC identity claims (safe metadata only):', JSON.stringify({
  issuer: claims.iss,
  audience: claims.aud,
  subject: claims.sub,
  repository: claims.repository,
  repository_id: claims.repository_id,
  repository_owner: claims.repository_owner,
  environment: claims.environment,
  issued_at: claims.iat,
  not_before: claims.nbf,
  expires_at: claims.exp,
  token_lifetime_seconds: Number.isFinite(claims.iat) && Number.isFinite(claims.exp) ? claims.exp - claims.iat : null,
}));
if (!claims.iss || !claims.sub || !claims.aud || !Number.isFinite(claims.iat) || !Number.isFinite(claims.exp)) {
  throw new Error('GitHub OIDC token is missing one or more required claims: iss, sub, aud, iat, exp.');
}
const now = Math.floor(Date.now() / 1000);
if (claims.iat > now + 60 || claims.exp <= now || claims.exp <= claims.iat || (Number.isFinite(claims.nbf) && claims.nbf > now + 60)) {
  throw new Error('GitHub OIDC token has invalid timing claims or is expired/not yet valid.');
}
console.log('Exchanging the GitHub identity for a short-lived RawTree token...');
const accessToken = await exchangeRawTreeToken({ oidcToken, federationRuleId, baseUrl });
await insertReviewEvent({
  event,
  accessToken,
  table: process.env.RAWTREE_JEV_TABLE || 'jev_pr_reviews',
  database: process.env.RAWTREE_JEV_DATABASE,
  baseUrl,
});
console.log(`Inserted sample review event for ${repository}#${pullRequest.number} into RawTree.`);
