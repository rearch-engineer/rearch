import { searchRepositories } from "../../../utils/github/github.js";

export default async function onSearch(connection, query) {
  console.log(`[GitHub Search Hook] Searching GitHub repositories`);
  console.log(`[GitHub Search Hook] Query:`, query);

  const searchTerm = query && query.query ? query.query : "";

  try {
    const searchResults = await searchRepositories(
      connection.data,
      searchTerm,
    );

    const results = searchResults.repositories.map((repo) => ({
      kind: "repository",
      provider: "github",
      externalId: repo.fullName, // owner/repo format
      humanReadableId: repo.fullName,
      name: repo.name,
    }));

    return results;
  } catch (error) {
    console.error(`[GitHub Search Hook] Error:`, error);
    throw error;
  }
}
