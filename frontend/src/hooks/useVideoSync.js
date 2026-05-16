import { useState, useCallback, useRef, useEffect } from "react";

/**
 * useVideoSync — 视频与字幕双向同步 Hook
 *
 * @param {Array} segments - 字幕片段 [{start, end, text}, ...]
 * @returns {{
 *   currentTime: number,
 *   activeIndex: number,
 *   onTimeUpdate: (time: number) => void,
 *   seekTo: (time: number) => void,
 *   onSubtitleClick: (seg: object) => void,
 *   isPlaying: boolean,
 *   setIsPlaying: (v: boolean) => void,
 * }}
 *
 * 使用模式：
 *   1. 视频 timeupdate → onTimeUpdate(video.currentTime)
 *   2. 点击字幕 → onSubtitleClick(seg) → seekTo 被调用
 *   3. activeIndex 变化 → 高亮对应字幕行
 */
export default function useVideoSync(segments = []) {
    const [currentTime, setCurrentTime] = useState(0);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [isPlaying, setIsPlaying] = useState(false);

    // 暴露给外部的 seekTo 回调（由播放器注入）
    const seekToRef = useRef(null);
    const registerSeekTo = useCallback((fn) => {
        seekToRef.current = fn;
    }, []);

    // Video → Text: 根据 currentTime 查找对应字幕
    const onTimeUpdate = useCallback(
        (time) => {
            setCurrentTime(time);
            if (segments.length === 0) return;
            const idx = findSegmentIndex(segments, time);
            setActiveIndex((prev) => (idx !== prev ? idx : prev));
        },
        [segments],
    );

    // Text → Video: 点击字幕 → seek
    const onSubtitleClick = useCallback(
        (seg) => {
            setCurrentTime(seg.start);
            setActiveIndex(segments.indexOf(seg));
            if (seekToRef.current) {
                seekToRef.current(seg.start);
            }
        },
        [segments],
    );

    // 手动 seekTo
    const seekTo = useCallback((time) => {
        setCurrentTime(time);
        if (seekToRef.current) seekToRef.current(time);
    }, []);

    return {
        currentTime,
        activeIndex,
        onTimeUpdate,
        seekTo,
        onSubtitleClick,
        registerSeekTo,
        isPlaying,
        setIsPlaying,
    };
}

/** 二分查找当前时间对应的字幕索引 */
function findSegmentIndex(segments, t) {
    for (let i = 0; i < segments.length; i++) {
        if (t >= segments[i].start && t <= segments[i].end) return i;
    }
    for (let i = segments.length - 1; i >= 0; i--) {
        if (t >= segments[i].end) return i;
    }
    return -1;
}
