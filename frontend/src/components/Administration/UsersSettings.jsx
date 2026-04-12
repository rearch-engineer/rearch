import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  Typography,
  FormControl,
  Input,
  Select,
  Option,
  Stack,
  IconButton,
  Table,
  Chip,
  Modal,
  ModalDialog,
  ModalClose,
  Checkbox,
} from "@mui/joy";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import BlockIcon from "@mui/icons-material/Block";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import SearchIcon from "@mui/icons-material/Search";
import { api } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";

const STATUS_CONFIG = {
  active: {
    color: "success",
    icon: <CheckCircleIcon fontSize="small" />,
    label: "Active",
  },
  suspended: {
    color: "danger",
    icon: <BlockIcon fontSize="small" />,
    label: "Suspended",
  },
  pending_verification: {
    color: "warning",
    icon: <HourglassEmptyIcon fontSize="small" />,
    label: "Pending",
  },
};

const AVAILABLE_ROLES = ["user", "admin"];

export default function UsersSettings() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({
    status: "",
    roles: [],
    display_name: "",
  });

  const loadUsers = useCallback(
    async (page = 1) => {
      try {
        setLoading(true);
        const params = { page, limit: 20 };
        if (search) params.search = search;
        if (statusFilter) params.status = statusFilter;
        const data = await api.getUsers(params);
        setUsers(data.users);
        setPagination(data.pagination);
      } catch (err) {
        toast.error(
          "Failed to load users: " + (err.response?.data?.error || err.message),
        );
      } finally {
        setLoading(false);
      }
    },
    [search, statusFilter],
  );

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSearch = (e) => {
    e.preventDefault();
    loadUsers(1);
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setEditForm({
      status: user.account.status,
      roles: [...(user.auth?.roles || [])],
      display_name: user.profile?.display_name || "",
    });
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    try {
      await api.updateUser(editingUser._id, editForm);
      setEditModalOpen(false);
      setEditingUser(null);
      loadUsers(pagination.page);
    } catch (err) {
      toast.error(
        "Failed to update user: " + (err.response?.data?.error || err.message),
      );
    }
  };

  const handleQuickActivate = async (user) => {
    try {
      await api.updateUser(user._id, { status: "active" });
      loadUsers(pagination.page);
    } catch (err) {
      toast.error(
        "Failed to activate user: " +
          (err.response?.data?.error || err.message),
      );
    }
  };

  const handleQuickSuspend = async (user) => {
    try {
      await api.updateUser(user._id, { status: "suspended" });
      loadUsers(pagination.page);
    } catch (err) {
      toast.error(
        "Failed to suspend user: " + (err.response?.data?.error || err.message),
      );
    }
  };

  const handleDelete = async (user) => {
    if (
      window.confirm(
        `Are you sure you want to delete user "${user.account.email}"? This cannot be undone.`,
      )
    ) {
      try {
        await api.deleteUser(user._id);
        loadUsers(pagination.page);
      } catch (err) {
        toast.error(
          "Failed to delete user: " +
            (err.response?.data?.error || err.message),
        );
      }
    }
  };

  const handleRoleToggle = (role) => {
    setEditForm((prev) => {
      const roles = prev.roles.includes(role)
        ? prev.roles.filter((r) => r !== role)
        : [...prev.roles, role];
      return { ...prev, roles };
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Box
      sx={{
        flex: 1,
        p: { xs: 2, sm: 3, md: 4 },
        bgcolor: "var(--bg-primary)",
        color: "var(--text-primary)",
        overflow: "auto",
      }}
    >
      <Box sx={{ maxWidth: 960, mx: "auto" }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography
            level="h2"
            sx={{
              mb: 1,
              color: "var(--text-primary)",
              fontWeight: 700,
              fontSize: { xs: "1.5rem", md: "1.75rem" },
            }}
          >
            Users
          </Typography>
        </Box>

        {/* Search & filter */}
        <Box sx={{ mb: 3 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems="flex-end"
          >
            <FormControl sx={{ flex: 1 }}>
              <Input
                size="sm"
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                startDecorator={<SearchIcon sx={{ color: "var(--text-secondary)" }} />}
                sx={{
                  bgcolor: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                }}
              />
            </FormControl>
            <FormControl sx={{ minWidth: 160 }}>
              <Select
                size="sm"
                value={statusFilter}
                onChange={(_, val) => setStatusFilter(val || "")}
                placeholder="All statuses"
                sx={{
                  bgcolor: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                }}
              >
                <Option value="">All</Option>
                <Option value="active">Active</Option>
                <Option value="pending_verification">Pending</Option>
                <Option value="suspended">Suspended</Option>
              </Select>
            </FormControl>
          </Stack>
        </Box>

        {/* Users table */}
        <Box
          sx={{
            bgcolor: "var(--bg-primary)",
            overflow: "auto",
          }}
        >
          <Table
            sx={{
              "& thead th": {
                bgcolor: "var(--bg-secondary)",
                color: "var(--text-secondary)",
                fontWeight: 600,
                fontSize: "0.8rem",
                borderBottom: "1px solid var(--border-color)",
              },
              "& tbody tr": {
                borderBottom: "1px solid var(--border-color)",
                "&:last-child": { borderBottom: "none" },
              },
              "& tbody td": { color: "var(--text-primary)" },
            }}
          >
            <thead>
              <tr>
                <th>User</th>
                <th>Status</th>
                <th>Roles</th>
                <th>Last Login</th>
                <th style={{ width: 200 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: "center", padding: "2rem" }}
                  >
                    <Typography
                      level="body-sm"
                      sx={{ color: "var(--text-secondary)" }}
                    >
                      Loading...
                    </Typography>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: "center", padding: "2rem" }}
                  >
                    <Typography
                      level="body-sm"
                      sx={{ color: "var(--text-secondary)" }}
                    >
                      No users found.
                    </Typography>
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const statusCfg =
                    STATUS_CONFIG[user.account.status] ||
                    STATUS_CONFIG.pending_verification;
                  return (
                    <tr key={user._id}>
                      <td>
                        <Box>
                          <Typography
                            level="body-sm"
                            sx={{
                              fontWeight: 600,
                              color: "var(--text-primary)",
                            }}
                          >
                            {user.profile?.display_name ||
                              user.account.username}
                          </Typography>
                          <Typography
                            level="body-xs"
                            sx={{ color: "var(--text-secondary)" }}
                          >
                            {user.account.email}
                          </Typography>
                          <Typography
                            level="body-xs"
                            sx={{ color: "var(--text-tertiary)" }}
                          >
                            @{user.account.username}
                          </Typography>
                        </Box>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          variant="soft"
                          color={statusCfg.color}
                          startDecorator={statusCfg.icon}
                        >
                          {statusCfg.label}
                        </Chip>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap">
                          {(user.auth?.roles || []).map((role) => (
                            <Chip
                              key={role}
                              size="sm"
                              variant="outlined"
                              sx={{
                                borderColor: "var(--border-color)",
                                color: "var(--text-primary)",
                              }}
                            >
                              {role}
                            </Chip>
                          ))}
                        </Stack>
                      </td>
                      <td>
                        <Typography
                          level="body-xs"
                          sx={{ color: "var(--text-secondary)" }}
                        >
                          {formatDate(user.auth?.last_login)}
                        </Typography>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5}>
                          {user.account.status === "pending_verification" && (
                            <Button
                              size="sm"
                              variant="soft"
                              color="success"
                              onClick={() => handleQuickActivate(user)}
                            >
                              Activate
                            </Button>
                          )}
                          {user.account.status === "active" && (
                            <Button
                              size="sm"
                              variant="soft"
                              color="warning"
                              onClick={() => handleQuickSuspend(user)}
                            >
                              Suspend
                            </Button>
                          )}
                          {user.account.status === "suspended" && (
                            <Button
                              size="sm"
                              variant="soft"
                              color="success"
                              onClick={() => handleQuickActivate(user)}
                            >
                              Reactivate
                            </Button>
                          )}
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="neutral"
                            onClick={() => handleEdit(user)}
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="danger"
                            onClick={() => handleDelete(user)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Stack>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </Box>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 2,
              mt: 3,
            }}
          >
            <Button
              size="sm"
              variant="outlined"
              disabled={pagination.page <= 1}
              onClick={() => loadUsers(pagination.page - 1)}
              sx={{
                borderColor: "var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              Previous
            </Button>
            <Typography level="body-sm" sx={{ color: "var(--text-secondary)" }}>
              Page {pagination.page} of {pagination.pages} ({pagination.total}{" "}
              users)
            </Typography>
            <Button
              size="sm"
              variant="outlined"
              disabled={pagination.page >= pagination.pages}
              onClick={() => loadUsers(pagination.page + 1)}
              sx={{
                borderColor: "var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              Next
            </Button>
          </Box>
        )}
      </Box>

      {/* Edit User Modal */}
      <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)}>
        <ModalDialog sx={{ minWidth: 400 }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2, color: "var(--text-primary)" }}>
            Edit User
          </Typography>
          {editingUser && (
            <Stack spacing={2}>
              <Box>
                <Typography
                  level="body-sm"
                  sx={{ fontWeight: 600, color: "var(--text-primary)" }}
                >
                  {editingUser.account.email}
                </Typography>
                <Typography
                  level="body-xs"
                  sx={{ color: "var(--text-secondary)" }}
                >
                  @{editingUser.account.username}
                </Typography>
              </Box>
              <FormControl>
                <FormLabel>Display Name</FormLabel>
                <Input
                  value={editForm.display_name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, display_name: e.target.value })
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>Status</FormLabel>
                <Select
                  value={editForm.status}
                  onChange={(_, val) =>
                    setEditForm({ ...editForm, status: val })
                  }
                >
                  <Option value="active">Active</Option>
                  <Option value="pending_verification">
                    Pending Verification
                  </Option>
                  <Option value="suspended">Suspended</Option>
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Roles</FormLabel>
                <Stack spacing={1}>
                  {AVAILABLE_ROLES.map((role) => (
                    <Checkbox
                      key={role}
                      label={role}
                      checked={editForm.roles.includes(role)}
                      onChange={() => handleRoleToggle(role)}
                    />
                  ))}
                </Stack>
              </FormControl>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button
                  variant="outlined"
                  color="neutral"
                  onClick={() => setEditModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveEdit}>Save Changes</Button>
              </Stack>
            </Stack>
          )}
        </ModalDialog>
      </Modal>
    </Box>
  );
}
