import { searchTickets, getTicketDetails } from '../../../utils/attlasian/jira.js';

export default async function onSearch(parentResource, query) {
  console.log(`[Jira Search Hook] Searching in Jira: ${JSON.stringify(parentResource)}`);
  console.log(`[Jira Search Hook] Query:`, query);

  const searchTerm = query && query.query ? query.query : null;

  if (searchTerm) {
    try {
      // Search for tickets in Jira using resource data
      const searchResults = await searchTickets(parentResource.data, null, searchTerm);

      // Return searchResults.issues + type='jira-ticket'

      const results = searchResults.issues.map(issue => ({
        type: 'jira-ticket',
        externalId: issue.id,
        humanReadableId: issue.key,
        name: issue.summary,
      }));

      return results;
    } catch (error) {
      console.error(`[Jira Search Hook] Error:`, error);
      throw error;
    }
  }
}
