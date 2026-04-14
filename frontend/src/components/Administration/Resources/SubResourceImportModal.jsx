import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ModalDialog, ModalClose, Typography } from '@mui/joy';
import BitbucketImportForm from './SubResources/Bitbucket/BitbucketImportForm';
import GithubImportForm from './SubResources/Github/GithubImportForm';

function SubResourceImportModal({ open, onClose, resource, onImportSuccess }) {
  const { t } = useTranslation("Administration");
  if (!resource) return null;

  const getTitle = () => {
    switch (resource.provider) {
      case 'bitbucket':
      case 'github':
        return t('subResourceImport.importRepository');
      default:
        return t('subResourceImport.importSubresource');
    }
  };

  const renderForm = () => {
    switch (resource.provider) {
      case 'bitbucket':
        return <BitbucketImportForm resource={resource} onImportSuccess={onImportSuccess} />;
      case 'github':
        return <GithubImportForm resource={resource} onImportSuccess={onImportSuccess} />;
      default:
        return (
          <Typography level="body-sm" color="neutral">
            {t('subResourceImport.notSupported')}
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
