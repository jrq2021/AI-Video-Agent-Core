function formatTime(timestamp) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function formatAction(action = "") {
  const labels = {
    "user.status.update": "账号状态调整",
    "user.membership.update": "套餐调整",
    "coupon.batch.create": "批量生成卡券",
    "coupon.revoke": "撤销卡券",
  };
  return labels[action] || action;
}

export default function AuditLogTable({ logs }) {
  const items = logs?.items || [];
  return (
    <section className="admin-panel admin-audit-panel">
      <header className="admin-section-heading">
        <div><span className="admin-eyebrow">AUDIT</span><h2>操作日志</h2></div>
        <small>保留 90 天</small>
      </header>
      {!items.length ? <p className="admin-empty">暂无后台操作记录</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>时间</th><th>管理员</th><th>操作</th><th>对象</th><th>结果</th></tr></thead>
            <tbody>{items.map((item) => (
              <tr key={item.id}>
                <td>{formatTime(item.created_at)}</td>
                <td>{item.actor_id.slice(0, 8)}</td>
                <td>{formatAction(item.action)}</td>
                <td>{item.target_type} · {String(item.target_id).slice(0, 12)}</td>
                <td>{item.after?.status || item.after?.plan || item.after?.count || "已完成"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
