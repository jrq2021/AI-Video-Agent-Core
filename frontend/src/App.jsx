import { useState, useCallback, useEffect } from "react";
import Navbar from "./components/Navbar";
import HeroSection from "./components/HeroSection";
import VideoInput from "./components/VideoInput";
import VideoInfo from "./components/VideoInfo";
import VideoSubtitle from "./components/VideoSubtitle";
import FeaturesSection from "./components/FeaturesSection";
import PricingSection from "./components/PricingSection";
import FAQSection from "./components/FAQSection";
import ContactSection from "./components/ContactSection";
import DownloadHistory, { addHistoryItem } from "./components/DownloadHistory";
import UpgradeModal from "./components/UpgradeModal";
import MembershipOrderModal from "./components/MembershipOrderModal";
import Footer from "./components/Footer";
import AuthModal from "./components/AuthModal";
import Background3D from "./components/Background3D";
import useQuota from "./hooks/useQuota";

const THEME_STORAGE_KEY = "site_theme_pop_v1";

export default function App() {
  const [videoData, setVideoData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [historyKey, setHistoryKey] = useState(0);
  const [authOpen, setAuthOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem(THEME_STORAGE_KEY) || "cinematic";
  });

  const {
    quota,
    fetchQuota,
    checkQuota,
    consumeQuota,
    showUpgrade,
    upgradeReason,
    orderDialog,
    openUpgrade,
    closeUpgrade,
    closeOrderDialog,
    handleUpgrade,
    isLoading: isUpgrading,
  } = useQuota(user);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    const saved = localStorage.getItem("auth_user");
    if (token && saved) {
      try {
        const userData = JSON.parse(saved);
        setUser(userData);
        fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json())
          .then((d) => {
            if (d.success) {
              const updated = { ...userData, ...d.user };
              setUser(updated);
              localStorage.setItem("auth_user", JSON.stringify(updated));
            } else {
              handleLogout();
            }
          })
          .catch(() => {});
      } catch {
        handleLogout();
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) =>
      current === "cinematic" ? "light" : "cinematic",
    );
  };

  const handleLogin = (userData, token) => {
    setUser(userData);
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_user", JSON.stringify(userData));
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
    } catch {
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
    if (item.webpage_url) {
      handleAnalyze(item.webpage_url);
    }
  }, []);

  return (
    <div
      className={`min-h-screen flex flex-col relative ${
        theme === "cinematic" ? "theme-cinematic" : "theme-light"
      }`}
    >
      <Background3D />
      <Navbar
        user={user}
        quota={quota}
        onAuthClick={() => setAuthOpen(true)}
        onLogout={handleLogout}
        theme={theme}
        onThemeToggle={toggleTheme}
      />
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onLogin={handleLogin}
      />
      <main className="flex-1" aria-label="主要内容">
        <div className="top-scene">
          <HeroSection theme={theme} />
          <div className="relative z-10 max-w-7xl mx-auto px-4 pt-3 md:pt-4 pb-12">
            <VideoInput
              onAnalyze={handleAnalyze}
              onCheckQuota={checkQuota}
              quota={quota}
              isLoading={isLoading}
              user={user}
              onAuthClick={() => setAuthOpen(true)}
            />
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
              <div className="mt-8 grid grid-cols-1 lg:grid-cols-[minmax(360px,460px)_minmax(0,1fr)] items-start gap-6 lg:gap-7">
                <div className="min-w-0 space-y-5">
                  <VideoInfo
                    data={videoData}
                    user={user}
                    quota={quota}
                    checkQuota={checkQuota}
                    consumeQuota={consumeQuota}
                    openUpgrade={openUpgrade}
                    onDownloadComplete={handleDownloadComplete}
                  />
                </div>
                <div className="min-w-0">
                  <VideoSubtitle
                    videoSrc={null}
                    originalUrl={videoData.webpage_url}
                    user={user}
                    quota={quota}
                    checkQuota={checkQuota}
                    consumeQuota={consumeQuota}
                    openUpgrade={openUpgrade}
                  />
                </div>
              </div>
            )}
          </div>
          <DownloadHistory key={historyKey} onReDownload={handleReDownload} />
        </div>

        <FeaturesSection />
        <PricingSection
          currentUser={user}
          onUpgrade={handleUpgrade}
          isLoading={isUpgrading}
        />
        <FAQSection />
        <ContactSection />
      </main>
      <Footer />

      <UpgradeModal
        show={showUpgrade && !!user}
        reason={upgradeReason}
        currentUser={user}
        onUpgrade={handleUpgrade}
        onClose={closeUpgrade}
        isLoading={isUpgrading}
      />
      <AuthModal
        isOpen={showUpgrade && !user}
        onClose={closeUpgrade}
        onLogin={(userData, token) => {
          handleLogin(userData, token);
          closeUpgrade();
        }}
      />
      <MembershipOrderModal data={orderDialog} onClose={closeOrderDialog} />
    </div>
  );
}
