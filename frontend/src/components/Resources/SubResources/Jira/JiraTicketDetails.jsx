import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  Chip,
  Stack,
  Card,
  CardContent,
  Select,
  Option,
  FormControl,
  FormLabel,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Textarea,
  IconButton,
} from "@mui/joy";
import { useSkills } from "../../../../contexts/SkillsContext";
import { useResources } from "../../../../contexts/ResourcesContext";
import { useSocket } from "../../../../contexts/SocketContext";
import { api } from "../../../../api/client";
import { useToast } from "../../../../contexts/ToastContext";
import {
  Sync,
  Edit,
  Check,
  Close,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import CircularProgress from "@mui/joy/CircularProgress";
import MarkdownRenderer from "../../../MarkdownRenderer";

function JiraTicketDetails({
  subResource,
  onUpdate,
  onDelete,
  deleting = false,
  deleteError = null,
}) {
  const { data } = subResource;
  const { skills } = useSkills();
  const { resources } = useResources();
  const { socket } = useSocket();
  const toast = useToast();

  const [selectedSkill, setSelectedSkill] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [selectedImplRepo, setSelectedImplRepo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState(null);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState(
    subResource.description || "",
  );
  const [savingDescription, setSavingDescription] = useState(false);

  // Filter resources to get only Bitbucket workspaces
  const repositories = resources.filter(
    (resource) => resource.provider === "bitbucket",
  );

  const handleStartSDLC = async () => {
    // Validation
    if (!selectedSkill) {
      toast.warning("Please select a skill");
      return;
    }
    if (!selectedImplRepo) {
      toast.warning("Please select an implementation repository");
      return;
    }

    setIsLoading(true);

    try {
      const response = await api.executeSubResourceAction(
        subResource.resource,
        subResource._id,
        "implement",
        {
          skill: selectedSkill,
          implementationRepository: selectedImplRepo,
        },
      );

      toast.success(
        `SDLC process started successfully! Job ID: ${response.jobId}`,
      );
    } catch (error) {
      toast.error(
        `Failed to start SDLC process: ${error.response?.data?.error || error.message}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);

    try {
      const response = await api.executeSubResourceAction(
        subResource.resource,
        subResource._id,
        "sync",
      );

      toast.success(`Sync started successfully! Job ID: ${response.jobId}`);
    } catch (error) {
      toast.error(
        `Failed to start Sync: ${error.response?.data?.error || error.message}`,
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveDescription = async () => {
    setSavingDescription(true);
    try {
      const updatedSubResource = await api.updateSubResource(
        subResource.resource,
        subResource._id,
        { description: editedDescription },
      );
      setIsEditingDescription(false);
      if (onUpdate) {
        onUpdate(updatedSubResource);
      }
    } catch (error) {
      toast.error(
        `Failed to save description: ${error.response?.data?.error || error.message}`,
      );
    } finally {
      setSavingDescription(false);
    }
  };

  const handleCancelEditDescription = () => {
    setEditedDescription(subResource.description || "");
    setIsEditingDescription(false);
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    const confirmed = window.confirm(
      "Delete this subresource? This action cannot be undone.",
    );
    if (!confirmed) return;
    await onDelete();
  };

  return (
    <Box sx={{ maxWidth: 800, mx: "auto" }}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
        <Typography level="h2" sx={{ color: "var(--text-primary)" }}>
          {subResource.name}
        </Typography>
        <Chip color="primary" variant="soft" size="lg">
          Jira Ticket
        </Chip>
      </Stack>

      {/* Description Card */}
      <Card variant="outlined" sx={{ bgcolor: "var(--bg-secondary)", mb: 3 }}>
        <CardContent>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ mb: 2 }}
          >
            <Typography level="title-md" sx={{ color: "var(--text-primary)" }}>
              Description
            </Typography>
            {!isEditingDescription && (
              <IconButton
                size="sm"
                variant="plain"
                color="neutral"
                onClick={() => setIsEditingDescription(true)}
              >
                <Edit />
              </IconButton>
            )}
          </Stack>
          {isEditingDescription ? (
            <Stack spacing={2}>
              <Textarea
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                placeholder="Add a description for this subresource..."
                minRows={3}
                maxRows={10}
                sx={{ bgcolor: "var(--bg-primary)" }}
              />
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button
                  size="sm"
                  variant="plain"
                  color="neutral"
                  startDecorator={<Close />}
                  onClick={handleCancelEditDescription}
                  disabled={savingDescription}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="solid"
                  color="primary"
                  startDecorator={<Check />}
                  onClick={handleSaveDescription}
                  loading={savingDescription}
                >
                  Save
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Typography
              level="body-md"
              sx={{
                color: subResource.description
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
                whiteSpace: "pre-wrap",
              }}
            >
              {subResource.description ||
                "No description provided. Click the edit button to add one."}
            </Typography>
          )}
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ bgcolor: "var(--bg-secondary)" }}>
        <CardContent>
          <Typography
            level="title-md"
            sx={{ mb: 2, color: "var(--text-primary)" }}
          >
            Actions
          </Typography>
          <Stack spacing={2}>
            <Button
              variant="solid"
              color="primary"
              startDecorator={
                syncing ? <CircularProgress size="sm" /> : <Sync />
              }
              loading={syncing}
              onClick={handleSync}
              fullWidth
            >
              Sync
            </Button>
            <Button
              variant="solid"
              color="danger"
              startDecorator={<DeleteIcon />}
              loading={deleting}
              onClick={handleDelete}
              fullWidth
            >
              Delete
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ bgcolor: "var(--bg-secondary)", my: 3 }}>
        <CardContent>
          <Accordion
            defaultCollapsed
            sx={{
              bgcolor: "var(--bg-secondary)",
              borderRadius: "sm",
            }}
          >
            <AccordionSummary>
              <Typography
                level="title-lg"
                sx={{
                  color: "var(--text-primary)",
                }}
              >
                SDLC
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2} sx={{ pt: 2 }}>
                <FormControl>
                  <FormLabel>Skill</FormLabel>
                  <Select
                    value={selectedSkill}
                    onChange={(e, newValue) => setSelectedSkill(newValue)}
                    placeholder="Select a skill"
                  >
                    {skills.map((skill) => (
                      <Option key={skill._id} value={skill._id}>
                        {skill.title}
                      </Option>
                    ))}
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel>Implementation Repository</FormLabel>
                  <Select
                    value={selectedImplRepo}
                    onChange={(e, newValue) => setSelectedImplRepo(newValue)}
                    placeholder="Select an implementation repository"
                  >
                    {repositories.length === 0 ? (
                      <Option disabled>No repositories available</Option>
                    ) : (
                      repositories.map((repo) => (
                        <Option key={repo._id} value={repo._id}>
                          {repo.name}
                        </Option>
                      ))
                    )}
                  </Select>
                </FormControl>
              </Stack>
            </AccordionDetails>
          </Accordion>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ bgcolor: "var(--bg-secondary)", mb: 3 }}>
        <CardContent>
          <Typography
            level="title-md"
            sx={{ mb: 2, color: "var(--text-primary)" }}
          >
            Ticket Details
          </Typography>
          <Stack spacing={2}>
            {data?.key && (
              <Box>
                <Typography
                  level="body-sm"
                  fontWeight="bold"
                  sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                >
                  Ticket Key
                </Typography>
                <Typography
                  level="body-lg"
                  sx={{ color: "var(--text-primary)" }}
                >
                  {data?.key}
                </Typography>
              </Box>
            )}
            {data?.summary && (
              <Box>
                <Typography
                  level="body-sm"
                  fontWeight="bold"
                  sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                >
                  Summary
                </Typography>
                <Box
                  sx={{ color: "var(--text-primary)" }}
                  dangerouslySetInnerHTML={{ __html: data?.summary }}
                />
              </Box>
            )}
            {data?.status && (
              <Box>
                <Typography
                  level="body-sm"
                  fontWeight="bold"
                  sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                >
                  Status
                </Typography>
                <Chip color="primary" variant="soft">
                  {data?.status}
                </Chip>
              </Box>
            )}
            {data?.assignee && (
              <Box>
                <Typography
                  level="body-sm"
                  fontWeight="bold"
                  sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                >
                  Assignee
                </Typography>
                <Typography
                  level="body-lg"
                  sx={{ color: "var(--text-primary)" }}
                >
                  {data?.assignee}
                </Typography>
              </Box>
            )}
            {data?.priority && (
              <Box>
                <Typography
                  level="body-sm"
                  fontWeight="bold"
                  sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                >
                  Priority
                </Typography>
                <Typography
                  level="body-lg"
                  sx={{ color: "var(--text-primary)" }}
                >
                  {data?.priority}
                </Typography>
              </Box>
            )}
            {data?.description && (
              <Box class="natural-html">
                <Typography
                  level="body-sm"
                  fontWeight="bold"
                  sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                >
                  Description
                </Typography>
                <Box
                  sx={{ color: "var(--text-primary)", whiteSpace: "pre-wrap" }}
                  dangerouslySetInnerHTML={{ __html: data?.description }}
                />
              </Box>
            )}
            {data?.url && (
              <Box>
                <Typography
                  level="body-sm"
                  fontWeight="bold"
                  sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                >
                  URL
                </Typography>
                <Typography level="body-lg">
                  <a
                    href={data?.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--joy-palette-primary-500)",
                      textDecoration: "none",
                    }}
                  >
                    {data?.url}
                  </a>
                </Typography>
              </Box>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Additional metadata */}
      <Card variant="outlined" sx={{ bgcolor: "var(--bg-secondary)" }}>
        <CardContent>
          <Typography
            level="title-md"
            sx={{ mb: 2, color: "var(--text-primary)" }}
          >
            Metadata
          </Typography>
          <Stack spacing={2}>
            <Box>
              <Typography
                level="body-sm"
                fontWeight="bold"
                sx={{ color: "var(--text-secondary)", mb: 0.5 }}
              >
                Created
              </Typography>
              <Typography level="body-lg" sx={{ color: "var(--text-primary)" }}>
                {new Date(subResource.createdAt).toLocaleString()}
              </Typography>
            </Box>
            <Box>
              <Typography
                level="body-sm"
                fontWeight="bold"
                sx={{ color: "var(--text-secondary)", mb: 0.5 }}
              >
                Last Updated
              </Typography>
              <Typography level="body-lg" sx={{ color: "var(--text-primary)" }}>
                {new Date(subResource.updatedAt).toLocaleString()}
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

export default JiraTicketDetails;
