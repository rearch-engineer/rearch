import React, { useState, useEffect } from 'react';
import { Box, Typography, Sheet } from '@mui/joy';

import MarkdownRenderer from '../MarkdownRenderer';
import { useToast } from '../../contexts/ToastContext';

export default function HelpContent() {
  const toast = useToast();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {

    const loadHelp = async () => {
      try {
        const response = await fetch('/help.md');
        if (!response.ok) {
          throw new Error('Failed to load help content.');
        }
        const text = await response.text();
        setContent(text);
      } catch (err) {
        setError(true);
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    };
    loadHelp();
  }, []);

  return (
    <Box
      sx={{
        flex: 1,
        p: { xs: 2, sm: 3, md: 4 },
        bgcolor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        overflow: 'auto',
      }}
    >
      <Box sx={{ maxWidth: 960, mx: 'auto' }}>
        <Box sx={{ mb: 4 }}>
          <Typography
            level="h2"
            sx={{ mb: 1, color: 'var(--text-primary)', fontWeight: 700, fontSize: { xs: '1.5rem', md: '1.75rem' } }}
          >
            Help
          </Typography>
        </Box>

        {loading && (
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Loading help content...
          </Typography>
        )}

        {!loading && !error && (
          <Sheet
            variant="plain"
            sx={{
              bgcolor: 'transparent',
              '& .markdown-content': {
                lineHeight: 1.7,
              },
              '& .markdown-content p': {
                mb: 2,
              },
              '& .markdown-content h1, & .markdown-content h2, & .markdown-content h3': {
                mt: 3,
                mb: 1.5,
              },
              '& .markdown-content li': {
                mb: 0.75,
              },
            }}
          >
            <MarkdownRenderer content={content} />
          </Sheet>
        )}
      </Box>
    </Box>
  );
}
