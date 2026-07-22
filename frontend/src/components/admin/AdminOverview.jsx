import { Activity, BadgeCheck, Ticket, UsersRound } from "lucide-react";
import { buildTrendPoints } from "../../services/adminApi";

const metricMeta = [
  { key: "total_users", label: "累计用户", icon: UsersRound },
  { key: "today_new_users", label: "今日新增", icon: Activity },
  { key: "paid_users", label: "有效付费用户", icon: BadgeCheck },
  { key: "today_coupon_redemptions", label: "今日卡券兑换", icon: Ticket },
];

const planLabels = { free: "免费版", pro: "Pro", ultra: "Ultra" };

export default function AdminOverview({ overview }) {
  const metrics = overview?.metrics || {};
  const trend = overview?.registration_trend || [];
  const points = buildTrendPoints(trend, 300, 120).join(" ");
  const plans = overview?.plan_distribution || [];
  const totalPlans = Math.max(1, plans.reduce((sum, item) => sum + Number(item.count || 0), 0));

  return (
    <section className="admin-overview" aria-label="运营概览">
      <div className="admin-metric-grid">
        {metricMeta.map(({ key, label, icon: Icon }) => (
          <article className="admin-metric" key={key}>
            <span className="admin-metric__icon"><Icon aria-hidden="true" /></span>
            <span>{label}</span>
            <strong>{Number(metrics[key] || 0).toLocaleString("zh-CN")}</strong>
          </article>
        ))}
      </div>

      <div className="admin-visual-grid">
        <article className="admin-panel admin-trend-panel">
          <header>
            <div>
              <span className="admin-eyebrow">GROWTH</span>
              <h2>近 7 日注册趋势</h2>
            </div>
            <small>按自然日统计</small>
          </header>
          {trend.length ? (
            <>
              <svg className="admin-trend" viewBox="0 0 300 120" role="img" aria-label="近七日注册趋势图">
                <defs>
                  <linearGradient id="adminTrendFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="rgba(118, 230, 233, 0.38)" />
                    <stop offset="100%" stopColor="rgba(118, 230, 233, 0)" />
                  </linearGradient>
                </defs>
                <path d={`M ${points} L 300,120 L 0,120 Z`} fill="url(#adminTrendFill)" />
                <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="admin-trend__labels">
                {trend.map((item) => <span key={item.date}>{item.date.slice(5)}</span>)}
              </div>
            </>
          ) : <p className="admin-empty">暂无注册数据</p>}
        </article>

        <article className="admin-panel admin-distribution-panel">
          <header>
            <div>
              <span className="admin-eyebrow">MEMBERSHIP</span>
              <h2>套餐分布</h2>
            </div>
          </header>
          <div className="admin-plan-list">
            {plans.map((item) => (
              <div className="admin-plan-row" key={item.plan}>
                <span>{planLabels[item.plan] || item.plan}</span>
                <div><i style={{ width: `${(Number(item.count || 0) / totalPlans) * 100}%` }} /></div>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
          <div className="admin-coupon-summary">
            {Object.entries(overview?.coupon_statuses || {}).map(([status, count]) => (
              <span key={status}>{status}<b>{count}</b></span>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
