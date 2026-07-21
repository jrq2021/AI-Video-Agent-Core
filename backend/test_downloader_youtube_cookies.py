import os
import tempfile
import unittest
from pathlib import Path

from downloader import VideoDownloader, friendly_download_error


class YoutubeCookiesConfigTest(unittest.TestCase):
    def test_youtube_opts_use_configured_cookie_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cookies_path = Path(tmpdir) / "youtube-cookies.txt"
            cookies_path.write_text("# Netscape HTTP Cookie File\n", encoding="utf-8")

            old_value = os.environ.get("YTDLP_COOKIES_FILE")
            os.environ["YTDLP_COOKIES_FILE"] = str(cookies_path)
            try:
                downloader = VideoDownloader(tmpdir)
                opts = downloader._get_common_opts("https://www.youtube.com/watch?v=iS6XIbWaDn4")
            finally:
                if old_value is None:
                    os.environ.pop("YTDLP_COOKIES_FILE", None)
                else:
                    os.environ["YTDLP_COOKIES_FILE"] = old_value

        self.assertEqual(opts.get("cookiefile"), str(cookies_path))

    def test_youtube_bot_error_is_friendly(self):
        raw_error = (
            "ERROR: [youtube] iS6XIbWaDn4: Sign in to confirm you're not a bot. "
            "Use --cookies-from-browser or --cookies for the authentication."
        )

        message = friendly_download_error(raw_error, "https://www.youtube.com/watch?v=iS6XIbWaDn4")

        self.assertIn("YouTube", message)
        self.assertIn("cookies", message)
        self.assertNotIn("github.com/yt-dlp", message)


if __name__ == "__main__":
    unittest.main()
