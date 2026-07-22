import { useEffect, useState } from "react";
import { ArrowLeft, BarChart3, FileClock, LogOut, Ticket, UsersRound } from "lucide-react";
import { buildUserQuery, downloadCouponCsv, requestAdmin } from "../services/adminApi";
import AdminOverview from "./admin/AdminOverview";
import AuditLogTable from "./admin/AuditLogTable";
import CouponManager from "./admin/CouponManager";
import UserDetailDrawer from "./admin/UserDetailDrawer";
import UserTable from "./admin/UserTable";

const tabs = [
  { id: "overview", label: "概览", icon: BarChart3 },
  { id: "users", label: "用户", icon: UsersRound },
  { id: "coupons", label: "卡券", icon: Ticket },
  { id: "audit", label: "日志", icon: FileClock },
];

export default function AdminPage({ token, currentUser, onBackHome, onLogout }) {
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState(null);
  const [coupons, setCoupons] = useState(null);
  const [audit, setAudit] = useState(null);
  const [filters, setFilters] = useState({ query: "", status: "all", plan: "all", page: 1 });
  const [couponStatus, setCouponStatus] = useState("all");
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);

  const loadAll = async (nextFilters = filters, nextCouponStatus = couponStatus) => {
    if (!token) return;
    setLoading(true); setError("");
    try {
      const [overviewData, userData, couponData, auditData] = await Promise.all([
        requestAdmin("/overview", {}, token),
        requestAdmin(`/users${buildUserQuery(nextFilters)}`, {}, token),
        requestAdmin(`/coupons?status=${encodeURIComponent(nextCouponStatus)}&page=1&page_size=20`, {}, token),
        requestAdmin("/audit-logs?page=1&page_size=20", {}, token),
      ]);
      setOverview(overviewData); setUsers(userData); setCoupons(couponData); setAudit(auditData); setAccessDenied(false);
    } catch (requestError) {
      const message = requestError.message || "后台数据加载失败";
      setError(message); setAccessDenied(/权限|无权/.test(message));
    } finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, [token]);

  const updateUsers = async (nextFilters) => { const normalized = { ...nextFilters, page: nextFilters.page || 1 }; setFilters(normalized); await loadAll(normalized, couponStatus); };
  const updateCoupons = async (nextStatus) => { setCouponStatus(nextStatus); await loadAll(filters, nextStatus); };
  const updateMembership = async (userId, payload) => { await requestAdmin(`/users/${encodeURIComponent(userId)}/membership`, { method: "PATCH", body: payload }, token); setSelectedUser(null); await loadAll(); };
  const updateStatus = async (userId, status) => { await requestAdmin(`/users/${encodeURIComponent(userId)}/status`, { method: "PATCH", body: { status } }, token); setSelectedUser(null); await loadAll(); };
  const createCoupons = async (payload) => { const result = await requestAdmin("/coupons/batch", { method: "POST", body: payload }, token); await loadAll(); return result; };
  const revokeCoupon = async (code) => { await requestAdmin(`/coupons/${encodeURIComponent(code)}/revoke`, { method: "POST" }, token); await loadAll(); };

  if (!token) return <main className="admin-guard"><h1>请先登录</h1><p>登录管理员账号后即可进入后台。</p><button type="button" onClick={onBackHome}>返回首页</button></main>;
  if (accessDenied) return <main className="admin-guard"><h1>无管理权限</h1><p>{error}</p><button type="button" onClick={onBackHome}>返回首页</button></main>;

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar"><button type="button" className="admin-brand" onClick={onBackHome}><span>JDNLAB</span><strong>运营后台</strong></button><nav aria-label="后台导航">{tabs.map(({ id, label, icon: Icon }) => <button type="button" className={tab === id ? "is-active" : ""} onClick={() => setTab(id)} key={id}><Icon aria-hidden="true" />{label}</button>)}</nav><div className="admin-sidebar__footer"><button type="button" onClick={onBackHome}><ArrowLeft aria-hidden="true" />返回网站</button><button type="button" onClick={onLogout}><LogOut aria-hidden="true" />退出登录</button></div></aside>
      <section className="admin-main"><header className="admin-topbar"><div><span className="admin-eyebrow">ADMIN CONSOLE</span><h1>{tabs.find((item) => item.id === tab)?.label || "后台"}</h1></div><div className="admin-topbar__user"><span>{currentUser?.email || "已登录管理员"}</span><i /></div></header>{error ? <div className="admin-error" role="alert"><span>{error}</span><button type="button" onClick={() => loadAll()}>重试</button></div> : null}{loading && !overview ? <div className="admin-skeleton"><i /><i /><i /><i /></div> : null}{!loading || overview ? <div className="admin-content">{tab === "overview" ? <AdminOverview overview={overview} /> : null}{tab === "users" ? <UserTable users={users} filters={filters} onFiltersChange={setFilters} onSearch={(next) => updateUsers({ ...next, page: 1 })} onPage={(page) => updateUsers({ ...filters, page })} onSelect={setSelectedUser} loading={loading} /> : null}{tab === "coupons" ? <CouponManager coupons={coupons} onCreate={createCoupons} onRevoke={revokeCoupon} onExport={() => downloadCouponCsv(token, couponStatus)} onFilter={updateCoupons} loading={loading} /> : null}{tab === "audit" ? <AuditLogTable logs={audit} /> : null}</div> : null}</section>
      <UserDetailDrawer user={selectedUser} currentUserId={currentUser?.id} onClose={() => setSelectedUser(null)} onMembership={updateMembership} onStatus={updateStatus} />
    </main>
  );
}
