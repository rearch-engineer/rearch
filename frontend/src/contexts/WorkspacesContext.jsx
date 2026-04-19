import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

const WorkspacesContext = createContext(null);

const ACTIVE_WORKSPACE_KEY = 'active_workspace_id';

export function WorkspacesProvider({ children }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadWorkspaces = useCallback(async () => {
    try {
      const data = await api.getWorkspaces();
      setWorkspaces(data);

      // Restore active workspace from localStorage, or use first workspace
      const savedId = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
      const saved = data.find(w => w._id === savedId);
      if (saved) {
        setActiveWorkspaceState(saved);
      } else if (data.length > 0) {
        // Default to personal workspace, or first
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

  const setActiveWorkspace = useCallback((workspace) => {
    setActiveWorkspaceState(workspace);
    if (workspace?._id) {
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspace._id);
    }
  }, []);

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
