import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';

const ToolsContext = createContext();

export const useTools = () => {
  const context = useContext(ToolsContext);
  if (!context) {
    throw new Error('useTools must be used within a ToolsProvider');
  }
  return context;
};

export const ToolsProvider = ({ children }) => {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTools = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getTools();
      setTools(data);
    } catch (err) {
      console.error('Error fetching tools:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTools();
  }, []);

  const value = {
    tools,
    loading,
    error,
    refreshTools: fetchTools,
  };

  return (
    <ToolsContext.Provider value={value}>
      {children}
    </ToolsContext.Provider>
  );
};
