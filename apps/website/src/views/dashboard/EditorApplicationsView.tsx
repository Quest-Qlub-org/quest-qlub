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
}

export function EditorApplicationsView() {
  const { showToast, refreshTeamMembers, refreshWriters } = useApp();
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<"applications" | "all">("applications");
  const [keyword, setKeyword] = useState("");
  const [promotingEmail, setPromotingEmail] = useState<string | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    updateMetaTags({
      title: "ライター応募管理",
      noindex: true,
    });
  }, []);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("contact_messages")
        .select("id, name, email, subject, body, created_at")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setMessages(data as ContactMessage[]);
      } else {
        console.error("Failed to load contact messages:", error);
      }
    } catch (e) {
      console.error("Exception loading contact messages:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMessages();
  }, [fetchMessages]);

  const handlePromote = async (email: string) => {
    if (!window.confirm(`${email} をライターに昇格させますか？`)) return;
    setPromotingEmail(email);
    try {
      const { error } = await supabase.rpc("admin_promote_writer", {
        target_email: email.trim(),
      });
      if (!error) {
        if (typeof refreshTeamMembers === "function") {
          void refreshTeamMembers();
        }
        if (typeof refreshWriters === "function") {
          void refreshWriters();
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("quest_qlub_roles_updated"));
        }
        showToast(`${email} をライターに昇格しました`);
      } else {
        showToast("昇格に失敗しました: " + error.message);
      }
    } catch {
      showToast("エラーが発生しました。もう一度お試しください。");
    } finally {
      setPromotingEmail(null);
    }
  };

  const filteredMessages = messages.filter((m) => {
    if (filterMode === "applications") {
      if (!m.subject?.includes("ライター応募")) return false;
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

  const applicationCount = messages.filter((m) => m.subject?.includes("ライター応募")).length;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4 animate-in slide-in-from-right-8 duration-300">
      <div className="-mx-4 md:mx-0 -mt-4 md:mt-0 px-4 md:rounded-xl bg-white border-b md:border border-gray-200 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm mb-4">
        <button onClick={() => nav(-1)} className="p-2 bg-white rounded-full shadow-sm">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-bold text-purple-800 flex items-center gap-2">
          <Mail className="w-5 h-5" /> ライター応募・お問い合わせ一覧
        </h2>
      </div>

      {/* フィルタータブ & 検索バー */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setFilterMode("applications")}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              filterMode === "applications"
                ? "bg-purple-600 text-white shadow-sm"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            ライター応募 ({applicationCount})
          </button>
          <button
            onClick={() => setFilterMode("all")}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              filterMode === "all"
                ? "bg-purple-600 text-white shadow-sm"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            すべて ({messages.length})
          </button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
          <input
            type="text"
            placeholder="名前・メール・内容で検索"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-full sm:w-64 pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
          <span className="text-xs">メッセージを読み込んでいます...</span>
        </div>
      ) : filteredMessages.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-200 p-6">
          <p className="text-gray-400 text-sm font-medium">該当するメッセージはありません</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredMessages.map((msg) => {
            const isWriterApp = Boolean(msg.subject?.includes("ライター応募"));
            const isPromoting = promotingEmail === msg.email;

            return (
              <div
                key={msg.id}
                className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-900 text-base">{msg.name}</h3>
                      {isWriterApp && (
                        <span className="bg-purple-100 text-purple-700 text-xs px-2.5 py-0.5 rounded-full font-bold">
                          応募者
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{msg.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 font-medium">
                      {formatArticleDate(msg.created_at)}
                    </span>
                    {isWriterApp && (
                      <button
                        onClick={() => void handlePromote(msg.email)}
                        disabled={isPromoting}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 transition-colors shadow-sm disabled:opacity-50"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>{isPromoting ? "昇格処理中..." : "ライターに昇格"}</span>
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-gray-700 mb-1">{msg.subject}</h4>
                  <div className="bg-gray-50 rounded-xl p-3 text-xs sm:text-sm text-gray-700 font-mono whitespace-pre-wrap leading-relaxed border border-gray-100">
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
