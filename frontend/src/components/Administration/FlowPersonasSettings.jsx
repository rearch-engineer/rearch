import React, { useState, useEffect } from 'react';
import {
  Box, Button, Typography, Card, FormControl, FormLabel,
  Input, Textarea, Checkbox, Stack, IconButton, Table, Chip,
  Modal, ModalDialog, ModalClose,
} from '@mui/joy';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { api } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';

const EMPTY_FORM = { title: '', slug: '', systemPrompt: '', prompt: '', code: false, active: true };

export default function FlowPersonasSettings() {
  const toast = useToast();
  const [personas, setPersonas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadPersonas(); }, []);

  const loadPersonas = async () => {
    try {
      setLoading(true);
      const data = await api.getFlowPersonas();
      setPersonas(data);
    } catch (err) {
      toast.error('Failed to load flow personas: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (persona) => {
    setEditingId(persona._id);
    setFormData({
      title: persona.title,
      slug: persona.slug,
      systemPrompt: persona.systemPrompt,
      prompt: persona.prompt,
      code: persona.code,
      active: persona.active !== undefined ? persona.active : true,
    });
    setModalOpen(true);
  };

  const handleClose = () => {
    setModalOpen(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.slug.toLowerCase() === 'description') {
      toast.error('Slug cannot be "description" as it is a reserved word');
      return;
    }
    if (!/^[a-z0-9_-]+$/.test(formData.slug)) {
      toast.error('Slug must contain only lowercase letters, numbers, hyphens, and underscores');
      return;
    }
    try {
      setSaving(true);
      if (editingId) {
        await api.updateFlowPersona(editingId, formData);
      } else {
        await api.createFlowPersona(formData);
      }
      handleClose();
      loadPersonas();
    } catch (err) {
      toast.error('Failed to save flow persona: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this flow persona?')) {
      try {
        await api.deleteFlowPersona(id);
        loadPersonas();
      } catch (err) {
        toast.error('Failed to delete flow persona: ' + err.message);
      }
    }
  };

  if (loading) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'var(--bg-primary)' }}>
        <Typography level="body-lg" sx={{ color: 'var(--text-secondary)' }}>Loading...</Typography>
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
        {/* Header */}
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2} sx={{ mb: 4 }}>
          <Box>
            <Typography
              level="h2"
              sx={{ mb: 1, color: 'var(--text-primary)', fontWeight: 700, fontSize: { xs: '1.5rem', md: '1.75rem' } }}
            >
              Flow Personas
            </Typography>
            <Typography level="body-lg" sx={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>
              Configure AI personas that guide conversation flows with custom prompts and behaviours.
            </Typography>
          </Box>
          <Button
            variant="solid"
            color="primary"
            startDecorator={<AddIcon />}
            onClick={openCreate}
            sx={{ flexShrink: 0, mt: 0.5 }}
          >
            Add Persona
          </Button>
        </Stack>

        {/* Table card */}
        <Card variant="outlined" sx={{ borderColor: 'var(--border-color)', bgcolor: 'var(--bg-primary)', overflow: 'auto' }}>
          {personas.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography level="body-lg" sx={{ color: 'var(--text-secondary)', mb: 1 }}>
                No flow personas configured
              </Typography>
              <Typography level="body-sm" sx={{ color: 'var(--text-tertiary)', mb: 3 }}>
                Add a persona to guide your conversation flows.
              </Typography>
              <Button variant="soft" color="primary" startDecorator={<AddIcon />} onClick={openCreate}>
                Add Persona
              </Button>
            </Box>
          ) : (
            <Table
              sx={{
                '& thead th': {
                  bgcolor: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  borderBottom: '1px solid var(--border-color)',
                },
                '& tbody tr': {
                  borderBottom: '1px solid var(--border-color)',
                  '&:last-child': { borderBottom: 'none' },
                },
                '& tbody td': { color: 'var(--text-primary)' },
              }}
            >
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Slug</th>
                  <th>System Prompt</th>
                  <th>Prompt</th>
                  <th>Flags</th>
                  <th style={{ width: 100 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {personas.map((persona) => (
                  <tr key={persona._id}>
                    <td>
                      <Typography level="body-sm" sx={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {persona.title}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm" sx={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                        {persona.slug || '—'}
                      </Typography>
                    </td>
                    <td>
                      <Typography
                        level="body-sm"
                        sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}
                      >
                        {persona.systemPrompt || '—'}
                      </Typography>
                    </td>
                    <td>
                      <Typography
                        level="body-sm"
                        sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}
                      >
                        {persona.prompt || '—'}
                      </Typography>
                    </td>
                    <td>
                      <Stack direction="row" spacing={0.5}>
                        {persona.code && (
                          <Chip size="sm" variant="soft" color="primary" sx={{ fontSize: '0.7rem', height: '20px' }}>Code</Chip>
                        )}
                        <Chip
                          size="sm"
                          variant="soft"
                          color={persona.active !== false ? 'success' : 'neutral'}
                          sx={{ fontSize: '0.7rem', height: '20px' }}
                        >
                          {persona.active !== false ? 'Active' : 'Inactive'}
                        </Chip>
                      </Stack>
                    </td>
                    <td>
                      <Stack direction="row" spacing={0.5}>
                        <IconButton size="sm" variant="plain" color="neutral" onClick={() => openEdit(persona)}>
                          <EditIcon />
                        </IconButton>
                        <IconButton size="sm" variant="plain" color="danger" onClick={() => handleDelete(persona._id)}>
                          <DeleteIcon />
                        </IconButton>
                      </Stack>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </Box>

      {/* Create / Edit modal */}
      <Modal open={modalOpen} onClose={handleClose}>
        <ModalDialog
          variant="outlined"
          sx={{
            width: { xs: '95vw', sm: 560 },
            maxHeight: '90vh',
            overflowY: 'auto',
            bgcolor: 'var(--bg-primary)',
            borderColor: 'var(--border-color)',
          }}
        >
          <ModalClose />
          <Typography level="title-lg" sx={{ mb: 2, fontWeight: 700, color: 'var(--text-primary)' }}>
            {editingId ? 'Edit Flow Persona' : 'Add Flow Persona'}
          </Typography>

          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <FormControl required sx={{ flex: 1 }}>
                  <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>Title</FormLabel>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g. Security Reviewer"
                    sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
                  />
                </FormControl>
                <FormControl required sx={{ flex: 1 }}>
                  <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>Slug</FormLabel>
                  <Input
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
                    placeholder="e.g. security-review"
                    sx={{ fontFamily: 'monospace', bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
                  />
                </FormControl>
              </Stack>

              <Stack direction="row" spacing={3}>
                <Checkbox
                  label="Code mode"
                  checked={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.checked })}
                />
                <Checkbox
                  label="Active"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                />
              </Stack>

              {!formData.code && (
                <FormControl>
                  <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>System Prompt</FormLabel>
                  <Textarea
                    value={formData.systemPrompt}
                    onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                    placeholder="Enter system prompt"
                    minRows={3}
                    sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
                  />
                </FormControl>
              )}

              <FormControl>
                <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>Prompt</FormLabel>
                <Textarea
                  value={formData.prompt}
                  onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                  placeholder="Enter prompt"
                  minRows={3}
                  sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
                />
              </FormControl>

              <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ pt: 1 }}>
                <Button variant="outlined" color="neutral" onClick={handleClose} sx={{ borderColor: 'var(--border-color)' }}>
                  Cancel
                </Button>
                <Button type="submit" variant="solid" color="primary" loading={saving} startDecorator={editingId ? <EditIcon /> : <AddIcon />}>
                  {editingId ? 'Save Changes' : 'Add Persona'}
                </Button>
              </Stack>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
