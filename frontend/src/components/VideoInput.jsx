import { useState } from "react";

export default function VideoInput({ onAnalyze, isLoading }) {
  const [url, setUrl] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (url.trim() && !isLoading) {
      onAnalyze(url.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-8">
      <div className="relative">
        <div className="flex items-center bg-white border border-dark-200 rounded-2xl shadow-lg shadow-dark-900/5 focus-within:border-primary-400 focus-within:ring-4 focus-within:ring-primary-50 transition-all duration-200 overflow-hidden">
          {/* URL icon */}
          <div className="pl-5 pr-3">
            <svg
              className="w-5 h-5 text-dark-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
              />
            </svg>
          </div>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="粘贴视频链接，支持 YouTube / B站等 1000+ 平台..."
            className="flex-1 py-4 pr-4 text-dark-900 placeholder-dark-400 bg-transparent focus:outline-none text-sm"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !url.trim()}
            className="m-1.5 px-6 py-2.5 bg-primary-600 text-white rounded-xl font-medium
                     hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed
                     active:scale-95 transition-all duration-200 shadow-md shadow-primary-600/20 text-sm whitespace-nowrap"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  ></path>
                </svg>
                解析中
              </span>
            ) : (
              "开始解析"
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
