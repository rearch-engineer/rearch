import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Box } from '@mui/joy';
import ResourceListPage from '../components/Resources/ResourceListPage';
import ResourceTypeSelection from '../components/Resources/ResourceTypeSelection';
import ResourceFormPage from '../components/Resources/ResourceFormPage';
import ResourceDetailsPage from '../components/Resources/ResourceDetailsPage';
import SubResourceDetailsPage from '../components/Resources/SubResourceDetailsPage';
import SubResourcesListPage from '../components/Resources/SubResourcesListPage';
import BitbucketResourceForm from '../components/Resources/SubResources/Bitbucket/BitbucketResourceForm';
import '../App.css';

function ResourcesPage() {
  return (
    <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <Routes>
        <Route path="/" element={<ResourceListPage />} />
        <Route path="/new" element={<ResourceTypeSelection />} />
        <Route path="/new/bitbucket" element={<BitbucketResourceForm />} />
        <Route path="/:id" element={<ResourceDetailsPage />} />
        <Route path="/:id/edit" element={<ResourceFormPage />} />
        <Route path="/:id/subresources" element={<SubResourcesListPage />} />
        <Route path="/:id/subresources/:subId" element={<SubResourceDetailsPage />} />
      </Routes>
    </Box>
  );
}

export default ResourcesPage;
