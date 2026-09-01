const owner = 'leosand';
const startMarker = '<!-- projects:start -->';
const endMarker = '<!-- projects:end -->';

async function fetchPublicRepositories() {
  const repositories = [];
  for (let page = 1; ; page += 1) {
    const response = await fetch(`https://api.github.com/users/${owner}/repos?per_page=100&page=${page}&sort=updated`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `${owner}-profile-project-sync`,
      },
    });
    if (!response.ok) throw new Error(`GitHub API failed: ${response.status}`);
    const pageRepositories = await response.json();
    if (!Array.isArray(pageRepositories) || pageRepositories.length === 0) break;
    repositories.push(...pageRepositories);
    if (pageRepositories.length < 100) break;
  }
  return repositories
    .filter((repository) => repository.owner?.login === owner)
    .filter((repository) => repository.visibility === 'public')
    .filter((repository) => !repository.private && !repository.archived && !repository.disabled && !repository.fork)
    .sort((a, b) => new Date(b.pushed_at ?? b.updated_at).getTime() - new Date(a.pushed_at ?? a.updated_at).getTime());
}

function render(repositories) {
  const rows = repositories.map((repository) => {
    const language = repository.language ? ` · ${repository.language}` : '';
    const license = repository.license?.spdx_id && repository.license.spdx_id !== 'NOASSERTION'
      ? ` · ${repository.license.spdx_id}`
      : '';
    const description = repository.description?.replace(/[\\r\\n]+/g, ' ').trim() || 'Open-source project';
    return `- [${repository.name}](${repository.html_url}) — ${description}${language}${license}`;
  });
  return `${startMarker}\n## Open-source projects\n\n> Automatically synchronized daily from public GitHub repositories.\n\n${rows.join('\\n')}\n${endMarker}`;
}

const fs = await import('node:fs/promises');
const readmePath = 'README.md';
const readme = await fs.readFile(readmePath, 'utf8');
const start = readme.indexOf(startMarker);
const end = readme.indexOf(endMarker);
if (start === -1 || end === -1 || end < start) {
  throw new Error(`README.md must contain ${startMarker} and ${endMarker}`);
}
const replacement = render(await fetchPublicRepositories());
const updatedReadme = `${readme.slice(0, start)}${replacement}${readme.slice(end + endMarker.length)}`;
await fs.writeFile(readmePath, updatedReadme, 'utf8');
