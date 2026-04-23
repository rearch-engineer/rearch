import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { api } from '../api/client';

const WorkspacesContext = createContext(null);

const ACTIVE_WORKSPACE_KEY = 'active_workspace_id';

export function WorkspacesProvider({ children }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  // Extract :wid from the current URL if present
  const getWidFromUrl = useCallback(() => {
    const match = location.pathname.match(/^\/workspaces\/([a-f0-9]+)\//);
    return match ? match[1] : null;
  }, [location.pathname]);

  const loadWorkspaces = useCallback(async () => {
    try {
      const data = await api.getWorkspaces();
      setWorkspaces(data);

      // Check if URL contains a workspace ID
      const urlWid = location.pathname.match(/^\/workspaces\/([a-f0-9]+)\//)?.[1];
      const urlWs = urlWid ? data.find(w => w._id === urlWid) : null;

      if (urlWs) {
        // URL is source of truth
        setActiveWorkspaceState(urlWs);
        localStorage.setItem(ACTIVE_WORKSPACE_KEY, urlWs._id);
      } else if (data.length > 0) {
        // No workspace in URL — default to personal workspace
        const personal = data.find(w => w.isPersonal);
        const defaultWs = personal || data[0];
        setActiveWorkspaceState(defaultWs);
        localStorage.setItem(ACTIVE_WORKSPACE_KEY, defaultWs._id);
      }
    } catch (error) {
      console.error('Error loading workspaces:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  // Sync active workspace when URL :wid changes
  useEffect(() => {
    if (workspaces.length === 0) return;
    const urlWid = getWidFromUrl();
    if (urlWid && activeWorkspace?._id !== urlWid) {
      const ws = workspaces.find(w => w._id === urlWid);
      if (ws) {
        setActiveWorkspaceState(ws);
        localStorage.setItem(ACTIVE_WORKSPACE_KEY, ws._id);
      }
    }
  }, [location.pathname, workspaces, getWidFromUrl]);

  const setActiveWorkspace = useCallback((workspace) => {
    setActiveWorkspaceState(workspace);
    if (workspace?._id) {
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspace._id);
    }
  }, []);

  // Navigate to a workspace-scoped conversation URL
  const navigateToConversation = useCallback((conversationId, options) => {
    const wid = activeWorkspace?._id;
    if (!wid) return;
    navigate(`/workspaces/${wid}/conversations/${conversationId}`, options);
  }, [activeWorkspace, navigate]);

  // Build a workspace-scoped conversation path (without navigating)
  const conversationPath = useCallback((conversationId, wsId) => {
    const wid = wsId || activeWorkspace?._id;
    if (!wid) return `/conversations/${conversationId}`;
    return `/workspaces/${wid}/conversations/${conversationId}`;
  }, [activeWorkspace]);

  // Get the personal workspace
  const getPersonalWorkspace = useCallback(() => {
    return workspaces.find(w => w.isPersonal) || workspaces[0] || null;
  }, [workspaces]);

  const createWorkspace = useCallback(async (name) => {
    const newWs = await api.createWorkspace(name);
    setWorkspaces(prev => [...prev, newWs]);
    return newWs;
  }, []);

  const updateWorkspace = useCallback(async (id, data) => {
    const updated = await api.updateWorkspace(id, data);
    setWorkspaces(prev => prev.map(w => w._id === id ? { ...w, ...updated } : w));
    if (activeWorkspace?._id === id) {
      setActiveWorkspaceState(prev => ({ ...prev, ...updated }));
    }
    return updated;
  }, [activeWorkspace]);

  const deleteWorkspace = useCallback(async (id) => {
    await api.deleteWorkspace(id);
    setWorkspaces(prev => prev.filter(w => w._id !== id));
    // If deleted workspace was active, switch to personal
    if (activeWorkspace?._id === id) {
      const remaining = workspaces.filter(w => w._id !== id);
      const personal = remaining.find(w => w.isPersonal);
      const fallback = personal || remaining[0] || null;
      setActiveWorkspace(fallback);
    }
  }, [activeWorkspace, workspaces, setActiveWorkspace]);

  const value = {
    workspaces,
    activeWorkspace,
    loading,
    setActiveWorkspace,
    loadWorkspaces,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    navigateToConversation,
    conversationPath,
    getPersonalWorkspace,
  };

  return (
    <WorkspacesContext.Provider value={value}>
      {children}
    </WorkspacesContext.Provider>
  );
}

export function useWorkspaces() {
  const context = useContext(WorkspacesContext);
  if (!context) {
    throw new Error('useWorkspaces must be used within a WorkspacesProvider');
  }
  return context;
}
