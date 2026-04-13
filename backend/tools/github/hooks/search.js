import { searchRepositories } from "../../../utils/github/github.js";

export default async function onSearch(parentResource, query) {
  console.log(`[GitHub Search Hook] Searching GitHub repositories`);
  console.log(`[GitHub Search Hook] Query:`, query);

  const searchTerm = query && query.query ? query.query : "";

  try {
    const searchResults = await searchRepositories(
      parentResource.data,
      searchTerm,
    );

    const results = searchResults.repositories.map((repo) => ({
      type: "github-repository",
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
