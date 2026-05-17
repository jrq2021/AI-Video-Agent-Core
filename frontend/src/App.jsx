import { useState, useCallback, useEffect } from "react";
import Navbar from "./components/Navbar";
import HeroSection from "./components/HeroSection";
import VideoInput from "./components/VideoInput";
import VideoInfo from "./components/VideoInfo";
import VideoSubtitle from "./components/VideoSubtitle";
import FeaturesSection from "./components/FeaturesSection";
import FAQSection from "./components/FAQSection";
import ContactSection from "./components/ContactSection";
import DownloadHistory, { addHistoryItem } from "./components/DownloadHistory";
import Footer from "./components/Footer";
import AuthModal from "./components/AuthModal";
import Background3D from "./components/Background3D";

export default function App() {
  const [videoData, setVideoData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [historyKey, setHistoryKey] = useState(0);
  const [authOpen, setAuthOpen] = useState(false);
  const [user, setUser] = useState(null);

  // 启动时恢复登录态
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    const saved = localStorage.getItem("auth_user");
    if (token && saved) {
      try {
        setUser(JSON.parse(saved));
        // 验证 token 是否有效
        fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json())
          .then((d) => {
            if (!d.success) handleLogout();
          })
          .catch(() => {});
      } catch {
        handleLogout();
      }
    }
  }, []);

  const handleLogin = (userData, token) => {
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    setUser(null);
  };

  const handleAnalyze = async (url) => {
    setIsLoading(true);
    setError("");
    setVideoData(null);
    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.success) {
        setVideoData(data.data);
      } else {
        setError(data.detail || "获取视频信息失败");
      }
    } catch (e) {
      setError("网络错误，请检查后端是否运行");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadComplete = useCallback((data, filename) => {
    addHistoryItem(data, filename);
    setHistoryKey((k) => k + 1);
  }, []);

  const handleReDownload = useCallback((item) => {
    // 如果有 URL，直接触发解析
    if (item.webpage_url) {
      handleAnalyze(item.webpage_url);
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col relative">
      {/* 3D 粒子背景 */}
      <Background3D />
      <Navbar
        user={user}
        onAuthClick={() => setAuthOpen(true)}
        onLogout={handleLogout}
      />
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onLogin={handleLogin}
      />
      <main className="flex-1" aria-label="主要内容">
        <HeroSection />
        <div className="max-w-7xl mx-auto px-4 pb-12">
          <VideoInput onAnalyze={handleAnalyze} isLoading={isLoading} />
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm">
              {error}
            </div>
          )}
          {isLoading && (
            <div className="mt-8 text-center">
              <div className="inline-block w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
              <p className="mt-3 text-dark-400 text-sm">正在解析视频信息...</p>
            </div>
          )}
          {videoData && (
            <div className="mt-8 grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* 左列：视频信息 + 画质选择 */}
              <div className="lg:col-span-2 space-y-5">
                <VideoInfo
                  data={videoData}
                  onDownloadComplete={handleDownloadComplete}
                />
              </div>
              {/* 右列：AI 总结 / 字幕 / 思维导图 */}
              <div className="lg:col-span-3">
                <VideoSubtitle
                  videoSrc={null}
                  originalUrl={videoData.webpage_url}
                />
              </div>
            </div>
          )}
        </div>
        <DownloadHistory key={historyKey} onReDownload={handleReDownload} />
        <FeaturesSection />
        <FAQSection />
        <ContactSection />
      </main>
      <Footer />
    </div>
  );
}
