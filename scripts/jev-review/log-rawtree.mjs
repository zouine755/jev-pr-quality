import { existsSync, readFileSync } from 'node:fs';
import { buildReviewEvent, exchangeRawTreeToken, getGitHubOidcToken, insertReviewEvent } from './rawtree.mjs';

if (!existsSync('jev-review.json')) {
  console.log('Skipping RawTree logging: this run did not produce a review report.');
} else if (!process.env.RAWTREE_FEDERATION_RULE_ID?.trim()) {
  console.log('Skipping RawTree logging: RAWTREE_FEDERATION_RULE_ID is not configured.');
} else {
  try {
    const githubEvent = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const report = JSON.parse(readFileSync('jev-review.json', 'utf8'));
    const event = buildReviewEvent({ report, pullRequest: githubEvent.pull_request, environment: process.env });
    const audience = process.env.RAWTREE_AUDIENCE || 'rawtree';
    const baseUrl = process.env.RAWTREE_JEV_BASE_URL || 'https://api.rawtree.com';

    console.log('Requesting a short-lived GitHub identity token...');
    const oidcToken = await getGitHubOidcToken({ audience });
    console.log('Exchanging the GitHub identity for a short-lived RawTree token...');
    const accessToken = await exchangeRawTreeToken({
      oidcToken,
      federationRuleId: process.env.RAWTREE_FEDERATION_RULE_ID,
      baseUrl,
    });

    await insertReviewEvent({
      event,
      accessToken,
      table: process.env.RAWTREE_JEV_TABLE || 'jev_pr_reviews',
      database: process.env.RAWTREE_JEV_DATABASE,
      baseUrl,
    });
    console.log(`Logged Jev review for ${event.repository}#${event.pr_number} to RawTree using Workload Identity Federation.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown RawTree logging error.';
    console.error(`Unable to log Jev review to RawTree: ${message}`);
    process.exitCode = 1;
  }
}
