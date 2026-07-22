function formatDate(timestamp) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp * 1000));
}

const statusLabels = { active: "正常", disabled: "已禁用", deleted: "已删除" };

export default function UserTable({ users, filters, onFiltersChange, onSearch, onSelect, onPage, loading }) {
  const data = users || { items: [], total: 0, page: 1, page_size: 20 };
  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));
  return (
    <section className="admin-panel admin-users-panel">
      <header className="admin-section-heading"><div><span className="admin-eyebrow">CUSTOMERS</span><h2>用户管理</h2></div><small>{data.total} 位用户</small></header>
      <form className="admin-filter-row" onSubmit={(event) => { event.preventDefault(); onSearch(filters); }}>
        <input value={filters.query} onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })} placeholder="搜索用户名或邮箱" />
        <select value={filters.status} onChange={(event) => onFiltersChange({ ...filters, status: event.target.value })}>
          <option value="all">全部状态</option><option value="active">正常</option><option value="disabled">已禁用</option><option value="deleted">已删除</option>
        </select>
        <select value={filters.plan} onChange={(event) => onFiltersChange({ ...filters, plan: event.target.value })}>
          <option value="all">全部套餐</option><option value="free">免费版</option><option value="pro">Pro</option><option value="ultra">Ultra</option>
        </select>
        <button type="submit" disabled={loading}>查询</button>
      </form>
      <div className="admin-table-wrap">
        <table className="admin-table admin-user-table">
          <thead><tr><th>用户</th><th>状态</th><th>套餐</th><th>注册时间</th><th>今日用量</th><th /></tr></thead>
          <tbody>{data.items.length ? data.items.map((item) => (
            <tr key={item.id}>
              <td><strong>{item.username}</strong><small>{item.email}</small></td>
              <td><span className={`admin-status is-${item.account_status}`}>{statusLabels[item.account_status] || item.account_status}</span></td>
              <td><span className={`admin-plan is-${item.plan}`}>{item.plan}</span></td>
              <td>{formatDate(item.created_at)}</td>
              <td>{Object.values(item.daily_usage || {}).reduce((sum, value) => sum + Number(value || 0), 0)} 次</td>
              <td><button type="button" className="admin-link-button" onClick={() => onSelect(item)}>详情</button></td>
            </tr>
          )) : <tr><td colSpan="6" className="admin-empty-cell">暂无符合条件的用户</td></tr>}</tbody>
        </table>
      </div>
      <footer className="admin-pagination"><span>第 {data.page} / {totalPages} 页</span><div><button type="button" disabled={data.page <= 1 || loading} onClick={() => onPage(data.page - 1)}>上一页</button><button type="button" disabled={data.page >= totalPages || loading} onClick={() => onPage(data.page + 1)}>下一页</button></div></footer>
    </section>
  );
}
