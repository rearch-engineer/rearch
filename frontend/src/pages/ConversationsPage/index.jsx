import React, { useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ChatInterface from '../../components/ChatInterface';
import SessionSidebar from '../../components/SessionSidebar';
import { useConversations } from '../../contexts/ConversationsContext';
import '../../App.css';

function ConversationsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    loadConversations,
    handleConversationCreated,
  } = useConversations();

  // Derive conversationId from URL:
  // /conversations/new  -> "new"
  // /conversations/:id  -> the id
  // /                   -> null (welcome screen)
  const conversationId = id === 'new' ? 'new' : id || null;

  const handleConversationUpdate = () => {
    loadConversations();
  };

  const onConversationCreated = useCallback((newConv) => {
    handleConversationCreated(newConv);
    navigate(`/conversations/${newConv._id}`);
  }, [handleConversationCreated, navigate]);

  const handleSessionInfoUpdate = useCallback(() => {
    if (window.__sessionSidebarRefresh) {
      window.__sessionSidebarRefresh();
    }
  }, []);

  const showSidebar = conversationId && conversationId !== 'new';

  return (
    <div className="conversations-page">
      <ChatInterface
        conversationId={conversationId}
        onConversationUpdate={handleConversationUpdate}
        onConversationCreated={onConversationCreated}
        onSessionInfoUpdate={handleSessionInfoUpdate}
      />
      {showSidebar && (
        <SessionSidebar conversationId={conversationId} />
      )}
    </div>
  );
}

export default ConversationsPage;
