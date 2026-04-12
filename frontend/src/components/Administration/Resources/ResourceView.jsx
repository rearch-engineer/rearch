import React from 'react';
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Box,
  Chip,
  Stack,
} from '@mui/joy';

function ResourceView({ open, onClose, resource }) {
  if (!resource) return null;

  const renderDataDetails = () => {
    if (resource.provider === 'bitbucket') {
      return (
        <Stack spacing={1}>
          <Box>
            <Typography level="body-sm" fontWeight="bold">Workspace:</Typography>
            <Typography level="body-md">{resource.data.workspace}</Typography>
          </Box>
          <Box>
            <Typography level="body-sm" fontWeight="bold">Username:</Typography>
            <Typography level="body-md">{resource.data.username}</Typography>
          </Box>
        </Stack>
      );
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ minWidth: 500 }}>
        <ModalClose />
        <Typography level="h4" sx={{ mb: 2 }}>
          Resource Details
        </Typography>

        <Stack spacing={2}>
          <Box>
            <Typography level="body-sm" fontWeight="bold">Name:</Typography>
            <Typography level="h5">{resource.name}</Typography>
          </Box>

          <Box>
            <Typography level="body-sm" fontWeight="bold">Provider:</Typography>
            <Chip color="primary" variant="soft" sx={{ mt: 0.5 }}>
              {resource.provider}
            </Chip>
          </Box>

          <Box>
            <Typography level="body-sm" fontWeight="bold">Created:</Typography>
            <Typography level="body-md">
              {new Date(resource.createdAt).toLocaleString()}
            </Typography>
          </Box>

          <Box>
            <Typography level="body-sm" fontWeight="bold">Last Updated:</Typography>
            <Typography level="body-md">
              {new Date(resource.updatedAt).toLocaleString()}
            </Typography>
          </Box>

          <Box sx={{ mt: 2 }}>
            <Typography level="body-sm" fontWeight="bold" sx={{ mb: 1 }}>
              Data:
            </Typography>
            {renderDataDetails()}
          </Box>
        </Stack>
      </ModalDialog>
    </Modal>
  );
}

export default ResourceView;
