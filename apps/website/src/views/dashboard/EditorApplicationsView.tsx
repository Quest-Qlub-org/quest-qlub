import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabase";
import { ChevronLeft, Mail, UserPlus, Search, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { formatArticleDate } from "../../utils/date";
import { updateMetaTags } from "../../utils/seo";

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  body: string;
  created_at: string;
  message_kind?: "contact" | "writer_application" | "legacy_writer_application";
  application_user_id?: string | null;
  review_status?: "pending" | ReviewDecision | null;
  account_display_name?: string | null;
  account_username?: string | null;
  notification_status?: keyof typeof notificationLabels | null;
}

type ReviewDecision = "approved" | "rejected";

const notificationLabels = {
  pending: "通知待ち",
  processing: "通知処理中",
  sent: "通知済み",
  failed: "通知失敗",
};

function isWriterApplicationMessage(msg: ContactMessage): boolean {
  if (msg.message_kind) return msg.message_kind !== "contact";
  const subject = typeof msg.subject === "string" ? msg.subject.trim() : "";
  const body = typeof msg.body === "string" ? msg.body : "";
  return subject.startsWith("【ライター応募】") && body.includes("【志望動機・自己PR】:");
}

export function EditorApplicationsView() {
  const { showToast, refreshTeamMembers, refreshWriters } = useApp();
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<"applications" | "all">("applications");
  const [keyword, setKeyword] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    updateMetaTags({
      title: "ライター応募管理",
      noindex: true,
    });
  }, []);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      let { data, error } = await supabase.rpc("admin_list_contact_receipts");
      if (error?.code === "PGRST202" || error?.code === "42883") {
        // The existing tables remain readable under their RLS. Review stays disabled
        // because these rows lack account binding from the new RPC.
        ({ data, error } = await supabase
          .from("contact_messages")
          .select("id, name, email, subject, body, created_at")
          .order("created_at", { ascending: false }));
      }

      if (error) {
        setLoadError(
          error.code === "42501"
            ? "受付を確認するには管理画面で再認証してください。"
            : "受付を読み込めませんでした。",
        );
        return;
      }
      setMessages((data ?? []) as ContactMessage[]);
    } catch {
      setLoadError("受付を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMessages();
  }, [fetchMessages]);

  const handleReview = async (message: ContactMessage, decision: ReviewDecision) => {
    if (!message.application_user_id || message.review_status !== "pending") return;
    const account = message.account_username
      ? "@" + message.account_username
      : message.account_display_name;
    const accountLabel = account
      ? `${account} (${message.application_user_id})`
      : message.application_user_id;
    const action = decision === "approved" ? "ライターに昇格" : "応募を見送り";
    if (!window.confirm(`${accountLabel} の${action}を確定しますか？`)) return;

    setReviewingId(message.id);
    try {
      const { error } = await supabase.rpc("admin_review_writer_application", {
        receipt_id: message.id,
        expected_account_id: message.application_user_id,
        decision,
      });
      if (error) {
        showToast(
          error.code === "42501"
            ? "審査には管理画面での再認証が必要です。"
            : error.code === "PT409"
              ? error.message
              : "審査結果を保存できませんでした。",
        );
        return;
      }

      setMessages((previous) =>
        previous.map((item) =>
          item.id === message.id ? { ...item, review_status: decision } : item,
        ),
      );
      if (decision === "approved") {
        void refreshTeamMembers?.();
        void refreshWriters?.();
        window.dispatchEvent(new Event("quest_qlub_roles_updated"));
      }
      showToast(decision === "approved" ? "ライターに昇格しました" : "応募を見送りました");
    } catch {
      showToast("審査結果を保存できませんでした。もう一度お試しください。");
    } finally {
      setReviewingId(null);
    }
  };

  const filteredMessages = messages.filter((m) => {
    if (filterMode === "applications") {
      if (!isWriterApplicationMessage(m)) return false;
    }
    if (keyword.trim()) {
      const lower = keyword.toLowerCase();
      const matchName = m.name?.toLowerCase().includes(lower);
      const matchEmail = m.email?.toLowerCase().includes(lower);
      const matchBody = m.body?.toLowerCase().includes(lower);
      const matchSubject = m.subject?.toLowerCase().includes(lower);
      if (!matchName && !matchEmail && !matchBody && !matchSubject) return false;
    }
    return true;
  });

  const applicationCount = messages.filter((m) => isWriterApplicationMessage(m)).length;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4 animate-in slide-in-from-right-8 duration-300">
      <div className="-mx-4 md:mx-0 -mt-4 md:mt-0 px-4 md:rounded-xl bg-white dark:bg-gray-800 border-b md:border border-gray-200 dark:border-gray-700 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm mb-4">
        <button
          type="button"
          onClick={() => nav(-1)}
          aria-label="戻る"
          className="p-2 bg-white dark:bg-gray-700 rounded-full shadow-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-purple-800 dark:text-purple-300 flex items-center gap-2">
          <Mail className="w-5 h-5" /> ライター応募・お問い合わせ一覧
        </h1>
      </div>

      {/* フィルタータブ & 検索バー */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex gap-2" role="tablist" aria-label="メッセージ種別フィルター">
          <button
            type="button"
            role="tab"
            aria-selected={filterMode === "applications"}
            onClick={() => setFilterMode("applications")}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              filterMode === "applications"
                ? "bg-purple-600 text-white shadow-sm"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
          >
            ライター応募 ({applicationCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filterMode === "all"}
            onClick={() => setFilterMode("all")}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              filterMode === "all"
                ? "bg-purple-600 text-white shadow-sm"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
          >
            すべて ({messages.length})
          </button>
        </div>

        <div className="relative">
          <label htmlFor="applications-search-input" className="sr-only">
            名前・メール・内容で検索
          </label>
          <Search
            className="w-4 h-4 absolute left-3 top-3 text-gray-500 dark:text-gray-400"
            aria-hidden="true"
          />
          <input
            id="applications-search-input"
            type="text"
            placeholder="名前・メール・内容で検索"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-full sm:w-64 pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          />
        </div>
      </div>

      {loadError ? (
        <div role="alert" className="p-4 text-sm text-red-700 dark:text-red-300">
          {loadError}
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-500 dark:text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
          <span className="text-xs">メッセージを読み込んでいます...</span>
        </div>
      ) : filteredMessages.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
            該当するメッセージはありません
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredMessages.map((msg) => {
            const isWriterApp = isWriterApplicationMessage(msg);
            const canReview = msg.review_status === "pending" && Boolean(msg.application_user_id);
            const isReviewing = reviewingId === msg.id;

            return (
              <div
                key={msg.id}
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 dark:border-gray-700 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-gray-900 dark:text-gray-100 text-base">
                        {msg.name}
                      </h2>
                      {isWriterApp && (
                        <span className="bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-xs px-2.5 py-0.5 rounded-full font-bold">
                          応募者
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">
                      {isWriterApp ? "受付時メール " : ""}
                      {msg.email}
                    </p>
                    {isWriterApp && msg.application_user_id && (
                      <p className="mt-1 break-all text-xs text-gray-700 dark:text-gray-200">
                        {msg.account_display_name}{" "}
                        {msg.account_username ? "@" + msg.account_username : ""}{" "}
                        <span className="font-mono">{msg.application_user_id}</span>
                      </p>
                    )}
                    {isWriterApp && !msg.application_user_id && (
                      <p className="mt-1 text-xs text-gray-700 dark:text-gray-200">
                        {msg.message_kind === "writer_application"
                          ? "応募のアカウントを確認できません"
                          : "旧形式の応募。承認にはログインして再応募が必要です。"}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                      {formatArticleDate(msg.created_at)}
                    </span>
                    {msg.notification_status && (
                      <span className="text-xs text-gray-700 dark:text-gray-200">
                        {notificationLabels[msg.notification_status]}
                      </span>
                    )}
                    {msg.review_status === "approved" && <span className="text-xs">承認済み</span>}
                    {msg.review_status === "rejected" && (
                      <span className="text-xs">見送り済み</span>
                    )}
                    {canReview && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleReview(msg, "rejected")}
                          disabled={reviewingId !== null}
                          className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-700 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200"
                        >
                          見送る
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleReview(msg, "approved")}
                          disabled={reviewingId !== null}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 transition-colors shadow-sm disabled:opacity-50"
                        >
                          <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                          {isReviewing ? "審査中…" : "ライターに昇格"}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-1">
                    {msg.subject}
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-900/60 rounded-xl p-3 text-xs sm:text-sm text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap leading-relaxed border border-gray-100 dark:border-gray-700">
                    {msg.body}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
