export default function DownloadProgress({ progress }) {
  const percent = Math.min(100, Math.max(0, progress.percent || 0));

  const formatSpeed = (bytesPerSec) => {
    if (!bytesPerSec) return "";
    if (bytesPerSec >= 1048576)
      return (bytesPerSec / 1048576).toFixed(1) + " MB/s";
    if (bytesPerSec >= 1024) return (bytesPerSec / 1024).toFixed(0) + " KB/s";
    return bytesPerSec + " B/s";
  };

  const formatETA = (seconds) => {
    if (!seconds || seconds <= 0) return "";
    if (seconds >= 3600)
      return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  return (
    <div className="px-5 pb-5">
      <div className="space-y-2">
        {/* Progress bar */}
        <div className="relative h-2 bg-dark-100 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary-500 to-primary-400 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Info */}
        <div className="flex items-center justify-between text-xs text-dark-400">
          <span>{percent.toFixed(1)}%</span>
          <div className="flex items-center gap-4">
            {progress.phaseLabel && <span>{progress.phaseLabel}</span>}
            {progress.speed > 0 && <span>{formatSpeed(progress.speed)}</span>}
            {progress.eta > 0 && <span>剩余 {formatETA(progress.eta)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
