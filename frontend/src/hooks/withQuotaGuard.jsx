import { useState, useCallback } from "react";
import UpgradeModal from "../components/UpgradeModal";

/**
 * withQuotaGuard — 付费墙拦截高阶组件 (HOC)
 *
 * 包装任意触发操作的元素，当用户额度不足时自动拦截并弹出升级引导。
 *
 * 使用方式 1 — 包装按钮/链接：
 * ```jsx
 * <QuotaGuard action="download" user={user}>
 *   <button onClick={handleDownload}>下载视频</button>
 * </QuotaGuard>
 * ```
 *
 * 使用方式 2 — 通过 render prop 获取拦截能力：
 * ```jsx
 * <QuotaGuard action="summarize" user={user} render={({ guardedAction, checkThen }) => (
 *   <button onClick={() => checkThen(() => startSummary())}>
 *     AI 总结
 *   </button>
 * )} />
 * ```
 *
 * Props:
 * @param {string} action - 操作类型: 'download' | 'summarize' | 'mindmap'
 * @param {object} user - 当前用户对象
 * @param {React.ReactNode} children - 子元素（直接拦截模式）
 * @param {function} render - render prop（函数拦截模式）
 * @param {function} onUpgrade - 升级回调
 */

export default function withQuotaGuard({
  action,
  user,
  children,
  render,
  onUpgrade: externalOnUpgrade,
}) {
  const [showModal, setShowModal] = useState(false);
  const [modalReason, setModalReason] = useState("");
  const [isPaying, setIsPaying] = useState(false);

  /**
   * 检查前端额度（快速预检，后端会二次校验）
   */
  const checkFrontendQuota = useCallback(() => {
    if (!user?.quota) return { allowed: true }; // 未加载时放行

    const q = user.quota;

    if (action === "download") {
      const remaining = q.daily_downloads_limit - q.daily_downloads_used;
      if (remaining <= 0) {
        return {
          allowed: false,
          reason: `今日下载额度已用完（${q.daily_downloads_used}/${q.daily_downloads_limit}）`,
        };
      }
    } else if (action === "summarize" || action === "mindmap") {
      const remaining = q.daily_summaries_limit - q.daily_summaries_used;
      if (remaining <= 0) {
        return {
          allowed: false,
          reason: `今日 AI 总结额度已用完（${q.daily_summaries_used}/${q.daily_summaries_limit}）`,
        };
      }
      if (action === "mindmap" && !q.can_export_mindmap) {
        return {
          allowed: false,
          reason: "思维导图导出为 Pro/Ultra 专属功能，请升级后使用",
        };
      }
    }

    return { allowed: true };
  }, [user, action]);

  /**
   * 包装后的操作：先检查额度，通过后执行原操作
   */
  const guardedAction = useCallback(
    async (originalFn, skipCheck = false) => {
      if (!skipCheck) {
        const check = checkFrontendQuota();
        if (!check.allowed) {
          setModalReason(check.reason);
          setShowModal(true);
          return { allowed: false, reason: check.reason };
        }
      }
      // 额度通过，执行原操作（后端会做最终校验）
      if (originalFn) {
        return await originalFn();
      }
      return { allowed: true };
    },
    [checkFrontendQuota],
  );

  /**
   * 处理升级
   */
  const handleUpgrade = useCallback(
    async (plan, orderType) => {
      setIsPaying(true);
      try {
        if (externalOnUpgrade) {
          await externalOnUpgrade(plan, orderType);
        } else {
          const token = localStorage.getItem("auth_token");
          const res = await fetch("/api/membership/create-order", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ plan, order_type: orderType }),
          });
          const data = await res.json();
          if (data.success) {
            alert(
              `订单已创建（演示模式）\n订单号: ${data.order_id}\n金额: ¥${data.amount}\n套餐: ${plan}`,
            );
            setShowModal(false);
          } else {
            alert("创建订单失败: " + (data.detail || "未知错误"));
          }
        }
      } catch (e) {
        alert("网络错误，请稍后重试");
      } finally {
        setIsPaying(false);
      }
    },
    [externalOnUpgrade],
  );

  return (
    <>
      {/* 拦截弹窗 */}
      <UpgradeModal
        show={showModal}
        reason={modalReason}
        currentUser={user}
        onUpgrade={handleUpgrade}
        onClose={() => setShowModal(false)}
        isLoading={isPaying}
      />

      {/* Render prop 模式 */}
      {render ? render({ guardedAction, checkThen: guardedAction }) : children}
    </>
  );
}

/**
 * usePaywall — 轻量级付费墙 Hook（配合 withQuotaGuard 使用）
 *
 * 用于在组件内部需要手动触发额度检查的场景。
 *
 * 示例：
 * ```jsx
 * const { checkThen, UpgradeGuard } = usePaywall(user);
 *
 * return (
 *   <>
 *     <button onClick={() => checkThen('download', () => startDownload())}>
 *       下载
 *     </button>
 *     <UpgradeGuard />
 *   </>
 * );
 * ```
 */
export function usePaywall(user) {
  const [showModal, setShowModal] = useState(false);
  const [modalReason, setModalReason] = useState("");
  const [isPaying, setIsPaying] = useState(false);

  const checkThen = useCallback(
    (action, fn) => {
      if (!user?.quota) {
        // 额度未加载，直接执行
        fn?.();
        return;
      }

      const q = user.quota;

      if (action === "download") {
        const remaining = q.daily_downloads_limit - q.daily_downloads_used;
        if (remaining <= 0) {
          setModalReason(
            `今日下载额度已用完（${q.daily_downloads_used}/${q.daily_downloads_limit}），升级会员解锁更多`,
          );
          setShowModal(true);
          return;
        }
      } else if (action === "summarize" || action === "mindmap") {
        const remaining = q.daily_summaries_limit - q.daily_summaries_used;
        if (remaining <= 0) {
          setModalReason(
            `今日 AI 总结额度已用完（${q.daily_summaries_used}/${q.daily_summaries_limit}），升级会员解锁更多`,
          );
          setShowModal(true);
          return;
        }
        if (action === "mindmap" && !q.can_export_mindmap) {
          setModalReason("思维导图导出为 Pro/Ultra 专属功能，请升级后使用");
          setShowModal(true);
          return;
        }
      }

      fn?.();
    },
    [user],
  );

  const handleUpgrade = useCallback(async (plan, orderType) => {
    setIsPaying(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/membership/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan, order_type: orderType }),
      });
      const data = await res.json();
      if (data.success) {
        alert(
          `订单已创建（演示模式）\n订单号: ${data.order_id}\n金额: ¥${data.amount}`,
        );
        setShowModal(false);
      }
    } catch (e) {
      alert("网络错误");
    } finally {
      setIsPaying(false);
    }
  }, []);

  const UpgradeGuard = useCallback(
    () => (
      <UpgradeModal
        show={showModal}
        reason={modalReason}
        currentUser={user}
        onUpgrade={handleUpgrade}
        onClose={() => setShowModal(false)}
        isLoading={isPaying}
      />
    ),
    [showModal, modalReason, user, handleUpgrade, isPaying],
  );

  return { checkThen, UpgradeGuard, showPaywall: () => setShowModal(true) };
}
