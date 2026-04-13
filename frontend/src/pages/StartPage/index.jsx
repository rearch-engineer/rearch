import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Box, Typography, CircularProgress, Button } from "@mui/joy";
import { api } from "../../api/client";
import { useConversations } from "../../contexts/ConversationsContext";

/**
 * StartPage: auto-creates a conversation for the repository specified in the URL hash.
 *
 * URL format: /start#<repository-name>
 *
 * On mount it reads the hash, calls the backend to create a conversation by repo name,
 * then navigates to /conversations/<id>.
 */
export default function StartPage() {
  const { t } = useTranslation("StartPage");
  const navigate = useNavigate();
  const { handleConversationCreated } = useConversations();
  const processedRef = useRef(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const repoName = window.location.hash.slice(1); // strip leading '#'

    if (!repoName) {
      setError(t("noRepoSpecified"));
      return;
    }

    const createAndRedirect = async () => {
      try {
        const newConv = await api.createConversationByName(decodeURIComponent(repoName));
        handleConversationCreated(newConv);
        navigate(`/conversations/${newConv._id}`, { replace: true });
      } catch (err) {
        const status = err.response?.status;
        const message = err.response?.data?.error || err.message;

        if (status === 404 && message === "repository-not-found") {
          setError(
            t("repoNotFound", { name: decodeURIComponent(repoName) })
          );
        } else {
          setError(t("failedToCreate", { message }));
        }
      }
    };

    // Clear the start_redirect since we've successfully reached this page
    sessionStorage.removeItem("start_redirect");

    createAndRedirect();
  }, [navigate, handleConversationCreated]);

  if (error) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
          gap: 2,
          p: 3,
        }}
      >
        <Typography level="h4" sx={{ color: "var(--text-primary)" }}>
          {t("couldNotStartConversation")}
        </Typography>
        <Typography
          level="body-md"
          sx={{ color: "var(--text-secondary)", textAlign: "center", maxWidth: 500 }}
        >
          {error}
        </Typography>
        <Button
          variant="outlined"
          onClick={() => navigate("/conversations/new", { replace: true })}
        >
          {t("goToNewConversation")}
        </Button>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
        gap: 2,
      }}
    >
      <CircularProgress />
      <Typography level="body-md" sx={{ color: "var(--text-secondary)" }}>
        {t("creatingConversation")}
      </Typography>
    </Box>
  );
}
