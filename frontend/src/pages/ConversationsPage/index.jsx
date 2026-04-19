import React, { useCallback, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ChatInterface from '../../components/ChatInterface';
import SessionSidebar from '../../components/SessionSidebar';
import { PanelProvider } from '../../contexts/PanelContext';
import WindowManager from '../../components/WindowManager';
import { useConversations } from '../../contexts/ConversationsContext';
import { api } from '../../api/client';
import '../../App.css';

const SERVICES_POLL_INTERVAL = 30000;

function ConversationsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { loadConversations, handleConversationCreated, conversations } = useConversations();

  const conversationId = id === 'new' ? 'new' : id || null;
  const [services, setServices] = useState([]);

  const conversationEnvStatus = conversations.find(
    (c) => c._id === conversationId,
  )?.environment?.status;

  useEffect(() => {
    if (!conversationId || conversationId === 'new' || conversationEnvStatus !== 'running') {
      setServices([]);
      return;
    }
    let cancelled = false;
    const fetchServices = async () => {
      try {
        const res = await api.getServices(conversationId);
        if (!cancelled) setServices(res.services || []);
      } catch { if (!cancelled) setServices([]); }
    };
    fetchServices();
    const interval = setInterval(fetchServices, SERVICES_POLL_INTERVAL);
    return () => { cancelled = true; clearInterval(interval); };
  }, [conversationId, conversationEnvStatus]);

  const handleConversationUpdate = () => loadConversations();

  const onConversationCreated = useCallback((newConv) => {
    handleConversationCreated(newConv);
    navigate(`/conversations/${newConv._id}`);
  }, [handleConversationCreated, navigate]);

  const handleSessionInfoUpdate = useCallback(() => {
    if (window.__sessionSidebarRefresh) window.__sessionSidebarRefresh();
  }, []);

  const showSidebar = conversationId && conversationId !== 'new';

  if (!showSidebar) {
    return (
      <div className="conversations-page">
        <ChatInterface
          conversationId={conversationId}
          onConversationUpdate={handleConversationUpdate}
          onConversationCreated={onConversationCreated}
          onSessionInfoUpdate={handleSessionInfoUpdate}
        />
      </div>
    );
  }

  return (
    <div className="conversations-page">
      <PanelProvider conversationId={conversationId} services={services}>
        <WindowManager
          conversationId={conversationId}
          onConversationUpdate={handleConversationUpdate}
          onConversationCreated={onConversationCreated}
          onSessionInfoUpdate={handleSessionInfoUpdate}
        />
        <SessionSidebar conversationId={conversationId} />
      </PanelProvider>
    </div>
  );
}

export default ConversationsPage;
