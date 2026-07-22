import { useEffect, useState } from "react";
import { X } from "lucide-react";

function formatDate(timestamp) {
  if (!timestamp) return "长期有效";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date(timestamp * 1000));
}

function orderTypesFor(plan) {
  if (plan === "ultra") return ["lifetime"];
  if (plan === "pro") return ["weekly", "monthly", "yearly"];
  return ["monthly"];
}

export default function UserDetailDrawer({ user, currentUserId, onClose, onMembership, onStatus }) {
  const [plan, setPlan] = useState(user?.plan || "free");
  const [orderType, setOrderType] = useState("monthly");
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isSelf = user?.id === currentUserId;

  useEffect(() => {
    setPlan(user?.plan || "free");
    setOrderType(user?.plan === "ultra" ? "lifetime" : "monthly");
    setPending(null);
    setError("");
  }, [user]);

  if (!user) return null;
  const types = orderTypesFor(plan);
  const requestMembership = () => setPending({ kind: "membership", label: `调整为 ${plan.toUpperCase()} 套餐` });
  const requestStatus = (status, label) => setPending({ kind: "status", status, label });
  const confirm = async () => {
    setBusy(true); setError("");
    try {
      if (pending.kind === "membership") await onMembership(user.id, { plan, order_type: orderType });
      else await onStatus(user.id, pending.status);
      setPending(null);
    } catch (requestError) {
      setError(requestError.message || "操作失败，请稍后重试");
    } finally { setBusy(false); }
  };

  return (
    <div className="admin-drawer-layer" role="presentation" onMouseDown={onClose}>
      <aside className="admin-drawer" role="dialog" aria-modal="true" aria-label="用户详情" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span className="admin-eyebrow">USER DETAIL</span><h2>{user.username}</h2><p>{user.email}</p></div><button type="button" onClick={onClose} aria-label="关闭"><X aria-hidden="true" /></button></header>
        <dl className="admin-detail-list"><div><dt>账号状态</dt><dd>{user.account_status}</dd></div><div><dt>当前套餐</dt><dd>{user.plan}</dd></div><div><dt>到期时间</dt><dd>{formatDate(user.expires_at)}</dd></div><div><dt>今日用量</dt><dd>{Object.values(user.daily_usage || {}).reduce((sum, value) => sum + Number(value || 0), 0)} 次</dd></div></dl>
        <section className="admin-drawer-section"><h3>调整套餐</h3><div className="admin-form-grid"><label>套餐<select value={plan} disabled={isSelf || busy} onChange={(event) => { const next = event.target.value; setPlan(next); setOrderType(orderTypesFor(next)[0]); }}><option value="free">免费版</option><option value="pro">Pro</option><option value="ultra">Ultra</option></select></label><label>类型<select value={orderType} disabled={isSelf || busy} onChange={(event) => setOrderType(event.target.value)}>{types.map((item) => <option value={item} key={item}>{item}</option>)}</select></label></div><button type="button" className="admin-primary-button" disabled={isSelf || busy} onClick={requestMembership}>保存套餐</button></section>
        <section className="admin-drawer-section"><h3>账号状态</h3><div className="admin-action-row">{user.account_status !== "active" ? <button type="button" disabled={isSelf || busy} onClick={() => requestStatus("active", "恢复账号")}>恢复账号</button> : <button type="button" disabled={isSelf || busy} onClick={() => requestStatus("disabled", "禁用账号")}>禁用账号</button>} {user.account_status !== "deleted" ? <button type="button" className="is-danger" disabled={isSelf || busy} onClick={() => requestStatus("deleted", "逻辑删除账号")}>删除账号</button> : null}</div>{isSelf ? <p className="admin-muted">为保护后台，不能操作当前登录的管理员账号。</p> : null}</section>
        <section className="admin-drawer-section"><h3>最近兑换</h3>{user.recent_redemptions?.length ? <ul className="admin-redemption-list">{user.recent_redemptions.map((item) => <li key={`${item.code}-${item.redeemed_at}`}><span>{item.code}</span><small>{item.plan} · {formatDate(item.redeemed_at)}</small></li>)}</ul> : <p className="admin-muted">暂无兑换记录</p>}</section>
        {pending ? <div className="admin-confirm"><strong>确认{pending.label}？</strong><p>该操作会写入后台审计日志。</p><div><button type="button" onClick={() => setPending(null)} disabled={busy}>取消</button><button type="button" className="is-danger" onClick={confirm} disabled={busy}>{busy ? "处理中…" : "确认执行"}</button></div></div> : null}
        {error ? <p className="admin-inline-error" aria-live="polite">{error}</p> : null}
      </aside>
    </div>
  );
}
