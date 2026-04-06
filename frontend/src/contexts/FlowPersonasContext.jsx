import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';

const FlowPersonasContext = createContext();

export const useFlowPersonas = () => {
  const context = useContext(FlowPersonasContext);
  if (!context) {
    throw new Error('useFlowPersonas must be used within a FlowPersonasProvider');
  }
  return context;
};

export const FlowPersonasProvider = ({ children }) => {
  const [flowPersonas, setFlowPersonas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchFlowPersonas = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getFlowPersonas();
      setFlowPersonas(data);
    } catch (err) {
      console.error('Error fetching flow personas:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlowPersonas();
  }, []);

  const value = {
    flowPersonas,
    loading,
    error,
    refreshFlowPersonas: fetchFlowPersonas,
  };

  return (
    <FlowPersonasContext.Provider value={value}>
      {children}
    </FlowPersonasContext.Provider>
  );
};
