import { useState, useCallback } from "react";
import UpgradeModal from "../components/UpgradeModal";

/**
 * withQuotaGuard — 会员码解锁拦截高阶组件 (HOC)
 *
 * 包装任意触发操作的元素，当用户额度不足时自动拦截并弹出会员码兑换引导。
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
 */

export default function withQuotaGuard({
  action,
  user,
  children,
  render,
}) {
  const [showModal, setShowModal] = useState(false);
  const [modalReason, setModalReason] = useState("");

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
          reason: "思维导图导出为 Pro/Ultra 专属功能，请兑换会员码后使用",
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

  return (
    <>
      {/* 拦截弹窗 */}
      <UpgradeModal
        show={showModal}
        reason={modalReason}
        currentUser={user}
        onClose={() => setShowModal(false)}
      />

      {/* Render prop 模式 */}
      {render ? render({ guardedAction, checkThen: guardedAction }) : children}
    </>
  );
}

/**
 * usePaywall — 轻量级会员码解锁 Hook（配合 withQuotaGuard 使用）
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
            `今日下载额度已用完（${q.daily_downloads_used}/${q.daily_downloads_limit}），兑换会员码解锁更多`,
          );
          setShowModal(true);
          return;
        }
      } else if (action === "summarize" || action === "mindmap") {
        const remaining = q.daily_summaries_limit - q.daily_summaries_used;
        if (remaining <= 0) {
          setModalReason(
            `今日 AI 总结额度已用完（${q.daily_summaries_used}/${q.daily_summaries_limit}），兑换会员码解锁更多`,
          );
          setShowModal(true);
          return;
        }
        if (action === "mindmap" && !q.can_export_mindmap) {
          setModalReason("思维导图导出为 Pro/Ultra 专属功能，请兑换会员码后使用");
          setShowModal(true);
          return;
        }
      }

      fn?.();
    },
    [user],
  );

  const UpgradeGuard = useCallback(
    () => (
      <UpgradeModal
        show={showModal}
        reason={modalReason}
        currentUser={user}
        onClose={() => setShowModal(false)}
      />
    ),
    [showModal, modalReason, user],
  );

  return { checkThen, UpgradeGuard, showPaywall: () => setShowModal(true) };
}
