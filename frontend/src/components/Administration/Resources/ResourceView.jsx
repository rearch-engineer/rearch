import React from 'react';
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("Administration");
  if (!resource) return null;

  const renderDataDetails = () => {
    if (resource.provider === 'bitbucket') {
      return (
        <Stack spacing={1}>
          <Box>
            <Typography level="body-sm" fontWeight="bold">{t("resourceView.workspace")}</Typography>
            <Typography level="body-md">{resource.data.workspace}</Typography>
          </Box>
          <Box>
            <Typography level="body-sm" fontWeight="bold">{t("resourceView.username")}</Typography>
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
          {t("resourceView.resourceDetails")}
        </Typography>

        <Stack spacing={2}>
          <Box>
            <Typography level="body-sm" fontWeight="bold">{t("resourceView.name")}</Typography>
            <Typography level="h5">{resource.name}</Typography>
          </Box>

          <Box>
            <Typography level="body-sm" fontWeight="bold">{t("resourceView.provider")}</Typography>
            <Chip color="primary" variant="soft" sx={{ mt: 0.5 }}>
              {resource.provider}
            </Chip>
          </Box>

          <Box>
            <Typography level="body-sm" fontWeight="bold">{t("resourceView.created")}</Typography>
            <Typography level="body-md">
              {new Date(resource.createdAt).toLocaleString()}
            </Typography>
          </Box>

          <Box>
            <Typography level="body-sm" fontWeight="bold">{t("resourceView.lastUpdated")}</Typography>
            <Typography level="body-md">
              {new Date(resource.updatedAt).toLocaleString()}
            </Typography>
          </Box>

          <Box sx={{ mt: 2 }}>
            <Typography level="body-sm" fontWeight="bold" sx={{ mb: 1 }}>
              {t("resourceView.data")}
            </Typography>
            {renderDataDetails()}
          </Box>
        </Stack>
      </ModalDialog>
    </Modal>
  );
}

export default ResourceView;
