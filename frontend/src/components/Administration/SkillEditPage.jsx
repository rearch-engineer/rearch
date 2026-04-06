import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Button, Typography, Card, FormControl, FormLabel,
  Input, Textarea, Stack, Select, Option, IconButton, Switch,
} from '@mui/joy';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { api } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';

export default function SkillEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [skill, setSkill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ title: '', description: '', skillsRepository: '', isDefault: false });
  const [repositorySubResources, setRepositorySubResources] = useState([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    loadSkill();
    loadRepositorySubResources();
  }, [id]);

  const loadSkill = async () => {
    try {
      setLoading(true);
      const data = await api.getSkill(id);
      setSkill(data);
      setFormData({
        title: data.title || '',
        description: data.description || '',
        skillsRepository: data.skillsRepository || '',
        isDefault: data.isDefault || false,
      });
    } catch (err) {
      toast.error('Failed to load skill: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadRepositorySubResources = async () => {
    try {
      const subResources = await api.getAllSubResources('bitbucket-repository');
      setRepositorySubResources(subResources);
    } catch (err) {
      console.error('Failed to load repository subresources:', err);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.updateSkill(id, formData);
      setDirty(false);
      toast.success('Skill saved successfully');
      const updated = await api.getSkill(id);
      setSkill(updated);
    } catch (err) {
      toast.error('Failed to save skill: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'var(--bg-primary)' }}>
        <Typography level="body-lg" sx={{ color: 'var(--text-secondary)' }}>Loading...</Typography>
      </Box>
    );
  }

  if (!skill) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'var(--bg-primary)' }}>
        <Typography level="body-lg" sx={{ color: 'var(--text-secondary)' }}>Skill not found</Typography>
      </Box>
    );
  }

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
        {/* Header with back button */}
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 4 }}>
          <IconButton
            variant="outlined"
            color="neutral"
            size="sm"
            onClick={() => navigate('/administration/skills')}
            sx={{ borderColor: 'var(--border-color)' }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography
              level="h2"
              sx={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: { xs: '1.5rem', md: '1.75rem' } }}
            >
              Edit Skill
            </Typography>
          </Box>
          <Button
            variant="solid"
            color="primary"
            startDecorator={<SaveIcon />}
            onClick={handleSave}
            loading={saving}
            disabled={!dirty}
          >
            Save Changes
          </Button>
        </Stack>

        {/* Title, Description, and Repository */}
        <Card variant="outlined" sx={{ borderColor: 'var(--border-color)', bgcolor: 'var(--bg-primary)', mb: 3, p: 3 }}>
          <Stack spacing={2.5}>
            <FormControl required>
              <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                Title
              </FormLabel>
              <Input
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                placeholder="Enter skill title"
                sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              />
            </FormControl>

            <FormControl required>
              <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                Description
              </FormLabel>
              <Textarea
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder="Enter skill description"
                minRows={4}
                sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              />
            </FormControl>

            <FormControl required>
              <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                Skills Repository
              </FormLabel>
              <Select
                value={formData.skillsRepository}
                onChange={(_, newValue) => handleChange('skillsRepository', newValue || '')}
                placeholder="Select a repository"
                sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              >
                {repositorySubResources.map((r) => (
                  <Option key={r._id} value={r._id}>{r.name}</Option>
                ))}
              </Select>
            </FormControl>

            <FormControl
              orientation="horizontal"
              sx={{ justifyContent: 'space-between', alignItems: 'center' }}
            >
              <Box>
                <FormLabel sx={{ mb: 0, color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                  Default Skill
                </FormLabel>
                <Typography level="body-xs" sx={{ color: 'var(--text-tertiary)' }}>
                  Default skills are cloned into every new conversation
                </Typography>
              </Box>
              <Switch
                checked={formData.isDefault}
                onChange={(e) => handleChange('isDefault', e.target.checked)}
                color={formData.isDefault ? 'success' : 'neutral'}
              />
            </FormControl>
          </Stack>
        </Card>
      </Box>
    </Box>
  );
}
