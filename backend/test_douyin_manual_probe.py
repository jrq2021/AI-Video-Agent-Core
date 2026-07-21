import importlib
import sys
import unittest
from unittest import mock


class DouyinManualProbeTest(unittest.TestCase):
    @mock.patch("requests.get")
    def test_importing_http_probe_does_not_start_network_work(self, requests_get):
        sys.modules.pop("test_douyin", None)

        importlib.import_module("test_douyin")

        requests_get.assert_not_called()

    @mock.patch("yt_dlp.YoutubeDL")
    def test_importing_manual_probe_does_not_start_network_work(self, youtube_dl):
        sys.modules.pop("test_douyin2", None)

        importlib.import_module("test_douyin2")

        youtube_dl.assert_not_called()
