import { searchRepositories } from '../../../utils/attlasian/bitbucket.js';

export default async function onSearch(connection, query) {
  console.log(`[Bitbucket Search Hook] Searching in Bitbucket workspace: ${connection.data?.workspace}`);
  console.log(`[Bitbucket Search Hook] Query:`, query);

  const searchTerm = query && query.query ? query.query : '';
  const workspace = connection.data?.workspace;

  if (!workspace) {
    throw new Error('Bitbucket workspace is required');
  }

  try {
    // Search for repositories in the workspace
    const searchResults = await searchRepositories(connection.data, workspace, searchTerm);

    // Return searchResults.repositories as resources with type='bitbucket-repository'
    const results = searchResults.repositories.map(repo => ({
      kind: 'repository',
      provider: 'bitbucket',
      externalId: repo.slug,
      humanReadableId: repo.fullName,
      name: repo.name,
    }));

    return results;
  } catch (error) {
    console.error(`[Bitbucket Search Hook] Error:`, error);
    throw error;
  }
}
