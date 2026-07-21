import VideoInput from "./VideoInput";
import VideoInfo from "./VideoInfo";
import VideoSubtitle from "./VideoSubtitle";

export default function ParsePage({
  onAnalyze,
  checkQuota,
  quota,
  isLoading,
  user,
  onAuthClick,
  openUpgrade,
  error,
  videoData,
  consumeQuota,
  onDownloadComplete,
  activeHistoryRecord,
  onArtifactsChange,
}) {
  return (
    <main className="parse-page cinematic-content" aria-label="视频解析工作台">
      <section className="workspace-stage">
        <div className="mx-auto max-w-5xl px-4 py-24 sm:px-6 md:py-32">
          <header className="section-heading mb-12 text-center">
            <p className="section-kicker">VIDEO WORKSPACE</p>
            <h1 className="workspace-title">带来链接，留住此刻。</h1>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-dark-500 sm:text-base">
              粘贴任意支持平台的视频链接，解析高清画质、音频与字幕，把灵感安静地保存下来。
            </p>
          </header>

          <VideoInput
            onAnalyze={onAnalyze}
            onCheckQuota={checkQuota}
            quota={quota}
            isLoading={isLoading}
            user={user}
            onAuthClick={onAuthClick}
            onUpgradeClick={openUpgrade}
          />

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          ) : null}

          {isLoading ? (
            <div className="mt-8 text-center">
              <div className="inline-block size-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
              <p className="mt-3 text-sm text-dark-400">正在解析视频信息...</p>
            </div>
          ) : null}

          {videoData ? (
            <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(360px,460px)_minmax(0,1fr)] lg:gap-7">
              <div className="min-w-0">
                <VideoInfo
                  data={videoData}
                  user={user}
                  quota={quota}
                  checkQuota={checkQuota}
                  consumeQuota={consumeQuota}
                  openUpgrade={openUpgrade}
                  onDownloadComplete={onDownloadComplete}
                />
              </div>
              <div className="min-w-0">
                <VideoSubtitle
                  videoSrc={null}
                  originalUrl={videoData.webpage_url}
                  user={user}
                  quota={quota}
                  checkQuota={checkQuota}
                  consumeQuota={consumeQuota}
                  openUpgrade={openUpgrade}
                  initialArtifacts={activeHistoryRecord}
                  onArtifactsChange={onArtifactsChange}
                />
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
