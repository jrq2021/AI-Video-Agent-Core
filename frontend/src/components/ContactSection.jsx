export default function ContactSection() {
  return (
    <section id="contact" className="cinematic-section contact-section">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="section-heading mb-14 text-center">
          <h2>想法、问题与合作，都欢迎抵达。</h2>
          <p className="mx-auto mt-5 max-w-xl">
            无论是建议、反馈还是合作，都欢迎联系
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="contact-card group">
            <div className="contact-card__icon">
              <svg
                className="size-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                />
              </svg>
            </div>
            <h3>邮件联系</h3>
            <p>support@videodl.com</p>
          </div>

          <div className="contact-card group">
            <div className="contact-card__icon">
              <svg
                className="size-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z"
                />
              </svg>
            </div>
            <h3>反馈建议</h3>
            <p>GitHub Issues / 用户社区</p>
          </div>

          <div className="contact-card group">
            <div className="contact-card__icon">
              <svg
                className="size-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0"
                />
              </svg>
            </div>
            <h3>商务合作</h3>
            <p>business@videodl.com</p>
          </div>
        </div>

        <div className="legal-note mt-8 rounded-2xl p-5">
          <div className="flex gap-3">
            <svg
              className="mt-0.5 size-5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
            <div>
              <h4 className="mb-1 text-sm font-medium">
                免责声明
              </h4>
              <p className="text-xs leading-relaxed">
                下载视频时请遵守相关平台的服务条款和当地法律法规，请勿用于侵犯他人版权或商业盈利等非法用途。本站不对用户的下载行为承担任何法律责任。
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
