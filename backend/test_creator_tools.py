import unittest
from unittest.mock import patch


class CreatorToolsTest(unittest.TestCase):
    def test_translation_preserves_original_timestamps(self):
        from creator_tools import translate_segments

        with patch(
            "creator_tools._request_json",
            return_value={"translations": [{"index": 0, "translation": "Hello"}]},
        ):
            result = translate_segments(
                [{"start": 0, "end": 2, "text": "你好"}],
                "en",
            )

        self.assertEqual(result[0]["start"], 0)
        self.assertEqual(result[0]["end"], 2)
        self.assertEqual(result[0]["text"], "你好")
        self.assertEqual(result[0]["translation"], "Hello")

    def test_creator_pack_requires_all_product_fields(self):
        from creator_tools import validate_creator_pack

        with self.assertRaises(ValueError):
            validate_creator_pack({"angle": "only"})


if __name__ == "__main__":
    unittest.main()
