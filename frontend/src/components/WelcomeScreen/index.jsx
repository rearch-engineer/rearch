import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import CircularProgress from "@mui/joy/CircularProgress";
import * as MuiIcons from "@mui/icons-material";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import "./WelcomeScreen.css";

function getIconComponent(iconName) {
  if (!iconName) return MuiIcons.SmartToyOutlined;
  return MuiIcons[iconName] || MuiIcons.SmartToyOutlined;
}

export default function WelcomeScreen({
  subResourceId,
  repoName,
  onPromptClick,
  children,
}) {
  const { t } = useTranslation("WelcomeScreen");
  const { user } = useAuth();
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);

  const displayName =
    user?.profile?.display_name ||
    user?.username ||
    user?.email?.split("@")[0] ||
    "";
  const firstName = displayName.split(" ")[0];

  useEffect(() => {
    if (!subResourceId) {
      setLoading(false);
      return;
    }
    const loadPrompts = async () => {
      try {
        const data = await api.getSuggestedPromptsForRepo(subResourceId);
        setPrompts(data);
      } catch (err) {
        console.error("Failed to load suggested prompts:", err);
        setPrompts([]);
      } finally {
        setLoading(false);
      }
    };
    loadPrompts();
  }, [subResourceId]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const p of prompts) {
      const catId = p.category?._id || "uncategorized";
      const catName = p.category?.name || "Other";
      const catOrder = p.category?.order ?? 999;
      if (!map.has(catId)) {
        map.set(catId, { name: catName, order: catOrder, prompts: [] });
      }
      map.get(catId).prompts.push(p);
    }
    return [...map.values()].sort((a, b) => a.order - b.order);
  }, [prompts]);

  return (
    <div className="welcome-screen">
      {/* Heading + input anchored at vertical center of viewport */}
      <div className="welcome-center-anchor">
        <h1 className="welcome-heading">
          {firstName
            ? t("headingWithName", { repoName: repoName || t("thisRepository"), firstName })
            : t("headingWithoutName", { repoName: repoName || t("thisRepository") })}
        </h1>
        <div className="welcome-input-wrapper">{children}</div>
      </div>

      {/* Prompt cards below */}
      <div className="welcome-prompts-section">
        {loading ? (
          <div className="welcome-prompts-loading">
            <CircularProgress size="sm" />
          </div>
        ) : grouped.length > 0 ? (
          <div className="welcome-categories">
            {grouped.map((group) => (
              <div key={group.name} className="welcome-category-section">
                <h2 className="welcome-category-title">{group.name}</h2>
                <div className="welcome-prompts-grid">
                  {group.prompts.map((prompt) => {
                    const IconComp = getIconComponent(prompt.icon);
                    return (
                      <div
                        key={prompt._id}
                        className="welcome-prompt-card"
                        onClick={() =>
                          onPromptClick && onPromptClick(prompt.prompt)
                        }
                        title={prompt.prompt}
                      >
                        <div className="welcome-prompt-card-preview">
                          {prompt.imageFileId ? (
                            <img
                              className="welcome-prompt-card-image"
                              src={api.getPublicFileUrl(prompt.imageFileId)}
                              alt={prompt.title}
                              loading="lazy"
                            />
                          ) : (
                            <div className="welcome-prompt-card-image-placeholder" />
                          )}
                        </div>
                        <div className="welcome-prompt-card-footer">
                          <IconComp
                            className="welcome-prompt-card-icon"
                            style={{ color: prompt.iconColor || "#6b7280" }}
                          />
                          <span className="welcome-prompt-card-title">
                            {prompt.title}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
