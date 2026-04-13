import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Box, Typography } from "@mui/joy";
import { api } from "../../../api/client";
import BitbucketResourceForm from "./SubResources/Bitbucket/BitbucketResourceForm";

function ResourceFormPage() {
  const { t } = useTranslation("Administration");
  const { id } = useParams();
  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadResource(id);
    }
  }, [id]);

  const loadResource = async (resourceId) => {
    try {
      setLoading(true);
      const resources = await api.getAdminResources();
      const resource = resources.find((r) => r._id === resourceId);
      if (resource) {
        setProvider(resource.provider);
      }
    } catch (error) {
      console.error("Error loading resource:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          flex: 1,
          p: 4,
          bgcolor: "var(--bg-primary)",
          color: "var(--text-primary)",
        }}
      >
        <Typography>{t("resourceForm.loadingResource")}</Typography>
      </Box>
    );
  }

  if (provider === "bitbucket") {
    return <BitbucketResourceForm />;
  }

  return (
    <Box
      sx={{
        flex: 1,
        p: 4,
        bgcolor: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      <Typography>{t("resourceForm.unknownProvider")}</Typography>
    </Box>
  );
}

export default ResourceFormPage;
