import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Typography, Button } from '@mui/joy';
import { ArrowBack } from '@mui/icons-material';
import { api } from '../../../api/client';
import BitbucketRepositoryDetails from './SubResources/Bitbucket/BitbucketRepositoryDetails';

function SubResourceDetailsPage() {
  const navigate = useNavigate();
  const { id, subId } = useParams();
  const [subResource, setSubResource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    const loadSubResource = async () => {
      try {
        setLoading(true);
        setError(null);
        const foundSubResource = await api.getSubResource(id, subId);
        if (foundSubResource) {
          setSubResource(foundSubResource);
        } else {
          setError('Subresource not found');
        }
      } catch (error) {
        console.error('Error loading subresource:', error);
        setError(error.message || 'Failed to load subresource');
      } finally {
        setLoading(false);
      }
    };

    if (id && subId) {
      loadSubResource();
    }
  }, [id, subId]);

  const handleSubResourceUpdate = (updatedSubResource) => {
    setSubResource(updatedSubResource);
  };

  const handleDelete = async () => {
    if (!subResource) return;
    try {
      setDeleting(true);
      setDeleteError(null);
      await api.deleteSubResource(subResource.resource, subResource._id);
      navigate(`/administration/resources/${subResource.resource}/subresources`);
    } catch (err) {
      setDeleteError(err.response?.data?.error || err.message || 'Failed to delete subresource');
    } finally {
      setDeleting(false);
    }
  };

  const renderSubResourceDetails = () => {
    if (!subResource) return null;

    switch (subResource.type) {
      case 'bitbucket-repository':
        return (
          <BitbucketRepositoryDetails
            subResource={subResource}
            onUpdate={handleSubResourceUpdate}
            onDelete={handleDelete}
            deleting={deleting}
            deleteError={deleteError}
          />
        );
      default:
        return (
          <Box sx={{ textAlign: 'center', mt: 4 }}>
            <Typography level="body-lg" sx={{ color: 'var(--text-secondary)' }}>
              Unknown subresource type: {subResource.type}
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
        <Typography level="body-lg">Loading subresource...</Typography>
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
          onClick={() => navigate(`/administration/resources/${id}/subresources`)}
        >
          Back to list
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
      {renderSubResourceDetails()}
    </Box>
  );
}

export default SubResourceDetailsPage;
