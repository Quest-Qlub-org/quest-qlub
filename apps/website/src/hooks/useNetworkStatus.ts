import { useState, useEffect } from "react";

export interface NetworkStatus {
  isOnline: boolean;
  wasOffline: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      return navigator.onLine;
    }
    return true;
  });

  const [wasOffline, setWasOffline] = useState<boolean>(false);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const handleOnline = () => {
      setIsOnline(true);
      setWasOffline(true);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        setWasOffline(false);
      }, 3000);
    };

    const handleOffline = () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      setWasOffline(false);
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);

  return { isOnline, wasOffline };
}
