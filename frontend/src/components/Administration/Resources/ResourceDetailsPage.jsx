import React, { useState, useEffect } from 'react';
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Typography, Button } from '@mui/joy';
import { ArrowBack } from '@mui/icons-material';
import { api } from '../../../api/client';
import BitbucketRepositoryDetails from './Providers/Bitbucket/BitbucketRepositoryDetails';
import GithubRepositoryDetails from './Providers/Github/GithubRepositoryDetails';

function ResourceDetailsPage() {
  const { t } = useTranslation("Administration");
  const navigate = useNavigate();
  const { id, subId } = useParams();
  const [resource, setResource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    const loadResource = async () => {
      try {
        setLoading(true);
        setError(null);
        const foundResource = await api.getAdminResource(id, subId);
        if (foundResource) {
          setResource(foundResource);
        } else {
          setError(t("subResourceDetails.subresourceNotFound"));
        }
      } catch (error) {
        console.error('Error loading resource:', error);
        setError(error.message || t("subResourceDetails.failedToLoadSubresource"));
      } finally {
        setLoading(false);
      }
    };

    if (id && subId) {
      loadResource();
    }
  }, [id, subId]);

  const handleResourceUpdate = (updatedResource) => {
    setResource(updatedResource);
  };

  const handleDelete = async () => {
    if (!resource) return;
    try {
      setDeleting(true);
      setDeleteError(null);
      await api.deleteResource(resource.connection, resource._id);
      navigate(`/administration/resources/connections/${resource.connection}/resources`);
    } catch (err) {
      setDeleteError(err.response?.data?.error || err.message || t("subResourceDetails.failedToLoadSubresource"));
    } finally {
      setDeleting(false);
    }
  };

  const renderResourceDetails = () => {
    if (!resource) return null;

    // Repositories have a provider-specific details view
    switch (resource.kind === "repository" ? resource.provider : null) {
      case 'bitbucket':
        return (
          <BitbucketRepositoryDetails
            resource={resource}
            onUpdate={handleResourceUpdate}
            onDelete={handleDelete}
            deleting={deleting}
            deleteError={deleteError}
          />
        );
      case 'github':
        return (
          <GithubRepositoryDetails
            resource={resource}
            onUpdate={handleResourceUpdate}
            onDelete={handleDelete}
            deleting={deleting}
            deleteError={deleteError}
          />
        );
      default:
        return (
          <Box sx={{ textAlign: 'center', mt: 4 }}>
            <Typography level="body-lg" sx={{ color: 'var(--text-secondary)' }}>
              {t("subResourceDetails.unknownSubresourceType", { type: `${resource.provider}-${resource.kind}` })}
            </Typography>
          </Box>
        );
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'var(--bg-primary)',
          color: 'var(--text-primary)',
        }}
      >
        <Typography level="body-lg">{t("subResourceDetails.loadingSubresource")}</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'var(--bg-primary)',
          color: 'var(--text-primary)',
        }}
      >
        <Typography level="body-lg" sx={{ mb: 2 }}>
          {error}
        </Typography>
        <Button
          variant="soft"
          color="neutral"
          startDecorator={<ArrowBack />}
          onClick={() => navigate(`/administration/resources/connections/${id}/resources`)}
        >
          {t("subResourceDetails.backToList")}
        </Button>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flex: 1,
        p: 4,
        bgcolor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        overflow: 'auto',
      }}
    >
      {renderResourceDetails()}
    </Box>
  );
}

export default ResourceDetailsPage;
