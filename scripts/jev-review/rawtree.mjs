function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function lowestRatings(batches) {
  const ratings = new Map();
  for (const batch of batches) {
    for (const rating of batch.ratings) {
      const previous = ratings.get(rating.key);
      if (!previous || (rating.applicable && (!previous.applicable || rating.score < previous.score))) {
        ratings.set(rating.key, rating);
      }
    }
  }
  return [...ratings.values()];
}

export function buildReviewEvent({ report, pullRequest, environment, recordedAt = new Date().toISOString() }) {
  const ratings = lowestRatings(report.batches);
  const applicable = ratings.filter((rating) => rating.applicable);
  if (!applicable.length) throw new Error('Cannot log a Jev review without applicable ratings.');
  const scores = applicable.map((rating) => rating.score);
  const repository = environment.GITHUB_REPOSITORY;
  const runId = finiteNumber(environment.GITHUB_RUN_ID);
  const runAttempt = finiteNumber(environment.GITHUB_RUN_ATTEMPT);
  if (!repository || !pullRequest?.number || !pullRequest.head?.sha || !pullRequest.base?.sha || !pullRequest.user?.login) {
    throw new Error('Cannot log a Jev review without GitHub PR provenance.');
  }

  const serverUrl = environment.GITHUB_SERVER_URL ?? 'https://github.com';
  return {
    event_type: 'jev_pr_review',
    event_version: 1,
    event_id: `${repository}:${pullRequest.number}:${pullRequest.head.sha}:${runId ?? 'local'}:${runAttempt ?? 1}`,
    recorded_at: recordedAt,
    repository,
    pr_number: pullRequest.number,
    pr_url: pullRequest.html_url ?? `${serverUrl}/${repository}/pull/${pullRequest.number}`,
    pr_title: pullRequest.title ?? '',
    author_login: pullRequest.user.login,
    author_id: finiteNumber(pullRequest.user.id),
    head_sha: pullRequest.head.sha,
    base_sha: pullRequest.base.sha,
    base_ref: pullRequest.base.ref ?? '',
    run_id: runId,
    run_attempt: runAttempt,
    run_url: runId === null ? null : `${serverUrl}/${repository}/actions/runs/${runId}`,
    data_source: 'jev',
    model: report.model,
    rubric_version: '1',
    threshold: report.threshold,
    passed: report.passed,
    applicable_dimensions: applicable.length,
    passed_dimensions: applicable.filter((rating) => rating.passed).length,
    minimum_score: Math.min(...scores),
    average_score: scores.reduce((total, score) => total + score, 0) / scores.length,
    ratings,
  };
}

export async function getGitHubOidcToken({ audience, requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, fetch = globalThis.fetch }) {
  if (!requestUrl || !requestToken) {
    throw new Error('GitHub did not provide OIDC credentials. Confirm the workflow has id-token: write permission.');
  }
  const url = new URL(requestUrl);
  url.searchParams.set('audience', audience);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${requestToken}`, accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`GitHub OIDC token request failed (HTTP ${response.status}).`);
  const payload = await response.json();
  if (typeof payload.value !== 'string' || !payload.value) {
    throw new Error('GitHub OIDC response did not contain a token.');
  }
  return payload.value;
}

export async function exchangeRawTreeToken({ oidcToken, federationRuleId, baseUrl = 'https://api.rawtree.com', fetch = globalThis.fetch }) {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    federation_rule_id: federationRuleId,
    assertion: oidcToken,
  });
  const response = await fetch(new URL('/oauth/token', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    let details = '';
    try {
      const error = await response.json();
      const safe = Object.fromEntries(['error', 'error_description', 'message', 'detail', 'code']
        .filter((key) => typeof error?.[key] === 'string' || typeof error?.[key] === 'number')
        .map((key) => [key, error[key]]));
      if (Object.keys(safe).length) details = ` ${JSON.stringify(safe)}`;
    } catch {
      // Do not expose the response body or token assertion in CI logs.
    }
    throw new Error(`RawTree token exchange failed (HTTP ${response.status}).${details}`);
  }
  const payload = await response.json();
  if (typeof payload.access_token !== 'string' || !payload.access_token) {
    throw new Error('RawTree token response did not contain an access_token.');
  }
  return payload.access_token;
}

export async function insertReviewEvents({ events, accessToken, table = 'jev_pr_reviews', database, baseUrl = 'https://api.rawtree.com', fetch = globalThis.fetch }) {
  if (!accessToken?.trim()) throw new Error('A short-lived RawTree access token is required.');
  if (!Array.isArray(events) || !events.length) throw new Error('At least one review event is required.');
  if (!table?.trim()) throw new Error('RAWTREE_JEV_TABLE must not be empty.');
  if (typeof fetch !== 'function') throw new Error('A fetch implementation is required.');
  const url = new URL(`/v1/tables/${encodeURIComponent(table)}`, baseUrl);
  const headers = new Headers({
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json',
  });
  if (database?.trim()) headers.set('x-rawtree-database', database);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(events),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`RawTree review insert failed (HTTP ${response.status}).`);
  }
}

export async function insertReviewEvent({ event, ...options }) {
  await insertReviewEvents({ events: [event], ...options });
}
