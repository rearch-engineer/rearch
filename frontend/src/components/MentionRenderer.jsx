import React from 'react';
import './MentionRenderer.css';

/**
 * Parses message content and renders text with styled mentions
 * Mentions format: @[Display Name](resourceId)
 */
const MentionRenderer = ({ content }) => {
  // Regular expression to match mentions: @[Display Name](resourceId)
  const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
  
  const parseContent = (text) => {
    const parts = [];
    let lastIndex = 0;
    let match;

    // Find all mentions in the text
    while ((match = mentionRegex.exec(text)) !== null) {
      // Add plain text before the mention
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: text.substring(lastIndex, match.index),
        });
      }

      // Add the mention
      parts.push({
        type: 'mention',
        display: match[1], // Display name
        id: match[2],      // Resource ID
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after the last mention
    if (lastIndex < text.length) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex),
      });
    }

    return parts;
  };

  const parts = parseContent(content);

  return (
    <span className="mention-renderer">
      {parts.map((part, index) => {
        if (part.type === 'mention') {
          return (
            <span key={index} className="mention-tag" title={`Resource ID: ${part.id}`}>
              @{part.display}
            </span>
          );
        }
        return <span key={index}>{part.content}</span>;
      })}
    </span>
  );
};

export default MentionRenderer;
