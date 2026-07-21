import {
  ArrowLeft,
  CalendarDays,
  Crown,
  Download,
  LogIn,
  LogOut,
  Mail,
  Sparkles,
  UserRound,
} from "lucide-react";
import DownloadHistory from "./DownloadHistory";

const planLabels = {
  free: "免费版",
  pro: "专业版",
  ultra: "旗舰版",
};

function getRemaining(limit = 0, used = 0) {
  return Math.max(0, limit - used);
}

export default function ProfilePage({
  user,
  quota,
  onBackHome,
  onAuthClick,
  onLogout,
  onContinueHistory,
  onNavigate,
}) {
  const plan = quota?.plan && quota.plan !== "guest"
    ? quota.plan
    : user?.plan || "free";
  const planLabel = planLabels[plan] || "免费版";
  const avatarText = user?.username?.trim()?.slice(0, 1)?.toUpperCase() || "用";
  const downloadRemaining = getRemaining(
    quota?.daily_downloads_limit,
    quota?.daily_downloads_used,
  );
  const summaryRemaining = getRemaining(
    quota?.daily_summaries_limit,
    quota?.daily_summaries_used,
  );
  const batchRemaining = getRemaining(
    quota?.daily_batch_items_limit,
    quota?.daily_batch_items_used,
  );
  const creatorRemaining = getRemaining(
    quota?.daily_creator_credits_limit,
    quota?.daily_creator_credits_used,
  );
  const expiryText = quota?.expires_at
    ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date(quota.expires_at * 1000))
    : plan === "ultra" ? "长期有效" : "未开通";

  return (
    <div className="profile-page">
      <header className="profile-navbar">
        <button type="button" className="profile-navbar__brand" onClick={onBackHome}>
          万能视频下载
        </button>
        <button type="button" className="profile-back-button" onClick={onBackHome}>
          <ArrowLeft aria-hidden="true" strokeWidth={1.8} />
          返回首页
        </button>
      </header>

      <main className="profile-page__main cinematic-content">
        <header className="profile-page__heading">
          <div>
            <span>PERSONAL CENTER</span>
            <h1>个人中心</h1>
          </div>
          <p>管理账户权益与解析记录，让字幕和 AI 成果随时接着使用。</p>
        </header>

        {!user ? (
          <section className="profile-login-prompt">
            <span className="profile-login-prompt__icon">
              <UserRound aria-hidden="true" strokeWidth={1.5} />
            </span>
            <h2>登录后查看个人中心</h2>
            <p>登录后可查看账户资料、会员权益与同步保存的解析历史。</p>
            <button type="button" onClick={onAuthClick}>
              <LogIn aria-hidden="true" strokeWidth={1.8} />
              立即登录
            </button>
          </section>
        ) : (
          <div className="profile-layout">
            <aside className="profile-sidebar">
              <section className="profile-user-card">
                <span className="profile-user-card__avatar" aria-hidden="true">
                  {avatarText}
                </span>
                <div className="profile-user-card__identity">
                  <h2>{user.username}</h2>
                  <p>
                    <Mail aria-hidden="true" strokeWidth={1.7} />
                    {user.email || "未绑定邮箱"}
                  </p>
                </div>

                <div className="profile-plan-row">
                  <span>
                    <Crown aria-hidden="true" strokeWidth={1.7} />
                    当前方案
                  </span>
                  <strong>{planLabel}</strong>
                </div>
                <div className="profile-plan-row">
                  <span>权益到期</span>
                  <strong>{expiryText}</strong>
                </div>

                <button type="button" className="profile-redeem" onClick={() => onNavigate?.({ page: "redeem" })}>
                  兑换会员码
                </button>

                <button type="button" className="profile-logout" onClick={onLogout}>
                  <LogOut aria-hidden="true" strokeWidth={1.7} />
                  退出登录
                </button>
              </section>

              <section className="profile-quota-card">
                <header>
                  <CalendarDays aria-hidden="true" strokeWidth={1.7} />
                  <div>
                    <h3>今日可用额度</h3>
                    <p>每天自动刷新</p>
                  </div>
                </header>
                <div className="profile-quota-grid">
                  <article>
                    <Download aria-hidden="true" strokeWidth={1.7} />
                    <span>视频下载</span>
                    <strong>{downloadRemaining}</strong>
                    <small>剩余次数</small>
                  </article>
                  <article>
                    <Sparkles aria-hidden="true" strokeWidth={1.7} />
                    <span>批量解析</span>
                    <strong>{batchRemaining}</strong>
                    <small>今日剩余条数</small>
                  </article>
                  <article>
                    <Sparkles aria-hidden="true" strokeWidth={1.7} />
                    <span>创作额度</span>
                    <strong>{creatorRemaining}</strong>
                    <small>今日剩余次数</small>
                  </article>
                  <article>
                    <Sparkles aria-hidden="true" strokeWidth={1.7} />
                    <span>AI 总结</span>
                    <strong>{summaryRemaining}</strong>
                    <small>剩余次数</small>
                  </article>
                </div>
              </section>
            </aside>

            <DownloadHistory
              showEmpty
              variant="profile"
              user={user}
              onContinueHistory={onContinueHistory}
            />
          </div>
        )}
      </main>
    </div>
  );
}
