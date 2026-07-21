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
import {
  saveParseRecord,
  updateParseArtifacts,
  updateParseMetadata,
} from "./services/parseHistory";
import UpgradeModal from "./components/UpgradeModal";
import MembershipOrderModal from "./components/MembershipOrderModal";
import Footer from "./components/Footer";
import AuthModal from "./components/AuthModal";
import ScrollExperience from "./components/ScrollExperience";
import ProfilePage from "./components/ProfilePage";
import useQuota from "./hooks/useQuota";

export default function App() {
  const [page, setPage] = useState(() =>
    window.location.pathname === "/profile" ? "profile" : "home",
  );
  const [videoData, setVideoData] = useState(null);
  const [activeHistoryRecord, setActiveHistoryRecord] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [user, setUser] = useState(null);

  const {
    quota,
    checkQuota,
    consumeQuota,
    showUpgrade,
    upgradeReason,
    orderDialog,
    openUpgrade,
    closeUpgrade,
    closeOrderDialog,
    handleUpgrade,
    redeemCode,
    isLoading: isUpgrading,
  } = useQuota(user);

  const currentPlan =
    quota && !quota.is_guest && quota.plan !== "guest"
      ? quota.plan
      : user?.plan || "free";
  const membershipUser = user ? { ...user, plan: currentPlan } : null;

  useEffect(() => {
    const handlePopState = () => {
      setPage(window.location.pathname === "/profile" ? "profile" : "home");
      window.scrollTo({ top: 0, behavior: "auto" });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    document.title =
      page === "profile"
        ? "个人中心 - 万能视频下载"
        : "万能视频在线下载 - 无水印视频解析工具";
  }, [page]);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    const saved = localStorage.getItem("auth_user");
    if (token && saved) {
      try {
        const userData = JSON.parse(saved);
        setUser(userData);
        fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
          .then((response) => response.json())
          .then((data) => {
            if (data.success) {
              const updated = { ...userData, ...data.user };
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

  const navigateTo = useCallback((nextPage, { replace = false } = {}) => {
    const path = nextPage === "profile" ? "/profile" : "/";
    const method = replace ? "replaceState" : "pushState";
    window.history[method]({}, "", path);
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const handleAnalyze = useCallback(async (url, resumeRecord = null) => {
    setIsLoading(true);
    setError("");
    setVideoData(null);
    setActiveHistoryRecord(null);
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch("/api/info", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (data.success) {
        const cachedArtifacts = resumeRecord
          ? {
              subtitles: resumeRecord.subtitles || "",
              segments: resumeRecord.segments || [],
              language: resumeRecord.language || "",
              subtitle_type: resumeRecord.subtitle_type || "",
              summary_text: resumeRecord.summary_text || "",
              mindmap_text: resumeRecord.mindmap_text || "",
            }
          : {};
        const record = await saveParseRecord(data.data, cachedArtifacts, user);
        setActiveHistoryRecord(record);
        setVideoData({
          ...data.data,
          history_record_key: record.record_key,
        });
      } else {
        setError(data.detail || "获取视频信息失败");
      }
    } catch {
      setError("网络错误，请检查后端是否运行");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const handleDownloadComplete = useCallback(
    async (data, filename) => {
      const recordKey =
        data.history_record_key || activeHistoryRecord?.record_key;
      if (!recordKey) return;
      const updated = await updateParseMetadata(
        recordKey,
        {
          filename,
          downloaded_at: Date.now(),
        },
        user,
      );
      if (updated) setActiveHistoryRecord(updated);
    },
    [activeHistoryRecord, user],
  );

  const handleContinueHistory = useCallback(
    (item) => {
      if (!item.webpage_url) return;

      navigateTo("home");
      window.setTimeout(() => {
        document.getElementById("download-workspace")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        handleAnalyze(item.webpage_url, item);
      }, 80);
    },
    [handleAnalyze, navigateTo],
  );

  const handleArtifactsChange = useCallback(
    async (artifacts) => {
      const recordKey = activeHistoryRecord?.record_key;
      if (!recordKey) return;
      await updateParseArtifacts(recordKey, artifacts, user);
    },
    [activeHistoryRecord, user],
  );

  if (page === "profile") {
    return (
      <div className="site-shell min-h-screen">
        <ProfilePage
          user={membershipUser}
          quota={quota}
          onBackHome={() => navigateTo("home")}
          onAuthClick={() => setAuthOpen(true)}
          onLogout={handleLogout}
          onContinueHistory={handleContinueHistory}
        />
        <AuthModal
          isOpen={authOpen}
          onClose={() => setAuthOpen(false)}
          onLogin={handleLogin}
        />
      </div>
    );
  }

  return (
    <div className="site-shell min-h-screen">
      <ScrollExperience />
      <div id="home" className="cinematic-hero">
        <Navbar
          user={user}
          quota={quota}
          onAuthClick={() => setAuthOpen(true)}
          onLogout={handleLogout}
          onOpenProfile={() => navigateTo("profile")}
        />
        <HeroSection />
      </div>

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onLogin={handleLogin}
      />

      <main className="cinematic-content" aria-label="主要内容">
        <section id="download-workspace" className="workspace-stage">
          <div className="mx-auto max-w-5xl px-4 py-24 sm:px-6 md:py-32">
            <header className="section-heading mb-12 text-center">
              <h2 className="workspace-title">带来链接，留住此刻。</h2>
              <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-dark-500 sm:text-base">
                粘贴任意支持平台的视频链接，解析高清画质、音频与字幕，把灵感安静地保存下来。
              </p>
            </header>

            <VideoInput
              onAnalyze={handleAnalyze}
              onCheckQuota={checkQuota}
              quota={quota}
              isLoading={isLoading}
              user={user}
              onAuthClick={() => setAuthOpen(true)}
              onUpgradeClick={openUpgrade}
            />

            {error ? (
              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
                {error}
              </div>
            ) : null}

            {isLoading ? (
              <div className="mt-8 text-center">
                <div className="inline-block size-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
                <p className="mt-3 text-sm text-dark-400">正在解析视频信息...</p>
              </div>
            ) : null}

            {videoData ? (
              <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(360px,460px)_minmax(0,1fr)] lg:gap-7">
                <div className="min-w-0">
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
                    initialArtifacts={activeHistoryRecord}
                    onArtifactsChange={handleArtifactsChange}
                  />
                </div>
              </div>
            ) : null}
          </div>

        </section>

        <FeaturesSection />
        <PricingSection
          currentUser={membershipUser}
          onUpgrade={handleUpgrade}
          onRedeemCode={redeemCode}
          onAuthClick={() => setAuthOpen(true)}
          isLoading={isUpgrading}
        />
        <FAQSection />
        <ContactSection />
      </main>

      <Footer />

      <UpgradeModal
        show={showUpgrade && !!user}
        reason={upgradeReason}
        currentUser={membershipUser}
        onClose={closeUpgrade}
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
