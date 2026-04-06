import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { api } from '../api/client';

const JobsContext = createContext(null);

export const useJobs = () => {
  const context = useContext(JobsContext);
  if (!context) {
    throw new Error('useJobs must be used within a JobsProvider');
  }
  return context;
};

export const JobsProvider = ({ children }) => {
  const { socket } = useSocket();
  const { isAdmin } = useAuth();

  const [counts, setCounts] = useState({ active: 0, waiting: 0, completed: 0, failed: 0 });

  /**
   * The total number of "in-flight" jobs (active + waiting).
   * This is used for the navigation badge.
   */
  const activeCount = (counts.active || 0) + (counts.waiting || 0);

  /**
   * Fetch counts from the API (initial load + manual refresh).
   */
  const refreshCounts = useCallback(async () => {
    if (!isAdmin()) return;
    try {
      const data = await api.getJobs({ status: 'active,waiting,completed,failed', limit: 1 });
      setCounts(data.counts);
    } catch (err) {
      console.error('Failed to fetch job counts:', err);
    }
  }, [isAdmin]);

  // Initial fetch
  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  // Listen for real-time count updates from Socket.IO job events
  useEffect(() => {
    if (!socket) return;

    const handleJobEvent = (payload) => {
      if (payload?.counts) {
        setCounts(payload.counts);
      }
    };

    socket.on('job.active', handleJobEvent);
    socket.on('job.completed', handleJobEvent);
    socket.on('job.failed', handleJobEvent);

    return () => {
      socket.off('job.active', handleJobEvent);
      socket.off('job.completed', handleJobEvent);
      socket.off('job.failed', handleJobEvent);
    };
  }, [socket]);

  const value = {
    counts,
    activeCount,
    refreshCounts,
  };

  return (
    <JobsContext.Provider value={value}>
      {children}
    </JobsContext.Provider>
  );
};
