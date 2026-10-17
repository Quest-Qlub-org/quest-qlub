import { useState, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { CustomUserIcon, CustomSearchIcon } from "../components/icons/NavIcons";
import { MOCK_TAGS } from "../types";
import { ArticleCard } from "../components/ArticleCard";
import { X } from "lucide-react";
import { parseSearchKeywords, matchKeywords } from "../utils/normalizeJapanese";

export const SearchView = () => {
  const { articles, writers } = useApp();

  const [keyword, setKeyword] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedWriterIds, setSelectedWriterIds] = useState<string[]>([]);

  const displayTags = useMemo(() => {
    const allTags = Array.from(new Set(articles.flatMap((a) => a.tags ?? []))).filter(Boolean);
    return allTags.length > 0 ? allTags : MOCK_TAGS;
  }, [articles]);

  const queryKeywords = useMemo(() => parseSearchKeywords(keyword), [keyword]);

  const results = useMemo(() => {
    return articles.filter((a) => {
      if (a.status !== "published") return false;

      if (queryKeywords.length > 0) {
        const writer = writers.find((w) => w.id === a.writerId);
        const searchTargets = [
          a.title,
          a.summary,
          a.content,
          ...(a.tags ?? []),
          writer?.display_name,
          writer?.username,
        ];
        if (!matchKeywords(searchTargets, queryKeywords)) {
          return false;
        }
      }

      if (selectedTags.length > 0 && !selectedTags.some((t) => (a.tags ?? []).includes(t)))
        return false;
      if (selectedWriterIds.length > 0 && !selectedWriterIds.includes(a.writerId)) return false;
      return true;
    });
  }, [articles, writers, queryKeywords, selectedTags, selectedWriterIds]);

  const toggleTag = (tag: string) =>
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  const toggleWriter = (id: string) =>
    setSelectedWriterIds((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id],
    );
  const hasFilter = keyword || selectedTags.length > 0 || selectedWriterIds.length > 0;

  return (
    <div className="p-4 md:p-8 space-y-6 animate-in fade-in duration-300">
      <div className="md:grid md:grid-cols-[280px_1fr] md:gap-6 md:items-start space-y-4 md:space-y-0">
        <div className="space-y-4">
          <div className="relative">
            <input
              type="text"
              placeholder="キーワードで検索"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white border-2 border-gray-200 rounded-xl focus:border-blue-500 transition-all outline-none font-bold text-gray-700 shadow-sm"
            />
            <div className="absolute left-3 top-3.5">
              <CustomSearchIcon className="w-7 h-7" />
            </div>
            {keyword && (
              <button
                onClick={() => setKeyword("")}
                className="absolute right-3 top-4 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          <section className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-sm font-bold text-gray-500 mb-3 border-b pb-2">タグでしぼる</h3>
            <div className="flex flex-wrap gap-2">
              {displayTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1.5 border rounded-lg text-sm font-bold transition-colors ${selectedTags.includes(tag) ? "bg-blue-500 border-blue-500 text-white" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600"}`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </section>
          <section className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-sm font-bold text-gray-500 mb-3 border-b pb-2">ライターでしぼる</h3>
            <div className="grid grid-cols-2 gap-2">
              {writers
                .filter((w) => w.role === "writer" || w.role === "editor")
                .sort((a, b) => {
                  const rank = (w: typeof a) => {
                    const dName = w.display_name ?? "";
                    if (
                      dName.includes("Quest Qlub編集部") ||
                      dName.includes("SHARE Quest編集部") ||
                      dName.includes("編集部")
                    )
                      return 0;
                    if (w.role === "editor") return 1;
                    return 2;
                  };
                  const ra = rank(a),
                    rb = rank(b);
                  if (ra !== rb) return ra - rb;
                  return (a.display_name ?? "").localeCompare(b.display_name ?? "", "ja");
                })
                .map((w) => (
                  <button
                    key={w.id}
                    onClick={() => toggleWriter(w.id)}
                    className={`flex items-center gap-2 p-2 border rounded-lg text-left transition-colors ${selectedWriterIds.includes(w.id) ? "bg-blue-50 border-blue-400" : "bg-gray-50 border-gray-200 hover:bg-blue-50 hover:border-blue-200"}`}
                  >
                    {w.avatar_url ? (
                      <img
                        src={w.avatar_url}
                        className="w-6 h-6 rounded-full object-cover"
                        alt=""
                      />
                    ) : (
                      <CustomUserIcon className="w-6 h-6" />
                    )}
                    <span className="text-sm font-bold text-gray-700 truncate">
                      {w.display_name ?? (w.username ? `@${w.username}` : "名称未設定")}
                    </span>
                  </button>
                ))}
            </div>
          </section>
          {hasFilter && (
            <button
              onClick={() => {
                setKeyword("");
                setSelectedTags([]);
                setSelectedWriterIds([]);
              }}
              className="w-full py-3 bg-gray-100 text-gray-700 font-bold rounded-xl border border-gray-200 hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <X className="w-5 h-5" />
              フィルターをリセット
            </button>
          )}
        </div>
        <div>
          {hasFilter && (
            <div>
              <div className="mb-3">
                <p className="font-bold text-gray-700">検索結果 ({results.length}件)</p>
              </div>
              <div className="space-y-3">
                {results.length === 0 ? (
                  <p className="text-gray-500 text-center py-8 bg-white rounded-xl border">
                    該当する記事が見つかりませんでした
                  </p>
                ) : (
                  results.map((a) => <ArticleCard key={a.id} article={a} />)
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
