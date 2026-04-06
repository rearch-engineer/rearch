import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';

const ResourcesContext = createContext();

export const useResources = () => {
  const context = useContext(ResourcesContext);
  if (!context) {
    throw new Error('useResources must be used within a ResourcesProvider');
  }
  return context;
};

export const ResourcesProvider = ({ children }) => {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchResources = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getResources();
      setResources(data);
    } catch (err) {
      console.error('Error fetching resources:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, []);

  const value = {
    resources,
    loading,
    error,
    refreshResources: fetchResources,
  };

  return (
    <ResourcesContext.Provider value={value}>
      {children}
    </ResourcesContext.Provider>
  );
};
