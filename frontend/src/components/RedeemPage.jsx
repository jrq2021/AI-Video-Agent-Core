import { useMemo, useState } from "react";
import { ArrowLeft, BadgeCheck, CalendarDays, KeyRound, Sparkles } from "lucide-react";

function formatExpiry(timestamp) {
  if (!timestamp) return "长期有效";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function remaining(limit = 0, used = 0) {
  return Math.max(0, Number(limit || 0) - Number(used || 0));
}

export default function RedeemPage({
  user,
  quota,
  onRedeemCode,
  onAuthClick,
  onNavigate,
}) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState(null);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const batchRemaining = useMemo(
    () => remaining(quota?.daily_batch_items_limit, quota?.daily_batch_items_used),
    [quota],
  );
  const creatorRemaining = useMemo(
    () => remaining(quota?.daily_creator_credits_limit, quota?.daily_creator_credits_used),
    [quota],
  );

  const submit = async (event) => {
    event.preventDefault();
    if (!user) {
      setStatus({ type: "info", message: "请先登录账号，再兑换闲鱼收到的会员码。" });
      onAuthClick?.();
      return;
    }
    if (!code.trim()) {
      setStatus({ type: "error", message: "请输入兑换码。" });
      return;
    }
    setIsRedeeming(true);
    setStatus(null);
    try {
      const data = await onRedeemCode(code.trim());
      setCode("");
      setStatus({ type: "success", message: data.message || "兑换成功，权益已生效。" });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "兑换失败，请检查兑换码。" });
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <main className="redeem-page cinematic-content" aria-label="会员兑换中心">
      <header className="redeem-page__topbar">
        <button type="button" onClick={() => onNavigate?.({ page: "home" })}>
          <ArrowLeft aria-hidden="true" /> 返回首页
        </button>
        <button type="button" onClick={() => onNavigate?.({ page: "parse" })}>去解析工作台</button>
      </header>

      <section className="redeem-hero">
        <div>
          <span>REDEEM CENTER</span>
          <h1>收到兑换码后，<em>在这里开通</em></h1>
          <p>登录、输入闲鱼卖家发送的券码，即可看到到期日和今天可用的创作额度。</p>
        </div>
        <div className="redeem-hero__steps" aria-label="兑换步骤">
          <span><b>1</b> 登录账号</span>
          <span><b>2</b> 输入券码</span>
          <span><b>3</b> 去解析创作</span>
        </div>
      </section>

      <section className="redeem-layout">
        <form className="redeem-card redeem-form" onSubmit={submit}>
          <header>
            <KeyRound aria-hidden="true" />
            <div>
              <h2>兑换会员码</h2>
              <p>{user ? `当前账号：${user.username}` : "请先登录后兑换"}</p>
            </div>
          </header>
          <label htmlFor="redeem-code">会员兑换码</label>
          <input
            id="redeem-code"
            value={code}
            onChange={(event) => {
              setCode(event.target.value.toUpperCase());
              setStatus(null);
            }}
            placeholder="例如 JD-XXXX-XXXX-XXXX"
            autoComplete="off"
          />
          <button type="submit" disabled={isRedeeming}>
            <BadgeCheck aria-hidden="true" />
            {isRedeeming ? "正在兑换…" : user ? "立即兑换" : "登录后兑换"}
          </button>
          {status ? <p className={`redeem-form__status is-${status.type}`} aria-live="polite">{status.message}</p> : null}
        </form>

        <aside className="redeem-card redeem-benefits">
          <header>
            <Sparkles aria-hidden="true" />
            <div>
              <h2>{quota?.plan === "pro" ? "Pro 创作权益" : quota?.plan === "ultra" ? "Ultra 创作权益" : "开通后可获得"}</h2>
              <p><CalendarDays aria-hidden="true" /> {quota?.plan && quota.plan !== "guest" ? `到期：${formatExpiry(quota.expires_at)}` : "支持 Pro 周卡、月卡和年卡"}</p>
            </div>
          </header>
          <dl>
            <div><dt>今日批量解析</dt><dd>{batchRemaining} <small>/ {quota?.daily_batch_items_limit || 0} 条</small></dd></div>
            <div><dt>今日创作额度</dt><dd>{creatorRemaining} <small>/ {quota?.daily_creator_credits_limit || 0} 次</small></dd></div>
            <div><dt>双语字幕与创作包</dt><dd>{quota?.daily_creator_credits_limit ? "已解锁" : "Pro 专属"}</dd></div>
          </dl>
          <button type="button" onClick={() => onNavigate?.({ page: "parse" })}>
            立即去解析
          </button>
        </aside>
      </section>
    </main>
  );
}
