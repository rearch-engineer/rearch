import React, { useState } from 'react';
import { Input, Button, List, ListItem, ListItemButton, Typography, CircularProgress, Stack, Chip } from '@mui/joy';
import { Search } from '@mui/icons-material';
import { api } from '../../../../api/client';
import { useToast } from '../../../../contexts/ToastContext';

function JiraImportForm({ resource, onImportSuccess }) {
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.warning('Please enter a search query');
      return;
    }

    try {
      setSearching(true);
      const results = await api.searchSubResources(resource._id, searchQuery);
      setSearchResults(results);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to search tickets');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleImport = async (result) => {
    try {
      setImporting(result.externalId);
      await api.importSubResource(resource._id, {
        externalId: result.externalId,
        name: result.name,
        type: result.type
      });
      onImportSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to import ticket');
    } finally {
      setImporting(null);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <Stack spacing={2}>
      <Typography level="body-sm" color="neutral">
        Search for Jira tickets to import
      </Typography>

      <Stack direction="row" spacing={1}>
        <Input
          placeholder="Search tickets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={handleKeyPress}
          startDecorator={<Search />}
          sx={{ flex: 1 }}
          disabled={searching}
        />
        <Button
          onClick={handleSearch}
          loading={searching}
          disabled={!searchQuery.trim()}
        >
          Search
        </Button>
      </Stack>

      {searchResults.length > 0 && (
        <List
          sx={{
            maxHeight: 300,
            overflow: 'auto',
            '--ListItem-paddingY': '8px',
          }}
        >
          {searchResults.map((result) => (
            <ListItem key={result.externalId}>
              <ListItemButton
                onClick={() => handleImport(result)}
                disabled={importing !== null}
                sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <Stack spacing={0.5} sx={{ flex: 1 }}>
                  <Typography level="body-sm" fontWeight="md">
                    {result.name}
                  </Typography>
                  <Typography level="body-xs" color="neutral">
                    {result.humanReadableId || result.externalId}
                  </Typography>
                </Stack>
                {importing === result.externalId ? (
                  <CircularProgress size="sm" />
                ) : (
                  <Chip size="sm" variant="soft" color="primary">
                    Import
                  </Chip>
                )}
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}

      {!searching && searchResults.length === 0 && searchQuery && (
        <Typography level="body-sm" color="neutral" textAlign="center" sx={{ py: 2 }}>
          No tickets found
        </Typography>
      )}
    </Stack>
  );
}

export default JiraImportForm;
