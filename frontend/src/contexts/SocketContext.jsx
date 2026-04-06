import React, { createContext, useContext, useEffect, useState } from "react";
import socket from "../api/socket";

const SocketContext = createContext(null);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState(null);

  useEffect(() => {
    // Connect to WebSocket server when component mounts
    socket.connect();

    // Update connection state
    const handleConnect = () => {
      setIsConnected(true);
      setSocketId(socket.id);
      console.log("connected");
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setSocketId(null);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    // Cleanup on unmount
    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.disconnect();
    };
  }, []);

  const value = {
    socket,
    isConnected,
    socketId,
  };

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
};
