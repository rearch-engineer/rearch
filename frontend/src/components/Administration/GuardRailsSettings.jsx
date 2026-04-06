import React, { useState, useEffect } from 'react';
import {
  Box, Button, Typography, Card, FormControl, FormLabel,
  Input, Checkbox, Stack, IconButton, Table,
  Modal, ModalDialog, ModalClose,
} from '@mui/joy';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { api } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';

const EMPTY_FORM = { regularExpression: '', reject: false, replaceWith: '' };

export default function GuardRailsSettings() {
  const toast = useToast();
  const [guardRails, setGuardRails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadGuardRails(); }, []);

  const loadGuardRails = async () => {
    try {
      setLoading(true);
      const data = await api.getGuardRails();
      setGuardRails(data);
    } catch (err) {
      toast.error('Failed to load guard rails: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (guardRail) => {
    setEditingId(guardRail._id);
    setFormData({
      regularExpression: guardRail.regularExpression,
      reject: guardRail.reject,
      replaceWith: guardRail.replaceWith,
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
    try {
      setSaving(true);
      if (editingId) {
        await api.updateGuardRail(editingId, formData);
      } else {
        await api.createGuardRail(formData);
      }
      handleClose();
      loadGuardRails();
    } catch (err) {
      toast.error('Failed to save guard rail: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this guard rail?')) {
      try {
        await api.deleteGuardRail(id);
        loadGuardRails();
      } catch (err) {
        toast.error('Failed to delete guard rail: ' + err.message);
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
              Guard Rails
            </Typography>
            <Typography level="body-lg" sx={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>
              Define regular expression rules to filter or reject content in conversations.
            </Typography>
          </Box>
          <Button
            variant="solid"
            color="primary"
            startDecorator={<AddIcon />}
            onClick={openCreate}
            sx={{ flexShrink: 0, mt: 0.5 }}
          >
            Add Guard Rail
          </Button>
        </Stack>

        {/* Table card */}
        <Card variant="outlined" sx={{ borderColor: 'var(--border-color)', bgcolor: 'var(--bg-primary)', overflow: 'auto' }}>
          {guardRails.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography level="body-lg" sx={{ color: 'var(--text-secondary)', mb: 1 }}>
                No guard rails configured
              </Typography>
              <Typography level="body-sm" sx={{ color: 'var(--text-tertiary)', mb: 3 }}>
                Add a rule to start filtering or rejecting conversation content.
              </Typography>
              <Button variant="soft" color="primary" startDecorator={<AddIcon />} onClick={openCreate}>
                Add Guard Rail
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
                  <th>Regular Expression</th>
                  <th>Action</th>
                  <th>Replace With</th>
                  <th style={{ width: 100 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {guardRails.map((guardRail) => (
                  <tr key={guardRail._id}>
                    <td>
                      <Typography level="body-sm" sx={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                        {guardRail.regularExpression}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm" sx={{ color: guardRail.reject ? '#dc2626' : 'var(--text-secondary)' }}>
                        {guardRail.reject ? 'Reject' : 'Replace'}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm" sx={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                        {guardRail.reject ? '—' : (guardRail.replaceWith || '(empty)')}
                      </Typography>
                    </td>
                    <td>
                      <Stack direction="row" spacing={0.5}>
                        <IconButton size="sm" variant="plain" color="neutral" onClick={() => openEdit(guardRail)}>
                          <EditIcon />
                        </IconButton>
                        <IconButton size="sm" variant="plain" color="danger" onClick={() => handleDelete(guardRail._id)}>
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
            width: { xs: '95vw', sm: 480 },
            bgcolor: 'var(--bg-primary)',
            borderColor: 'var(--border-color)',
          }}
        >
          <ModalClose />
          <Typography level="title-lg" sx={{ mb: 2, fontWeight: 700, color: 'var(--text-primary)' }}>
            {editingId ? 'Edit Guard Rail' : 'Add Guard Rail'}
          </Typography>

          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <FormControl required>
                <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                  Regular Expression
                </FormLabel>
                <Input
                  value={formData.regularExpression}
                  onChange={(e) => setFormData({ ...formData, regularExpression: e.target.value })}
                  placeholder="e.g. \b(?:password|secret)\b"
                  sx={{ fontFamily: 'monospace', bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
                />
              </FormControl>

              <FormControl>
                <Checkbox
                  label="Reject — block the message entirely (if unchecked, matching content will be replaced)"
                  checked={formData.reject}
                  onChange={(e) => setFormData({ ...formData, reject: e.target.checked })}
                />
              </FormControl>

              {!formData.reject && (
                <FormControl>
                  <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                    Replace With
                  </FormLabel>
                  <Input
                    value={formData.replaceWith}
                    onChange={(e) => setFormData({ ...formData, replaceWith: e.target.value })}
                    placeholder="Replacement text (leave empty to remove)"
                    sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
                  />
                </FormControl>
              )}

              <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ pt: 1 }}>
                <Button variant="outlined" color="neutral" onClick={handleClose} sx={{ borderColor: 'var(--border-color)' }}>
                  Cancel
                </Button>
                <Button type="submit" variant="solid" color="primary" loading={saving} startDecorator={editingId ? <EditIcon /> : <AddIcon />}>
                  {editingId ? 'Save Changes' : 'Add Guard Rail'}
                </Button>
              </Stack>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
