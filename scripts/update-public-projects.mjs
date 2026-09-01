#!/usr/bin/env node
/**
 * leosand profile — sync the "Public projects" table in README.md
 * with the genuinely public repositories of the leosand GitHub account.
 *
 * Runs daily via .github/workflows/update-public-projects.yml (03:17 UTC).
 * Node.js 20 native APIs only — no npm dependencies.
 */

import fs from 'node:fs/promises';

const owner = 'leosand';
const startMarker = '<!-- public-projects:start -->';
const endMarker = '<!-- public-projects:end -->';
const readmePath = 'README.md';
const userAgent = `${owner}-profile-project-sync`;

/** Fetch every repository page of the account (sort=updated, desc). */
async function fetchAllRepositories() {
  const repositories = [];
  for (let page = 1; ; page += 1) {
    const url = `https://api.github.com/users/${owner}/repos?per_page=100&page=${page}&sort=updated&direction=desc`;
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': userAgent };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`GitHub API request failed (${response.status}) for ${url}`);
    }
    const pageRepositories = await response.json();
    if (!Array.isArray(pageRepositories) || pageRepositories.length === 0) break;
    repositories.push(...pageRepositories);
    if (pageRepositories.length < 100) break;
  }
  return repositories;
}

/** Normalize a value for safe use inside a Markdown table cell. */
function normalizeCell(value) {
  return String(value ?? '')
    .replace(/\r\n/g, ' ')
    .replace(/[\r\n]/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

/** Only active, non-fork, public repositories owned by the account. */
function isEligible(repository) {
  return (
    repository.owner?.login === owner &&
    repository.visibility === 'public' &&
    repository.private === false &&
    repository.archived === false &&
    repository.disabled === false &&
    repository.fork === false
  );
}

/** SPDX id when present and meaningful, otherwise "No license declared". */
function licenseLabel(repository) {
  const spdx = repository.license?.spdx_id;
  return spdx && spdx !== 'NOASSERTION' ? spdx : 'No license declared';
}

/** Render the Markdown rows between the marker pair. */
function renderRows(repositories) {
  if (repositories.length === 0) {
    return '| _No eligible public repositories found._ | — | — |';
  }
  return repositories
    .map((repository) => {
      const name = normalizeCell(repository.name);
      const url = repository.html_url || `https://github.com/${owner}/${repository.name}`;
      const description = normalizeCell(repository.description) || 'Open-source project';
      const language = normalizeCell(repository.language);
      const stack = [language, licenseLabel(repository)].filter(Boolean).join(' · ');
      return `| [**${name}**](${url}) | ${description} | ${stack} |`;
    })
    .join('\n');
}

async function main() {
  const readme = await fs.readFile(readmePath, 'utf8');
  const start = readme.indexOf(startMarker);
  const end = readme.indexOf(endMarker);

  if (start === -1 || end === -1) {
    throw new Error(
      `README.md must contain exactly one "${startMarker}" and one "${endMarker}".`,
    );
  }
  if (start !== readme.lastIndexOf(startMarker)) {
    throw new Error(`README.md contains more than one "${startMarker}" marker.`);
  }
  if (end !== readme.lastIndexOf(endMarker)) {
    throw new Error(`README.md contains more than one "${endMarker}" marker.`);
  }
  if (end < start) {
    throw new Error(`Markers are reversed: "${startMarker}" must precede "${endMarker}".`);
  }

  const repositories = (await fetchAllRepositories())
    .filter(isEligible)
    .sort((a, b) => {
      const timeA = new Date(a.pushed_at ?? a.updated_at).getTime();
      const timeB = new Date(b.pushed_at ?? b.updated_at).getTime();
      return timeB - timeA;
    });

  const rows = renderRows(repositories);
  const currentBlock = readme.slice(start + startMarker.length, end);

  if (currentBlock === `\n${rows}\n`) {
    console.log(
      `Public projects table is already current (${repositories.length} eligible repositories). No write performed.`,
    );
    return;
  }

  const updatedReadme = `${readme.slice(0, start + startMarker.length)}\n${rows}\n${readme.slice(end)}`;
  await fs.writeFile(readmePath, updatedReadme, 'utf8');
  console.log(
    `Updated public projects table with ${repositories.length} eligible repositories (sorted by pushed_at, descending).`,
  );
}

main().catch((error) => {
  console.error(`update-public-projects: ${error.message}`);
  process.exit(1);
});
