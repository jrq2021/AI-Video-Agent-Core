import { useState } from "react";

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState(null);

  const faqs = [
    {
      q: "支持哪些平台的视频下载？",
      a: "基于 yt-dlp 开源引擎，支持 YouTube、B站、Twitter/X、Instagram、Facebook、Vimeo、优酷、腾讯视频等全球 1000+ 个视频平台的视频下载。",
    },
    {
      q: "需要付费吗？有下载次数限制吗？",
      a: "游客每日可下载 1 次；登录后的免费版每日可下载 3 次，并包含 1 次 AI 总结。专业版和旗舰版主要提升每日下载与 AI 总结额度。",
    },
    {
      q: "下载的视频保存在哪里？",
      a: '视频直接下载到你的电脑/手机本地存储中，不会上传到任何服务器。下载完成后点击"保存到本地"按钮即可选择保存位置。',
    },
    {
      q: "为什么有些视频无法下载？",
      a: "部分平台的视频可能存在地区限制、版权保护或需要登录才能访问。遇到这种情况可以尝试使用会员专属视频链接，或确认该视频在你所在的地区可以正常播放。",
    },
    {
      q: "手机上能用吗？",
      a: "当然可以！我们的网站完全适配手机浏览器，你可以在 iPhone、Android 等移动设备上直接粘贴链接下载视频，无需安装任何 APP。",
    },
    {
      q: "下载速度慢怎么办？",
      a: "下载速度取决于视频平台服务器和你的网络环境。建议在网络良好的环境下使用，也可以选择较低清晰度的格式以获得更快的下载速度。",
    },
  ];

  return (
    <section id="faq" className="cinematic-section faq-section">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="section-heading mb-14 text-center">
          <h2>问题有答案，过程不必喧闹。</h2>
          <p className="mx-auto mt-5 max-w-xl">
            关于平台、额度、保存位置与下载速度，常见疑问都整理在这里。
          </p>
        </div>

        <div className="faq-list flex flex-col gap-3">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className={`faq-item ${openIndex === i ? "is-open" : ""}`}
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="flex w-full items-center justify-between px-6 py-5 text-left"
              >
                <span className="pr-4 text-sm font-medium text-dark-800 sm:text-base">
                  {faq.q}
                </span>
                <svg
                  className={`w-5 h-5 text-dark-400 shrink-0 transition-transform duration-300 ${openIndex === i ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                  />
                </svg>
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  openIndex === i ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
                }`}
              >
                <p className="px-6 pb-5 text-sm leading-7 text-dark-400">
                  {faq.a}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
