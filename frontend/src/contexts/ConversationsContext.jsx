import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import socket from '../api/socket';

const ConversationsContext = createContext(null);

export function ConversationsProvider({ children }) {
  const [conversations, setConversations] = useState([]);
  const [busyConversationIds, setBusyConversationIds] = useState(new Set());
  const [unreadConversationIds, setUnreadConversationIds] = useState(new Set());
  const activeConversationIdRef = useRef(null);

  const setActiveConversationId = useCallback((id) => {
    activeConversationIdRef.current = id;
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const data = await api.getConversations();
      setConversations(data);

      // Sync busyConversationIds from server response
      const newBusy = new Set();
      const newUnread = new Set();
      for (const conv of data) {
        if (conv.sessionStatus === 'busy') {
          newBusy.add(conv._id);
        }
        if (conv.hasUnread) {
          newUnread.add(conv._id);
        }
      }
      setBusyConversationIds(newBusy);
      setUnreadConversationIds(newUnread);
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Listen for WebSocket events for busy/idle status
  useEffect(() => {
    const handleBusy = (data) => {
      if (data?.conversationId) {
        setBusyConversationIds((prev) => {
          const next = new Set(prev);
          next.add(data.conversationId);
          return next;
        });
      }
    };

    const handleIdle = (data) => {
      if (data?.conversationId) {
        setBusyConversationIds((prev) => {
          const next = new Set(prev);
          next.delete(data.conversationId);
          return next;
        });

        // Mark as unread unless it's the conversation the user is currently viewing
        if (data.conversationId !== activeConversationIdRef.current) {
          setUnreadConversationIds((prev) => {
            const next = new Set(prev);
            next.add(data.conversationId);
            return next;
          });
        }
      }
    };

    const handleTitleUpdated = (data) => {
      if (data?.conversationId && data?.title) {
        setConversations((prev) =>
          prev.map((c) =>
            c._id === data.conversationId ? { ...c, title: data.title } : c
          )
        );
      }
    };

    const handleEnvironmentStatus = (data) => {
      if (data?.conversationId && data?.status) {
        setConversations((prev) =>
          prev.map((c) =>
            c._id === data.conversationId
              ? { ...c, environment: { ...c.environment, status: data.status } }
              : c
          )
        );
      }
    };

    const handleConversationCreatedWs = (data) => {
      if (data?.conversation) {
        setConversations((prev) => {
          // Avoid duplicates (in case the current user created it via UI)
          if (prev.some((c) => c._id === data.conversation._id)) return prev;
          return [data.conversation, ...prev];
        });
      }
    };

    socket.on('conversation.busy', handleBusy);
    socket.on('conversation.idle', handleIdle);
    socket.on('conversation.titleUpdated', handleTitleUpdated);
    socket.on('conversation.environment.status', handleEnvironmentStatus);
    socket.on('conversation.created', handleConversationCreatedWs);

    return () => {
      socket.off('conversation.busy', handleBusy);
      socket.off('conversation.idle', handleIdle);
      socket.off('conversation.titleUpdated', handleTitleUpdated);
      socket.off('conversation.environment.status', handleEnvironmentStatus);
      socket.off('conversation.created', handleConversationCreatedWs);
    };
  }, []);

  const markBusy = useCallback((id) => {
    setBusyConversationIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const markIdle = useCallback((id) => {
    setBusyConversationIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const markRead = useCallback((id) => {
    setUnreadConversationIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const markUnread = useCallback((id) => {
    setUnreadConversationIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const handleConversationCreated = useCallback((newConv) => {
    setConversations((prev) => [newConv, ...prev]);
  }, []);

  const handleDeleteConversation = useCallback(async (id) => {
    try {
      await api.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c._id !== id));
      // Clean up status sets
      setBusyConversationIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setUnreadConversationIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  }, []);

  const handleRenameConversation = useCallback(async (id, newTitle) => {
    try {
      await api.renameConversation(id, newTitle);
      setConversations((prev) =>
        prev.map((c) => (c._id === id ? { ...c, title: newTitle } : c))
      );
    } catch (error) {
      console.error('Error renaming conversation:', error);
    }
  }, []);

  const value = {
    conversations,
    busyConversationIds,
    unreadConversationIds,
    loadConversations,
    handleConversationCreated,
    handleDeleteConversation,
    handleRenameConversation,
    setActiveConversationId,
    markBusy,
    markIdle,
    markRead,
    markUnread,
  };

  return (
    <ConversationsContext.Provider value={value}>
      {children}
    </ConversationsContext.Provider>
  );
}

export function useConversations() {
  const context = useContext(ConversationsContext);
  if (!context) {
    throw new Error('useConversations must be used within a ConversationsProvider');
  }
  return context;
}
