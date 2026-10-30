import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Box, Typography } from "@mui/joy";
import { api } from "../../../api/client";
import BitbucketConnectionForm from "./Providers/Bitbucket/BitbucketConnectionForm";
import GithubConnectionForm from "./Providers/Github/GithubConnectionForm";

function ConnectionFormPage() {
  const { t } = useTranslation("Administration");
  const { id } = useParams();
  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadResource(id);
    }
  }, [id]);

  const loadResource = async (connectionId) => {
    try {
      setLoading(true);
      const connections = await api.getAdminConnections();
      const connection = connections.find((r) => r._id === connectionId);
      if (connection) {
        setProvider(connection.provider);
      }
    } catch (error) {
      console.error("Error loading connection:", error);
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
    return <BitbucketConnectionForm />;
  }

  if (provider === "github") {
    return <GithubConnectionForm />;
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

export default ConnectionFormPage;
