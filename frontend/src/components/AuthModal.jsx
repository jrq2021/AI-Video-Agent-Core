import { useEffect, useState } from "react";
import { KeyRound, LockKeyhole, Mail, UserRound, X } from "lucide-react";

const initialForm = {
  username: "",
  email: "",
  password: "",
  login: "",
  code: "",
};

const modeMeta = {
  login: {
    title: "登录",
    submit: "登录",
    loading: "正在登录...",
  },
  register: {
    title: "注册账号",
    submit: "创建账号",
    loading: "正在创建...",
    purpose: "register",
  },
  reset: {
    title: "找回密码",
    submit: "重置并登录",
    loading: "正在重置...",
    purpose: "reset_password",
  },
};

export default function AuthModal({ isOpen, onClose, onLogin }) {
  const [mode, setMode] = useState("login"); // login | register | reset
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!isOpen) return undefined;

    setMode("login");
    setForm(initialForm);
    setError("");
    setNotice("");
    setLoading(false);
    setSendingCode(false);
    setCooldown(0);

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;

    const timer = window.setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldown]);

  if (!isOpen) return null;

  const current = modeMeta[mode];

  const handleChange = (field) => (event) => {
    setForm((value) => ({ ...value, [field]: event.target.value }));
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setNotice("");
    setCooldown(0);
    setForm((value) => ({
      ...value,
      code: "",
      password: nextMode === "login" ? value.password : "",
    }));
  };

  const sendCode = async () => {
    if (!current.purpose || sendingCode || cooldown > 0) return;

    const email = form.email.trim();
    if (!email) {
      setError("请先填写邮箱");
      return;
    }

    setError("");
    setNotice("");
    setSendingCode(true);

    try {
      const response = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: current.purpose }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        throw new Error(data.detail || "验证码发送失败");
      }

      setCooldown(data.cooldown || 60);
      setNotice(
        data.debug_code
          ? `开发验证码：${data.debug_code}`
          : "验证码已发送，请查看邮箱",
      );
    } catch (err) {
      setError(err.message || "验证码发送失败，请稍后再试");
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    try {
      let endpoint = "/api/auth/login";
      let body = { login: form.login, password: form.password };

      if (mode === "register") {
        endpoint = "/api/auth/register";
        body = {
          username: form.username,
          email: form.email,
          password: form.password,
          code: form.code,
        };
      } else if (mode === "reset") {
        endpoint = "/api/auth/reset-password";
        body = {
          email: form.email,
          password: form.password,
          code: form.code,
        };
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        throw new Error(data.detail || "操作失败");
      }

      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("auth_user", JSON.stringify(data.user));
      onLogin(data.user, data.token);
      onClose();
    } catch (err) {
      setError(err.message || "网络错误，请检查后端服务");
    } finally {
      setLoading(false);
    }
  };

  const needsEmailCode = mode === "register" || mode === "reset";

  return (
    <div className="auth-modal" role="presentation">
      <div className="auth-modal__backdrop" onClick={onClose} aria-hidden="true" />

      <div
        className="auth-modal__surface animate-fade-in-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        <div className="auth-modal__glow" aria-hidden="true" />

        <header className="auth-modal__header">
          <h2 id="auth-modal-title">{current.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="auth-modal__close"
            aria-label="关闭登录窗口"
          >
            <X aria-hidden="true" strokeWidth={1.7} />
          </button>
        </header>

        <div className="auth-modal__tabs" role="tablist" aria-label="账号操作">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={mode === "login" ? "is-active" : ""}
            onClick={() => switchMode("login")}
          >
            登录
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? "is-active" : ""}
            onClick={() => switchMode("register")}
          >
            注册
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "reset"}
            className={mode === "reset" ? "is-active" : ""}
            onClick={() => switchMode("reset")}
          >
            找回密码
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-modal__form" autoComplete="off">
          <input
            className="auth-modal__autofill-trap"
            type="text"
            name="prevent_saved_account"
            autoComplete="off"
            tabIndex={-1}
            aria-hidden="true"
            readOnly
          />
          <input
            className="auth-modal__autofill-trap"
            type="password"
            name="prevent_saved_password"
            autoComplete="off"
            tabIndex={-1}
            aria-hidden="true"
            readOnly
          />
          {mode === "register" && (
            <label className="auth-modal__field">
              <span>用户名</span>
              <span className="auth-modal__input">
                <UserRound aria-hidden="true" strokeWidth={1.7} />
                <input
                  type="text"
                  name="register_display_name"
                  value={form.username}
                  onChange={handleChange("username")}
                  placeholder="2-30 个字符"
                  autoComplete="off"
                  required
                  minLength={2}
                />
              </span>
            </label>
          )}

          {mode === "login" ? (
            <label className="auth-modal__field">
              <span>用户名 / 邮箱</span>
              <span className="auth-modal__input">
                <UserRound aria-hidden="true" strokeWidth={1.7} />
                <input
                  type="text"
                  name="login_identifier"
                  value={form.login}
                  onChange={handleChange("login")}
                  placeholder="输入用户名或邮箱"
                  autoComplete="off"
                  autoFocus
                  required
                />
              </span>
            </label>
          ) : (
            <label className="auth-modal__field">
              <span>邮箱</span>
              <span className="auth-modal__input">
                <Mail aria-hidden="true" strokeWidth={1.7} />
                <input
                  type="email"
                  name={mode === "register" ? "register_email" : "reset_email"}
                  value={form.email}
                  onChange={handleChange("email")}
                  placeholder="example@mail.com"
                  autoComplete="off"
                  required
                  autoFocus={mode !== "login"}
                />
              </span>
            </label>
          )}

          {needsEmailCode && (
            <label className="auth-modal__field">
              <span>邮箱验证码</span>
              <span className="auth-modal__code-row">
                <span className="auth-modal__input">
                  <KeyRound aria-hidden="true" strokeWidth={1.7} />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.code}
                    onChange={handleChange("code")}
                    placeholder="6 位验证码"
                    autoComplete="one-time-code"
                    required
                    minLength={4}
                  />
                </span>
                <button
                  type="button"
                  className="auth-modal__code-button"
                  onClick={sendCode}
                  disabled={sendingCode || cooldown > 0}
                >
                  {sendingCode
                    ? "发送中..."
                    : cooldown > 0
                      ? `${cooldown}s`
                      : "发送验证码"}
                </button>
              </span>
            </label>
          )}

          <label className="auth-modal__field">
            <span>{mode === "reset" ? "新密码" : "密码"}</span>
            <span className="auth-modal__input">
              <LockKeyhole aria-hidden="true" strokeWidth={1.7} />
              <input
                type="password"
                name={mode === "login" ? "login_secret" : "new_secret"}
                value={form.password}
                onChange={handleChange("password")}
                placeholder="至少 6 位"
                autoComplete="off"
                required
                minLength={6}
              />
            </span>
          </label>

          {notice && (
            <p className="auth-modal__hint" role="status">
              {notice}
            </p>
          )}

          {error && (
            <p className="auth-modal__error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="auth-modal__submit"
          >
            {loading ? current.loading : current.submit}
          </button>

          <p className="auth-modal__switch">
            {mode === "login" ? (
              <>
                还没有账号？
                <button type="button" onClick={() => switchMode("register")}>
                  立即注册
                </button>
                <span aria-hidden="true"> · </span>
                <button type="button" onClick={() => switchMode("reset")}>
                  忘记密码？
                </button>
              </>
            ) : (
              <>
                已有账号？
                <button type="button" onClick={() => switchMode("login")}>
                  去登录
                </button>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
