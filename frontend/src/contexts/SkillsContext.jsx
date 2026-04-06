import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';

const SkillsContext = createContext();

export const useSkills = () => {
  const context = useContext(SkillsContext);
  if (!context) {
    throw new Error('useSkills must be used within a SkillsProvider');
  }
  return context;
};

export const SkillsProvider = ({ children }) => {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSkills = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getSkills();
      setSkills(data);
    } catch (err) {
      console.error('Error fetching skills:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSkills();
  }, []);

  const value = {
    skills,
    loading,
    error,
    refreshSkills: fetchSkills,
  };

  return (
    <SkillsContext.Provider value={value}>
      {children}
    </SkillsContext.Provider>
  );
};
