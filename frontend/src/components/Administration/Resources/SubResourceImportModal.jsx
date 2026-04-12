import React from 'react';
import { Modal, ModalDialog, ModalClose, Typography } from '@mui/joy';
import BitbucketImportForm from './SubResources/Bitbucket/BitbucketImportForm';

function SubResourceImportModal({ open, onClose, resource, onImportSuccess }) {
  if (!resource) return null;

  const getTitle = () => {
    switch (resource.provider) {
      case 'bitbucket':
        return 'Import Repository';
      default:
        return 'Import Sub-resource';
    }
  };

  const renderForm = () => {
    switch (resource.provider) {
      case 'bitbucket':
        return <BitbucketImportForm resource={resource} onImportSuccess={onImportSuccess} />;
      default:
        return (
          <Typography level="body-sm" color="neutral">
            Import not supported for this resource type
          </Typography>
        );
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ minWidth: 500, maxWidth: 600 }}>
        <ModalClose />
        <Typography level="h4" sx={{ mb: 2 }}>
          {getTitle()}
        </Typography>
        {renderForm()}
      </ModalDialog>
    </Modal>
  );
}

export default SubResourceImportModal;
