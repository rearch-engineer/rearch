import React from "react";
import Skeleton from "@mui/joy/Skeleton";
import "./ChatSkeleton.css";

const ChatSkeleton = () => (
  <div className="chat-skeleton">
    <div className="chat-skeleton-messages">
      <div className="chat-skeleton-row assistant">
        <Skeleton variant="circular" width={32} height={32} />
        <div className="chat-skeleton-bubble">
          <Skeleton variant="text" width="80%" />
          <Skeleton variant="text" width="60%" />
        </div>
      </div>
      <div className="chat-skeleton-row user">
        <div className="chat-skeleton-bubble">
          <Skeleton variant="text" width="50%" />
        </div>
      </div>
      <div className="chat-skeleton-row assistant">
        <Skeleton variant="circular" width={32} height={32} />
        <div className="chat-skeleton-bubble">
          <Skeleton variant="text" width="90%" />
          <Skeleton variant="text" width="70%" />
          <Skeleton variant="text" width="40%" />
        </div>
      </div>
    </div>
    <div className="chat-skeleton-input">
      <Skeleton variant="rectangular" width="100%" height={48} sx={{ borderRadius: '12px' }} />
    </div>
  </div>
);

export default ChatSkeleton;
