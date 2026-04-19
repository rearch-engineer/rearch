import { useState } from 'react';
import { Box, Button, Input, Typography, Sheet, FormControl, FormLabel, FormHelperText } from '@mui/joy';

/**
 * Shown only inside Tauri when no server has been configured yet.
 * Lets the user enter their ReArch server URL, persists it via the
 * Tauri store plugin, and reloads the app.
 */
export default function ServerSetupPage() {
  const [serverUrl, setServerUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    const trimmed = serverUrl.trim().replace(/\/+$/, '');
    if (!trimmed) {
      setError('Please enter a server URL');
      return;
    }

    try {
      new URL(trimmed);
    } catch {
      setError('Please enter a valid URL (e.g. https://rearch.example.com)');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_server_config', {
        apiBaseUrl: `${trimmed}/api`,
        socketUrl: trimmed,
      });
      // Reload so the app picks up the new config
      window.location.reload();
    } catch (e) {
      setError(`Failed to save: ${e}`);
      setSaving(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        width: '100vw',
        bgcolor: 'background.body',
      }}
    >
      <Sheet
        variant="outlined"
        sx={{
          p: 4,
          borderRadius: 'md',
          maxWidth: 460,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Typography level="h3">Welcome to ReArch</Typography>
        <Typography level="body-md" sx={{ color: 'text.secondary' }}>
          Enter the URL of your ReArch server to get started.
        </Typography>

        <FormControl error={!!error}>
          <FormLabel>Server URL</FormLabel>
          <Input
            placeholder="https://rearch.example.com"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            disabled={saving}
            autoFocus
          />
          {error && <FormHelperText>{error}</FormHelperText>}
        </FormControl>

        <Button
          onClick={handleSave}
          loading={saving}
          sx={{ mt: 1 }}
        >
          Connect
        </Button>
      </Sheet>
    </Box>
  );
}
