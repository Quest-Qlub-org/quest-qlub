import { Wifi, WifiOff } from "lucide-react";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";

export function OfflineBanner() {
  const { isOnline, wasOffline } = useNetworkStatus();

  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-amber-600 dark:bg-amber-700 text-white text-xs sm:text-sm font-medium py-2 px-4 text-center flex items-center justify-center gap-2 shadow-sm transition-all"
        data-testid="offline-banner"
      >
        <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>現在オフラインです。一部の機能が制限されます</span>
      </div>
    );
  }

  if (wasOffline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-emerald-600 dark:bg-emerald-700 text-white text-xs sm:text-sm font-medium py-2 px-4 text-center flex items-center justify-center gap-2 shadow-sm transition-all animate-in fade-in duration-200"
        data-testid="reconnected-banner"
      >
        <Wifi className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>オンラインに復帰しました</span>
      </div>
    );
  }

  return null;
}
