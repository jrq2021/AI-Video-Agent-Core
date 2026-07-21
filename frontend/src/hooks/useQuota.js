import { useState, useCallback, useEffect, useRef } from "react";

/**
 * useQuota — 用户额度管理与付费墙拦截 Hook
 * 
 * 职责：
 * 1. 定期拉取用户剩余额度（/api/membership/my-quota，游客和登录用户均可）
 * 2. 执行操作前检查额度是否足够
 * 3. 额度不足时触发升级弹窗（登录用户）或登录引导（游客）
 * 4. 操作成功后自动刷新额度
 * 
 * 使用示例：
 * ```jsx
 * const {
 *   quota,          // 当前额度对象
 *   checkQuota,     // 检查并消耗额度 (action) => { allowed, reason, needLogin, needUpgrade }
 *   consumeQuota,   // 操作成功后调用来刷新额度
 *   showUpgrade,    // 是否显示升级弹窗
 *   upgradeReason,  // 升级引导文案
 *   openUpgrade,    // 手动打开升级弹窗
 *   closeUpgrade,   // 关闭升级弹窗
 * } = useQuota(user);
 * ```
 */

const API_BASE = ""; // 相对路径，由 Vite 代理
const MEMBERSHIP_CLICK_KEY = "membership_click_history";

// 游客默认额度（与后端保持一致）
const GUEST_DEFAULTS = {
    plan: "guest",
    daily_downloads_limit: 1,
    daily_summaries_limit: 1,
    daily_batch_items_limit: 0,
    daily_creator_credits_limit: 0,
    daily_downloads_used: 0,
    daily_summaries_used: 0,
    daily_batch_items_used: 0,
    daily_creator_credits_used: 0,
    can_batch_download: false,
    can_batch_parse: false,
    batch_max_count: 0,
    can_export_mindmap: false,
    max_quality: "源站可用",
    has_watermark: false,
    is_guest: true,
};

export default function useQuota(user) {
    const [quota, setQuota] = useState(GUEST_DEFAULTS);
    const [showUpgrade, setShowUpgrade] = useState(false);
    const [upgradeReason, setUpgradeReason] = useState("");
    const [orderDialog, setOrderDialog] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const quotaRef = useRef(quota);

    const recordMembershipClick = useCallback((entry) => {
        try {
            const list = JSON.parse(localStorage.getItem(MEMBERSHIP_CLICK_KEY) || "[]");
            const item = {
                id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
                clickedAt: new Date().toLocaleString("zh-CN"),
                ...entry,
            };
            list.unshift(item);
            if (list.length > 50) list.length = 50;
            localStorage.setItem(MEMBERSHIP_CLICK_KEY, JSON.stringify(list));
            return item;
        } catch {
            return entry;
        }
    }, []);

    // 保持 ref 同步
    useEffect(() => {
        quotaRef.current = quota;
    }, [quota]);

    const getAuthHeaders = useCallback(() => {
        const token = localStorage.getItem("auth_token");
        return token ? { Authorization: `Bearer ${token}` } : {};
    }, []);

    /**
     * 从服务端拉取最新额度（登录用户走会员 API，游客走 my-quota）
     */
    const fetchQuota = useCallback(async () => {
        const headers = getAuthHeaders();

        try {
            const res = await fetch(`${API_BASE}/api/membership/my-quota`, { headers });
            const data = await res.json();
            if (data.success && data.quota) {
                setQuota(data.quota);
                return data.quota;
            }
        } catch (e) {
            console.warn("[useQuota] 获取额度失败:", e);
        }
        return null;
    }, [getAuthHeaders]);

    // 用户状态变化时自动拉取额度
    useEffect(() => {
        fetchQuota();
    }, [user, fetchQuota]);

    // 初始化时也拉取一次（游客也能获取）
    useEffect(() => {
        fetchQuota();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * 检查某个操作是否可以执行（前端预检 + 引导登录/升级）
     * 
     * @param {string} action - 操作类型: 'download' | 'summarize' | 'mindmap'
     * @returns {{ allowed: boolean, reason: string, needLogin: boolean, needUpgrade: boolean }}
     */
    const checkQuota = useCallback(
        (action) => {
            const q = quotaRef.current;
            if (!q) {
                // 额度未加载，允许操作（后端会兜底检查）
                return { allowed: true, reason: "", needLogin: false, needUpgrade: false };
            }

            const isGuest = q.is_guest || q.plan === "guest";

            if (action === "download") {
                const remaining = q.daily_downloads_limit - q.daily_downloads_used;
                if (remaining <= 0) {
                    if (isGuest) {
                        const reason = `游客今日下载次数已用完（${q.daily_downloads_used}/${q.daily_downloads_limit}），登录后免费用户每日可下载 3 次`;
                        return { allowed: false, reason, needLogin: true, needUpgrade: false };
                    }
                    const reason = `今日下载额度已用完（${q.daily_downloads_used}/${q.daily_downloads_limit}），兑换会员码获取更多额度`;
                    return { allowed: false, reason, needLogin: false, needUpgrade: true };
                }
            } else if (action === "summarize" || action === "mindmap") {
                const remaining = q.daily_summaries_limit - q.daily_summaries_used;
                if (remaining <= 0) {
                    if (isGuest) {
                        const reason = `游客今日 AI 总结次数已用完，登录后免费用户每日可总结 1 次`;
                        return { allowed: false, reason, needLogin: true, needUpgrade: false };
                    }
                    const reason = `今日 AI 总结额度已用完（${q.daily_summaries_used}/${q.daily_summaries_limit}），兑换会员码获取更多额度`;
                    return { allowed: false, reason, needLogin: false, needUpgrade: true };
                }
                // 额外检查：免费/游客用户不能导出思维导图
                if (action === "mindmap" && !q.can_export_mindmap) {
                    const reason = isGuest
                        ? "思维导图导出需要登录并兑换 Pro/Ultra 会员码"
                        : "思维导图导出是 Pro/Ultra 会员专属功能，请兑换会员码后使用";
                    return { allowed: false, reason, needLogin: isGuest, needUpgrade: !isGuest };
                }
            }

            if (action === "batch_parse") {
                const remaining = (q.daily_batch_items_limit || 0) - (q.daily_batch_items_used || 0);
                if (!q.can_batch_parse || remaining <= 0) {
                    return {
                        allowed: false,
                        reason: "Batch parsing is a Pro membership benefit with a daily limit.",
                        needLogin: isGuest,
                        needUpgrade: !isGuest,
                    };
                }
            }

            if (action === "translate" || action === "creator_pack") {
                const remaining = (q.daily_creator_credits_limit || 0) - (q.daily_creator_credits_used || 0);
                if (remaining <= 0) {
                    return {
                        allowed: false,
                        reason: "Bilingual subtitles and creator packs need an available creator credit.",
                        needLogin: isGuest,
                        needUpgrade: !isGuest,
                    };
                }
            }

            return { allowed: true, reason: "", needLogin: false, needUpgrade: false };
        },
        []
    );

    /**
     * 操作成功后调用，刷新额度
     */
    const consumeQuota = useCallback(async () => {
        await fetchQuota();
    }, [fetchQuota]);

    /**
     * 手动打开升级弹窗
     */
    const openUpgrade = useCallback((reason = "兑换会员码解锁更多功能") => {
        setUpgradeReason(reason);
        setShowUpgrade(true);
    }, []);

    /**
     * 关闭升级弹窗
     */
    const closeUpgrade = useCallback(() => {
        setShowUpgrade(false);
    }, []);

    const closeOrderDialog = useCallback(() => {
        setOrderDialog(null);
    }, []);

    /**
     * 处理升级操作
     */
    const handleUpgrade = useCallback(
        async (plan, orderType) => {
            setIsLoading(true);
            const token = localStorage.getItem("auth_token");
            try {
                if (plan === "free") {
                    const record = recordMembershipClick({
                        plan,
                        orderType,
                        status: "free_selected",
                    });
                    setOrderDialog({
                        type: "free",
                        title: "免费版已可使用",
                        message: "这次点击已记录。免费版无需购买，回到页面顶部粘贴链接即可开始解析。",
                        record,
                    });
                    return;
                }

                const couponOnlyRecord = recordMembershipClick({
                    plan,
                    orderType,
                    status: "coupon_only",
                });
                setOrderDialog({
                    type: "coupon_only",
                    title: "请使用会员兑换码",
                    message: token
                        ? "当前仅支持咸鱼卡券解锁。请在会员价格区输入你收到的兑换码。"
                        : "当前仅支持咸鱼卡券解锁。请先登录账号，再在会员价格区输入兑换码。",
                    plan,
                    orderType,
                    record: couponOnlyRecord,
                });
                setShowUpgrade(false);
                return;
            } catch (e) {
                const record = recordMembershipClick({
                    plan,
                    orderType,
                    status: "network_error",
                    error: e.message,
                });
                setOrderDialog({
                    type: "error",
                    title: "网络错误",
                    message: "请稍后重试。",
                    plan,
                    orderType,
                    record,
                });
            } finally {
                setIsLoading(false);
            }
        },
        [recordMembershipClick]
    );

    const redeemCode = useCallback(
        async (code) => {
            const token = localStorage.getItem("auth_token");
            if (!token) {
                throw new Error("请先登录后再兑换会员码");
            }

            const res = await fetch(`${API_BASE}/api/membership/redeem-code`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ code }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                throw new Error(data.detail || "兑换失败，请检查兑换码");
            }
            if (data.quota) {
                setQuota(data.quota);
            } else {
                await fetchQuota();
            }
            return data;
        },
        [fetchQuota]
    );

    return {
        quota,
        fetchQuota,
        checkQuota,
        consumeQuota,
        showUpgrade,
        upgradeReason,
        orderDialog,
        openUpgrade,
        closeUpgrade,
        closeOrderDialog,
        handleUpgrade,
        redeemCode,
        isLoading,
        getAuthHeaders,
    };
}
