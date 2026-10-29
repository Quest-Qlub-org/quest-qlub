import { useState } from "react";

export interface RegisterSWOptions {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
  onRegisterError?: (error: unknown) => void;
}

export function useRegisterSW(_options: RegisterSWOptions = {}) {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);

  return {
    needRefresh: [needRefresh, setNeedRefresh] as [
      boolean,
      React.Dispatch<React.SetStateAction<boolean>>,
    ],
    offlineReady: [offlineReady, setOfflineReady] as [
      boolean,
      React.Dispatch<React.SetStateAction<boolean>>,
    ],
    updateServiceWorker: async (_reloadPage?: boolean) => {},
  };
}
