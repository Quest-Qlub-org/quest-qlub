import { Component, type ErrorInfo, type ReactNode } from "react";
import { OfflineFallbackView } from "../views/OfflineFallbackView";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // ネットワーク切断中（オフライン）またはチャンク読み込み失敗時
      const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
      const isChunkError =
        this.state.error?.message?.includes("dynamically imported module") ||
        this.state.error?.message?.includes("Loading chunk") ||
        this.state.error?.message?.includes("Failed to fetch");

      if (isOffline || isChunkError) {
        return <OfflineFallbackView />;
      }

      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center min-h-[50vh] px-6 text-center animate-in fade-in duration-300"
          data-testid="error-boundary-fallback"
        >
          <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-950/50 flex items-center justify-center text-red-600 dark:text-red-400 mb-4 shadow-sm border border-red-200/50 dark:border-red-800/50">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">
            問題が発生しました
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 max-w-sm leading-relaxed">
            ページの読み込み中にエラーが発生しました。再読み込みをお試しください。
          </p>
          <button
            onClick={this.handleReload}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>再読み込み</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
