import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Crown,
  LogOut,
  Mail,
  UserRound,
} from "lucide-react";
import { APP_VERSION, VERSION_CHANGELOG, VERSION_RELEASE_DATE } from "../version";

const navItems = [
  { label: "首页", href: "#home" },
  { label: "解析工作台", href: "/parse" },
  { label: "功能特色", href: "#features" },
  { label: "常见问题", href: "#faq" },
  { label: "联系我们", href: "#contact" },
];

const navigationTargets = {
  "#home": { page: "home", sectionId: "home" },
  "/parse": { page: "parse" },
  "#features": { page: "home", sectionId: "features" },
  "#pricing": { page: "home", sectionId: "pricing" },
  "#faq": { page: "home", sectionId: "faq" },
  "#contact": { page: "home", sectionId: "contact" },
};

const planLabels = {
  free: "免费版",
  pro: "专业版",
  ultra: "旗舰版",
};

export default function Navbar({
  user,
  quota,
  activePage,
  onNavigate,
  onAuthClick,
  onLogout,
  onOpenProfile,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const versionRef = useRef(null);
  const currentPlan = quota?.plan || user?.plan || "free";
  const planLabel = planLabels[currentPlan] || "免费版";
  const avatarText = user?.username?.trim()?.slice(0, 1)?.toUpperCase() || "用";

  useEffect(() => {
    if (!accountOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!accountMenuRef.current?.contains(event.target)) {
        setAccountOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setAccountOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountOpen]);

  useEffect(() => {
    if (!user) setAccountOpen(false);
  }, [user]);

  useEffect(() => {
    if (!versionOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!versionRef.current?.contains(event.target)) {
        setVersionOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setVersionOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [versionOpen]);

  const handleNavClick = (event, href) => {
    event.preventDefault();
    setMobileOpen(false);
    setAccountOpen(false);
    const target = navigationTargets[href];
    if (target && onNavigate) {
      onNavigate(target);
      return;
    }
    document.querySelector(href)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleLogoutClick = () => {
    setAccountOpen(false);
    setMobileOpen(false);
    onLogout();
  };

  return (
    <header className="cinematic-navbar absolute inset-x-0 top-0 z-30">
      <div className="cinematic-navbar__surface mx-4 mt-5 flex max-w-7xl items-center justify-between rounded-full px-5 py-4 sm:mx-8 sm:px-8 xl:mx-auto">
        <div ref={versionRef} className="brand-version">
          <a
            href="#home"
            onClick={(event) => {
              setVersionOpen(false);
              handleNavClick(event, "#home");
            }}
            className="hero-brand text-white"
            aria-label="万能视频下载首页"
          >
            万能视频下载
          </a>
          <button
            type="button"
            className="version-badge"
            onClick={() => setVersionOpen((open) => !open)}
            aria-haspopup="dialog"
            aria-expanded={versionOpen}
          >
            {APP_VERSION}
          </button>

          {versionOpen ? (
            <div className="version-popover" role="dialog" aria-label="版本更新内容">
              <div className="version-popover__header">
                <span>版本更新</span>
                <strong>{APP_VERSION}</strong>
              </div>
              <p className="version-popover__date">{VERSION_RELEASE_DATE}</p>

              {VERSION_CHANGELOG.map((group) => (
                <section key={group.title} className="version-popover__section">
                  <h3>{group.title}</h3>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : null}
        </div>

        <nav className="hidden items-center gap-8 md:flex" aria-label="主导航">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              onClick={(event) => handleNavClick(event, item.href)}
              className={`text-sm transition-colors ${
                (activePage === "parse"
                  ? item.href === "/parse"
                  : item.href === "#home")
                  ? "text-white"
                  : "text-white/60 hover:text-white"
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <div ref={accountMenuRef} className="account-menu">
              <button
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                className="account-menu__trigger"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
              >
                <span className="account-menu__avatar" aria-hidden="true">
                  {avatarText}
                </span>
                <span className="account-menu__username">{user.username}</span>
                <ChevronDown
                  className={accountOpen ? "is-open" : ""}
                  aria-hidden="true"
                  strokeWidth={1.8}
                />
              </button>

              {accountOpen ? (
                <div className="account-menu__panel" role="menu">
                  <div className="account-menu__identity">
                    <span className="account-menu__avatar is-large" aria-hidden="true">
                      {avatarText}
                    </span>
                    <div>
                      <strong>{user.username}</strong>
                      <span>
                        <Mail aria-hidden="true" strokeWidth={1.7} />
                        {user.email || "未绑定邮箱"}
                      </span>
                    </div>
                  </div>

                  <div className="account-menu__plan">
                    <span>
                      <Crown aria-hidden="true" strokeWidth={1.7} />
                      当前方案
                    </span>
                    <strong>{planLabel}</strong>
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    className="account-menu__action"
                    onClick={() => {
                      setAccountOpen(false);
                      onOpenProfile?.();
                    }}
                  >
                    <UserRound aria-hidden="true" strokeWidth={1.7} />
                    查看个人中心
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogoutClick}
                    className="account-menu__logout"
                  >
                    <LogOut aria-hidden="true" strokeWidth={1.7} />
                    退出登录
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={onAuthClick}
              className="px-2 text-sm text-white/65 transition-colors hover:text-white"
            >
              登录
            </button>
          )}
          <a
            href="/parse"
            onClick={(event) =>
              handleNavClick(event, "/parse")
            }
            className="liquid-glass rounded-full px-6 py-2.5 text-sm text-white transition-transform duration-300 hover:scale-[1.03]"
          >
            开始解析
          </a>
        </div>

        <button
          type="button"
          className="liquid-glass flex size-11 items-center justify-center rounded-full text-white md:hidden"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "关闭导航" : "打开导航"}
        >
          <svg
            className="size-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            {mobileOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 7h16M4 12h16M4 17h16"
              />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen ? (
        <div className="mobile-nav-panel mx-4 rounded-3xl p-4 md:hidden">
          <nav className="flex flex-col" aria-label="移动端导航">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={(event) => handleNavClick(event, item.href)}
                className="rounded-2xl px-4 py-3 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </nav>

          {user ? (
            <div className="mobile-account-card">
              <div className="account-menu__identity">
                <span className="account-menu__avatar is-large" aria-hidden="true">
                  {avatarText}
                </span>
                <div>
                  <strong>{user.username}</strong>
                  <span>{user.email || "未绑定邮箱"}</span>
                </div>
              </div>
              <div className="account-menu__plan">
                <span>当前方案</span>
                <strong>{planLabel}</strong>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  onOpenProfile?.();
                }}
                className="account-menu__action"
              >
                <UserRound aria-hidden="true" strokeWidth={1.7} />
                查看个人中心
              </button>
              <button
                type="button"
                onClick={handleLogoutClick}
                className="account-menu__logout"
              >
                <LogOut aria-hidden="true" strokeWidth={1.7} />
                退出登录
              </button>
            </div>
          ) : null}

          <div
            className={`mt-3 grid gap-3 ${
              user ? "grid-cols-1" : "grid-cols-2"
            }`}
          >
            {!user ? (
              <button
                type="button"
                onClick={onAuthClick}
                className="rounded-full px-5 py-3 text-sm text-white/70"
              >
                登录
              </button>
            ) : null}
            <a
              href="/parse"
              onClick={(event) =>
                handleNavClick(event, "/parse")
              }
              className="liquid-glass rounded-full px-5 py-3 text-center text-sm text-white"
            >
              开始解析
            </a>
          </div>
        </div>
      ) : null}
    </header>
  );
}
