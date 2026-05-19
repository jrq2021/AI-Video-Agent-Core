import { useState } from "react";

const navItems = [
  { label: "首页", href: "#home" },
  { label: "功能特色", href: "#features" },
  { label: "套餐定价", href: "#pricing" },
  { label: "常见问题", href: "#faq" },
  { label: "联系我们", href: "#contact" },
];

// 会员等级样式映射
const PLAN_STYLES = {
  free: { bg: "bg-dark-100", text: "text-dark-600", label: "免费版" },
  pro: { bg: "bg-primary-100", text: "text-primary-700", label: "Pro" },
  ultra: { bg: "bg-purple-100", text: "text-purple-700", label: "Ultra" },
  guest: { bg: "bg-dark-100", text: "text-dark-500", label: "游客" },
};

export default function Navbar({ user, quota, onAuthClick, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNavClick = (e, href) => {
    e.preventDefault();
    setMobileOpen(false);
    if (href === "#home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const el = document.querySelector(href);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-dark-100/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/30 group-hover:shadow-primary-500/50 transition-shadow">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </div>
            <span className="text-lg font-bold text-dark-900 tracking-tight">
              万能视频下载
            </span>
          </a>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={(e) => handleNavClick(e, item.href)}
                className="text-sm text-dark-500 hover:text-primary-600 transition-colors font-medium"
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                {/* ── 会员等级徽章 + 额度 ── */}
                {quota && (
                  <div className="flex items-center gap-2 mr-1">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        (PLAN_STYLES[quota.plan] || PLAN_STYLES.free).bg
                      } ${(PLAN_STYLES[quota.plan] || PLAN_STYLES.free).text}`}
                    >
                      {(PLAN_STYLES[quota.plan] || PLAN_STYLES.free).label}
                    </span>
                    <span className="text-xs text-dark-400">
                      下载{" "}
                      <span className="font-semibold text-dark-600">
                        {quota.daily_downloads_used}/
                        {quota.daily_downloads_limit}
                      </span>
                    </span>
                  </div>
                )}
                <span className="text-sm text-dark-500">{user.username}</span>
                <button
                  onClick={onLogout}
                  className="btn-secondary text-sm !px-4 !py-2"
                >
                  退出
                </button>
              </>
            ) : (
              <>
                {/* ── 游客额度提示 ── */}
                {quota && quota.is_guest && (
                  <span className="text-xs text-dark-400 mr-1">
                    今日剩余{" "}
                    <span className="font-semibold text-dark-600">
                      {Math.max(
                        0,
                        (quota.daily_downloads_limit || 1) -
                          (quota.daily_downloads_used || 0),
                      )}
                    </span>{" "}
                    次下载
                  </span>
                )}
                <button
                  onClick={onAuthClick}
                  className="btn-secondary text-sm !px-4 !py-2"
                >
                  登录
                </button>
                <button
                  onClick={onAuthClick}
                  className="btn-primary text-sm !px-4 !py-2"
                >
                  免费试用
                </button>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-dark-500 hover:text-dark-700"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              {mobileOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden pb-4 border-t border-dark-100 pt-3 animate-fade-in-up">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={(e) => handleNavClick(e, item.href)}
                className="block py-2.5 text-sm text-dark-500 hover:text-primary-600 font-medium"
              >
                {item.label}
              </a>
            ))}
            <div className="flex gap-3 mt-3">
              {user ? (
                <button
                  onClick={onLogout}
                  className="btn-secondary text-sm flex-1 !py-2"
                >
                  退出登录
                </button>
              ) : (
                <>
                  <button
                    onClick={onAuthClick}
                    className="btn-secondary text-sm flex-1 !py-2"
                  >
                    登录
                  </button>
                  <button
                    onClick={onAuthClick}
                    className="btn-primary text-sm flex-1 !py-2"
                  >
                    注册
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
