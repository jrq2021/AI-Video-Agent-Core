import { useState } from "react";

export default function AuthModal({ isOpen, onClose, onLogin }) {
  const [tab, setTab] = useState("login"); // login | register
  const [form, setForm] = useState({ username: "", email: "", password: "", login: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let endpoint, body;
      if (tab === "register") {
        endpoint = "/api/auth/register";
        body = { username: form.username, email: form.email, password: form.password };
      } else {
        endpoint = "/api/auth/login";
        body = { login: form.login, password: form.password };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem("auth_token", data.token);
        localStorage.setItem("auth_user", JSON.stringify(data.user));
        onLogin(data.user, data.token);
        onClose();
      } else {
        setError(data.detail || "操作失败");
      }
    } catch {
      setError("网络错误，请检查后端服务");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
  };

  const switchTab = (t) => {
    setTab(t);
    setError("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>

      {/* 弹窗 */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up">
        {/* 头部 */}
        <div className="p-6 pb-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-dark-900">
              {tab === "login" ? "登录" : "注册"}
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-dark-50 text-dark-400 hover:text-dark-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tab 切换 */}
          <div className="flex bg-dark-50 rounded-xl p-1 mb-4">
            <button
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${tab === "login" ? "bg-white text-dark-900 shadow-sm" : "text-dark-400"}`}
              onClick={() => switchTab("login")}
            >
              登录
            </button>
            <button
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${tab === "register" ? "bg-white text-dark-900 shadow-sm" : "text-dark-400"}`}
              onClick={() => switchTab("register")}
            >
              注册
            </button>
          </div>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="px-6 pb-6">
          {tab === "register" && (
            <>
              <label className="block text-sm font-medium text-dark-700 mb-1">用户名</label>
              <input
                type="text"
                value={form.username}
                onChange={handleChange("username")}
                placeholder="2-30个字符"
                required
                minLength={2}
                className="w-full px-4 py-2.5 rounded-xl border border-dark-200 text-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-50 outline-none mb-3"
              />

              <label className="block text-sm font-medium text-dark-700 mb-1">邮箱</label>
              <input
                type="email"
                value={form.email}
                onChange={handleChange("email")}
                placeholder="example@mail.com"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-dark-200 text-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-50 outline-none mb-3"
              />
            </>
          )}

          {tab === "login" && (
            <>
              <label className="block text-sm font-medium text-dark-700 mb-1">用户名 / 邮箱</label>
              <input
                type="text"
                value={form.login}
                onChange={handleChange("login")}
                placeholder="输入用户名或邮箱"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-dark-200 text-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-50 outline-none mb-3"
              />
            </>
          )}

          <label className="block text-sm font-medium text-dark-700 mb-1">密码</label>
          <input
            type="password"
            value={form.password}
            onChange={handleChange("password")}
            placeholder="至少6位"
            required
            minLength={6}
            className="w-full px-4 py-2.5 rounded-xl border border-dark-200 text-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-50 outline-none mb-4"
          />

          {error && (
            <p className="text-red-500 text-sm mb-3 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-primary-600 text-white rounded-xl font-medium text-sm hover:bg-primary-700 disabled:opacity-50 transition-all shadow-md shadow-primary-600/20"
          >
            {loading ? "处理中..." : tab === "login" ? "登录" : "创建账号"}
          </button>

          <p className="text-xs text-dark-400 text-center mt-4">
            {tab === "login" ? "还没有账号？" : "已有账号？"}
            <button
              type="button"
              onClick={() => switchTab(tab === "login" ? "register" : "login")}
              className="text-primary-600 hover:underline ml-1 font-medium"
            >
              {tab === "login" ? "立即注册" : "去登录"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
