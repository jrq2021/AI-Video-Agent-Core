import { useState, useCallback, useEffect, useRef } from "react";
import Navbar from "./components/Navbar";
import HeroSection from "./components/HeroSection";
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
import ParsePage from "./components/ParsePage";
import RedeemPage from "./components/RedeemPage";
import useQuota from "./hooks/useQuota";
import {
  getPageFromPath,
  getPathForPage,
  isHomeSection,
} from "./services/appNavigation";

export default function App() {
  const [page, setPage] = useState(() =>
    getPageFromPath(window.location.pathname),
  );
  const [videoData, setVideoData] = useState(null);
  const [activeHistoryRecord, setActiveHistoryRecord] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [user, setUser] = useState(null);
  const homeScrollRef = useRef(null);

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
    getAuthHeaders,
    isLoading: isUpgrading,
  } = useQuota(user);

  const currentPlan =
    quota && !quota.is_guest && quota.plan !== "guest"
      ? quota.plan
      : user?.plan || "free";
  const membershipUser = user ? { ...user, plan: currentPlan } : null;

  useEffect(() => {
    const handlePopState = () => {
      setPage(getPageFromPath(window.location.pathname));
      window.scrollTo({ top: 0, behavior: "auto" });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (page === "parse") {
      document.title = "视频解析工作台 - 万能视频下载";
      return;
    }
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

  const scrollHomeTo = useCallback((sectionId = "home", behavior = "auto") => {
    const scroller = homeScrollRef.current;
    const target = document.getElementById(sectionId);
    if (!scroller || !target) return;

    const top =
      target.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;
    scroller.scrollTo({ top, behavior });
  }, []);

  const navigateTo = useCallback((nextPage, { replace = false, sectionId } = {}) => {
    const path = getPathForPage(nextPage);
    const method = replace ? "replaceState" : "pushState";
    if (window.location.pathname !== path) {
      window.history[method]({}, "", path);
    }
    setPage(nextPage);
    window.requestAnimationFrame(() => {
      if (nextPage === "home") {
        scrollHomeTo(
          isHomeSection(sectionId) ? sectionId : "home",
          sectionId ? "smooth" : "auto",
        );
      } else {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    });
  }, [scrollHomeTo]);

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
              translated_segments: resumeRecord.translated_segments || [],
              translation_language: resumeRecord.translation_language || "",
              creator_pack: resumeRecord.creator_pack || {},
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
      const sourceUrl = item.webpage_url || item.url;
      if (!sourceUrl) return;

      navigateTo("parse");
      window.requestAnimationFrame(() => {
        handleAnalyze(sourceUrl, item);
      });
    },
    [handleAnalyze, navigateTo],
  );

  const handleArtifactsChange = useCallback(
    async (artifacts) => {
      const recordKey = activeHistoryRecord?.record_key;
      if (!recordKey) return;
      const updated = await updateParseArtifacts(recordKey, artifacts, user);
      if (updated) setActiveHistoryRecord(updated);
    },
    [activeHistoryRecord, user],
  );

  const handleOpenBatchRecord = useCallback(
    async (recordKey) => {
      try {
        const response = await fetch(`/api/parse-history/${encodeURIComponent(recordKey)}`, {
          headers: getAuthHeaders(),
        });
        const data = await response.json();
        if (response.ok && data.record) handleContinueHistory(data.record);
      } catch {
        setError("无法打开该批量解析记录，请稍后重试。");
      }
    },
    [getAuthHeaders, handleContinueHistory],
  );

  const handleNavigate = useCallback(
    ({ page: nextPage, sectionId } = {}) => {
      navigateTo(nextPage || "home", { sectionId });
    },
    [navigateTo],
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
          onNavigate={handleNavigate}
        />
        <AuthModal
          isOpen={authOpen}
          onClose={() => setAuthOpen(false)}
          onLogin={handleLogin}
        />
      </div>
    );
  }

  if (page === "redeem") {
    return (
      <div className="site-shell min-h-screen">
        <RedeemPage
          user={user}
          quota={quota}
          onRedeemCode={redeemCode}
          onAuthClick={() => setAuthOpen(true)}
          onNavigate={handleNavigate}
        />
        <AuthModal
          isOpen={authOpen}
          onClose={() => setAuthOpen(false)}
          onLogin={handleLogin}
        />
      </div>
    );
  }

  if (page === "parse") {
    return (
      <div className="site-shell min-h-screen">
        <Navbar
          user={user}
          quota={quota}
          activePage={page}
          onNavigate={handleNavigate}
          onAuthClick={() => setAuthOpen(true)}
          onLogout={handleLogout}
          onOpenProfile={() => navigateTo("profile")}
        />
        <AuthModal
          isOpen={authOpen}
          onClose={() => setAuthOpen(false)}
          onLogin={handleLogin}
        />
        <ParsePage
          onAnalyze={handleAnalyze}
          checkQuota={checkQuota}
          quota={quota}
          isLoading={isLoading}
          user={user}
          onAuthClick={() => setAuthOpen(true)}
          openUpgrade={openUpgrade}
          error={error}
          videoData={videoData}
          consumeQuota={consumeQuota}
          onDownloadComplete={handleDownloadComplete}
          activeHistoryRecord={activeHistoryRecord}
          onArtifactsChange={handleArtifactsChange}
          batchProps={{
            user,
            quota,
            getAuthHeaders,
            onOpenRecord: handleOpenBatchRecord,
            onAuthClick: () => setAuthOpen(true),
            onUpgrade: openUpgrade,
          }}
          creatorProps={{
            user,
            quota,
            getAuthHeaders,
            onUpgrade: openUpgrade,
            onAuthClick: () => setAuthOpen(true),
            consumeQuota,
          }}
        />
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

  return (
    <div className="site-shell min-h-screen">
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onLogin={handleLogin}
      />
      <div ref={homeScrollRef} className="home-scroll">
        <ScrollExperience scrollerRef={homeScrollRef} />
      <div id="home" className="cinematic-hero">
        <Navbar
          user={user}
          quota={quota}
          activePage={page}
          onNavigate={handleNavigate}
          onAuthClick={() => setAuthOpen(true)}
          onLogout={handleLogout}
          onOpenProfile={() => navigateTo("profile")}
        />
        <HeroSection onStartParse={() => navigateTo("parse")} />
      </div>

      <main className="cinematic-content" aria-label="主要内容">
        <FeaturesSection onStartParse={() => navigateTo("parse")} />
        <PricingSection
          currentUser={membershipUser}
          onUpgrade={handleUpgrade}
          onRedeemCode={redeemCode}
          onAuthClick={() => setAuthOpen(true)}
          onNavigate={handleNavigate}
          isLoading={isUpgrading}
        />
        <FAQSection />
        <ContactSection />
      </main>

      <Footer />
      </div>

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
