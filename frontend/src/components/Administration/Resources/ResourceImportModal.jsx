import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ModalDialog, ModalClose, Typography } from '@mui/joy';
import BitbucketImportForm from './Providers/Bitbucket/BitbucketImportForm';
import GithubImportForm from './Providers/Github/GithubImportForm';

function ResourceImportModal({ open, onClose, connection, onImportSuccess }) {
  const { t } = useTranslation("Administration");
  if (!connection) return null;

  const getTitle = () => {
    switch (connection.provider) {
      case 'bitbucket':
      case 'github':
        return t('subResourceImport.importRepository');
      default:
        return t('subResourceImport.importSubresource');
    }
  };

  const renderForm = () => {
    switch (connection.provider) {
      case 'bitbucket':
        return <BitbucketImportForm connection={connection} onImportSuccess={onImportSuccess} />;
      case 'github':
        return <GithubImportForm connection={connection} onImportSuccess={onImportSuccess} />;
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

export default ResourceImportModal;
