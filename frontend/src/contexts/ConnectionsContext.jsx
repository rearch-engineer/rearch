import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';

const ConnectionsContext = createContext();

export const useConnections = () => {
  const context = useContext(ConnectionsContext);
  if (!context) {
    throw new Error('useConnections must be used within a ConnectionsProvider');
  }
  return context;
};

export const ConnectionsProvider = ({ children }) => {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getConnections();
      setConnections(data);
    } catch (err) {
      console.error('Error fetching connections:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const value = {
    connections,
    loading,
    error,
    refreshResources: fetchConnections,
  };

  return (
    <ConnectionsContext.Provider value={value}>
      {children}
    </ConnectionsContext.Provider>
  );
};
