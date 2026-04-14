import React from "react";
import Avatar from "@mui/joy/Avatar";
import { api } from "../../api/client";

/**
 * UserAvatar - displays a user's uploaded avatar image, or falls back to
 * their initials inside an MUI Avatar.
 *
 * Props:
 *   avatarFileId  {string}  GridFS file ID for the uploaded avatar (optional)
 *   fallbackName  {string}  Name / email used to derive the initial (optional)
 *   size          {string}  MUI Avatar size: "sm" | "md" | "lg" (default "sm")
 *   sx            {object}  Extra MUI sx overrides (optional)
 */
const UserAvatar = ({ avatarFileId, fallbackName, size = "sm", sx = {} }) => {
  const initial = (fallbackName || "?").charAt(0).toUpperCase();

  if (avatarFileId) {
    return (
      <Avatar
        size={size}
        src={api.getPublicFileUrl(avatarFileId)}
        alt={fallbackName || "User avatar"}
        sx={{ fontSize: "0.75rem", ...sx }}
      />
    );
  }

  return (
    <Avatar size={size} sx={{ fontSize: "0.75rem", ...sx }}>
      {initial}
    </Avatar>
  );
};

export default UserAvatar;
