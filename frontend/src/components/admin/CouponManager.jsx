import { useState } from "react";
import { Copy, Download, Plus, Ticket, XCircle } from "lucide-react";
import { validateCouponBatch } from "../../services/adminApi";

const initialForm = { plan: "pro", order_type: "weekly", count: 1, expires_days: 0, note: "", max_redemptions: 1 };

export default function CouponManager({ coupons, onCreate, onRevoke, onExport, onFilter, loading }) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [createdCodes, setCreatedCodes] = useState([]);
  const [message, setMessage] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [busy, setBusy] = useState(false);
  const data = coupons || { items: [], total: 0, page: 1, page_size: 20 };

  const updateForm = (field, value) => {
    const next = { ...form, [field]: value };
    if (field === "plan") next.order_type = value === "ultra" ? "lifetime" : "weekly";
    setForm(next); setErrors({}); setMessage("");
  };
  const create = async (event) => {
    event.preventDefault();
    const nextErrors = validateCouponBatch(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setBusy(true); setMessage("");
    try { const result = await onCreate({ ...form, count: Number(form.count), expires_days: Number(form.expires_days), max_redemptions: Number(form.max_redemptions) }); setCreatedCodes(result.coupons || []); setMessage(`已生成 ${result.coupons?.length || 0} 张卡券`); } catch (error) { setMessage(error.message || "生成失败"); } finally { setBusy(false); }
  };
  const copyCodes = async () => { try { await navigator.clipboard.writeText(createdCodes.join("\n")); setMessage("卡券已复制到剪贴板"); } catch { setMessage("复制失败，请手动复制卡券列表"); } };
  const revoke = async () => { setBusy(true); try { await onRevoke(confirmCode); setConfirmCode(""); setMessage("卡券已撤销"); } catch (error) { setMessage(error.message || "撤销失败"); } finally { setBusy(false); } };

  return (
    <section className="admin-coupon-layout">
      <form className="admin-panel admin-coupon-form" onSubmit={create}>
        <header className="admin-section-heading"><div><span className="admin-eyebrow">CREATE</span><h2>批量生成卡券</h2></div><Ticket aria-hidden="true" /></header>
        <div className="admin-form-grid"><label>套餐<select value={form.plan} disabled={busy} onChange={(event) => updateForm("plan", event.target.value)}><option value="pro">Pro</option><option value="ultra">Ultra</option></select>{errors.plan ? <small>{errors.plan}</small> : null}</label><label>卡券类型<select value={form.order_type} disabled={busy} onChange={(event) => updateForm("order_type", event.target.value)}>{form.plan === "pro" ? <><option value="weekly">周卡</option><option value="monthly">月卡</option><option value="yearly">年卡</option></> : <option value="lifetime">终身卡</option>}</select>{errors.order_type ? <small>{errors.order_type}</small> : null}</label><label>生成数量<input type="number" min="1" max="100" value={form.count} onChange={(event) => updateForm("count", event.target.value)} />{errors.count ? <small>{errors.count}</small> : null}</label><label>有效期（天，0 为不限）<input type="number" min="0" max="3650" value={form.expires_days} onChange={(event) => updateForm("expires_days", event.target.value)} />{errors.expires_days ? <small>{errors.expires_days}</small> : null}</label><label>每张可用次数<input type="number" min="1" max="100" value={form.max_redemptions} onChange={(event) => updateForm("max_redemptions", event.target.value)} />{errors.max_redemptions ? <small>{errors.max_redemptions}</small> : null}</label><label>备注<input maxLength="120" value={form.note} onChange={(event) => updateForm("note", event.target.value)} placeholder="例如：闲鱼订单号" />{errors.note ? <small>{errors.note}</small> : null}</label></div>
        <button className="admin-primary-button" type="submit" disabled={busy}><Plus aria-hidden="true" />{busy ? "处理中…" : "生成卡券"}</button>
        {createdCodes.length ? <div className="admin-created-codes"><header><strong>本次生成</strong><button type="button" onClick={copyCodes}><Copy aria-hidden="true" />复制全部</button></header><textarea readOnly value={createdCodes.join("\n")} /></div> : null}
        {message ? <p className="admin-inline-message" aria-live="polite">{message}</p> : null}
      </form>
      <section className="admin-panel admin-coupon-list"><header className="admin-section-heading"><div><span className="admin-eyebrow">INVENTORY</span><h2>卡券管理</h2></div><button type="button" className="admin-export-button" onClick={() => onExport()}><Download aria-hidden="true" />导出 CSV</button></header><div className="admin-coupon-toolbar"><select onChange={(event) => onFilter(event.target.value)} defaultValue="all"><option value="all">全部状态</option><option value="active">可用</option><option value="used">已用完</option><option value="revoked">已撤销</option><option value="expired">已过期</option></select><span>{data.total} 张</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>卡券</th><th>套餐</th><th>状态</th><th>兑换进度</th><th>备注</th><th /></tr></thead><tbody>{data.items.length ? data.items.map((item) => <tr key={item.code}><td><code>{item.code}</code></td><td>{item.plan} · {item.order_type}</td><td><span className={`admin-status is-${item.status}`}>{item.status}</span></td><td>{item.redeemed_count} / {item.max_redemptions}</td><td>{item.note || "—"}</td><td>{item.status === "active" ? <button className="admin-link-button is-danger" type="button" onClick={() => setConfirmCode(item.code)}>撤销</button> : null}</td></tr>) : <tr><td colSpan="6" className="admin-empty-cell">暂无卡券</td></tr>}</tbody></table></div>{confirmCode ? <div className="admin-confirm"><strong>确认撤销 {confirmCode}？</strong><p>撤销后不能继续兑换，已有兑换记录不会删除。</p><div><button type="button" onClick={() => setConfirmCode("")} disabled={busy}>取消</button><button type="button" className="is-danger" onClick={revoke} disabled={busy}><XCircle aria-hidden="true" />确认撤销</button></div></div> : null}</section>
    </section>
  );
}
