import { useState } from "react";
import { MEMBERSHIP_FAQS } from "../services/membershipCopy";

const GENERAL_FAQS = [
  {
    question: "支持哪些平台的视频下载？",
    answer: "基于 yt-dlp 开源引擎，支持 YouTube、B站、Twitter/X、Instagram、Facebook、Vimeo、优酷、腾讯视频等全球 1000+ 视频平台的公开视频解析与下载。",
  },
  {
    question: "下载的视频保存在哪里？",
    answer: "视频直接下载到你的电脑或手机本地存储中，不会上传到任何服务器。下载完成后点击“保存到本地”即可选择保存位置。",
  },
  {
    question: "为什么有些视频无法解析或下载？",
    answer: "部分视频存在地区限制、版权保护或需要登录才能访问。请确认视频在你所在地区可正常播放，且你拥有处理该公开内容的权利；会员不会绕过这些访问限制。",
  },
  {
    question: "手机上能用吗？",
    answer: "可以。网站适配手机浏览器，可在 iPhone、Android 等移动设备上直接粘贴视频链接使用，无需安装 App。",
  },
  {
    question: "下载速度慢怎么办？",
    answer: "下载速度取决于视频平台服务器和你的网络环境。建议在网络良好时使用，或选择较低分辨率以获得更快下载速度。",
  },
];

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState(null);
  const faqs = [...MEMBERSHIP_FAQS, ...GENERAL_FAQS];

  return (
    <section id="faq" className="cinematic-section faq-section">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="section-heading mb-14 text-center">
          <h2>问题有答案，过程不必喧闹。</h2>
          <p className="mx-auto mt-5 max-w-xl">关于套餐权益、兑换码、平台、保存位置与下载速度，常见疑问都整理在这里。</p>
        </div>

        <div className="faq-list flex flex-col gap-3">
          {faqs.map((faq, index) => (
            <div key={faq.question} className={`faq-item ${openIndex === index ? "is-open" : ""}`}>
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="flex w-full items-center justify-between px-6 py-5 text-left"
              >
                <span className="pr-4 text-sm font-medium text-dark-800 sm:text-base">{faq.question}</span>
                <svg
                  className={`h-5 w-5 shrink-0 text-dark-400 transition-transform duration-300 ${openIndex === index ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              <div className={`overflow-hidden transition-all duration-300 ${openIndex === index ? "max-h-48 opacity-100" : "max-h-0 opacity-0"}`}>
                <p className="px-6 pb-5 text-sm leading-7 text-dark-400">{faq.answer}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
