"""Validated DeepSeek helpers for bilingual subtitles and creator content packs."""

import json
import os
from typing import Any, Dict

from openai import OpenAI


ALLOWED_TARGET_LANGUAGES = {"en": "English", "zh-CN": "Simplified Chinese"}
MAX_SEGMENTS_PER_TRANSLATION_REQUEST = 80
MAX_COPY_CHARS = 5_000
MAX_TITLE_CHARS = 100
REQUIRED_CREATOR_PACK_FIELDS = (
    "angle",
    "summary",
    "titles",
    "spoken_outline",
    "xiaohongshu",
    "wechat_summary",
    "highlights",
)


def _request_json(system_prompt: str, user_prompt: str) -> Dict[str, Any]:
    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY is not configured")
    client = OpenAI(
        api_key=api_key,
        base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
    )
    response = client.chat.completions.create(
        model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.4,
    )
    content = (response.choices[0].message.content or "").strip()
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ValueError("AI returned invalid JSON") from exc
    if not isinstance(data, dict):
        raise ValueError("AI JSON must be an object")
    return data


def _clean_text(value: Any, field: str, max_chars: int = MAX_COPY_CHARS) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"AI creator pack field is empty: {field}")
    if len(text) > max_chars:
        raise ValueError(f"AI creator pack field is too long: {field}")
    return text


def translate_segments(segments: list[Dict[str, Any]], target_language: str) -> list[Dict[str, Any]]:
    if target_language not in ALLOWED_TARGET_LANGUAGES:
        raise ValueError("Unsupported target language")
    if not segments:
        raise ValueError("No subtitle segments are available for translation")

    translated: list[Dict[str, Any]] = []
    for chunk_start in range(0, len(segments), MAX_SEGMENTS_PER_TRANSLATION_REQUEST):
        chunk = segments[chunk_start:chunk_start + MAX_SEGMENTS_PER_TRANSLATION_REQUEST]
        indexed = [
            {"index": chunk_start + index, "text": str(segment.get("text", ""))}
            for index, segment in enumerate(chunk)
        ]
        response = _request_json(
            "You translate subtitles. Return only JSON with a translations array. "
            "Every item must have the provided index and a non-empty translation. "
            "Do not alter, add, or omit indexes.",
            json.dumps(
                {
                    "target_language": ALLOWED_TARGET_LANGUAGES[target_language],
                    "segments": indexed,
                },
                ensure_ascii=False,
            ),
        )
        rows = response.get("translations")
        if not isinstance(rows, list):
            raise ValueError("AI translation response is missing translations")
        translations: Dict[int, str] = {}
        expected_indexes = {item["index"] for item in indexed}
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get("index"), int):
                raise ValueError("AI translation response contains an invalid index")
            index = row["index"]
            if index not in expected_indexes or index in translations:
                raise ValueError("AI translation response changed subtitle indexes")
            translations[index] = _clean_text(row.get("translation"), "translation", MAX_COPY_CHARS)
        if set(translations) != expected_indexes:
            raise ValueError("AI translation response omitted subtitle rows")
        translated.extend(
            {**segment, "translation": translations[chunk_start + index]}
            for index, segment in enumerate(chunk)
        )
    return translated


def validate_creator_pack(data: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(data, dict) or any(not data.get(field) for field in REQUIRED_CREATOR_PACK_FIELDS):
        raise ValueError("AI creator pack is missing required fields")

    titles = data["titles"]
    if not isinstance(titles, list) or len(titles) != 5:
        raise ValueError("AI creator pack must contain five titles")
    clean_titles = [_clean_text(title, "title", MAX_TITLE_CHARS) for title in titles]

    highlights = data["highlights"]
    if not isinstance(highlights, list) or not 3 <= len(highlights) <= 5:
        raise ValueError("AI creator pack must contain three to five highlights")
    clean_highlights = []
    for highlight in highlights:
        if not isinstance(highlight, dict):
            raise ValueError("AI creator pack highlight is invalid")
        try:
            start = float(highlight["start"])
            end = float(highlight["end"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("AI creator pack highlight needs timestamps") from exc
        if start < 0 or end < start:
            raise ValueError("AI creator pack highlight timestamps are invalid")
        clean_highlights.append(
            {
                "start": start,
                "end": end,
                "title": _clean_text(highlight.get("title"), "highlight title", MAX_TITLE_CHARS),
                "reason": _clean_text(highlight.get("reason"), "highlight reason", 500),
            }
        )

    return {
        "angle": _clean_text(data["angle"], "angle", 300),
        "summary": _clean_text(data["summary"], "summary", 800),
        "titles": clean_titles,
        "spoken_outline": _clean_text(data["spoken_outline"], "spoken_outline", 2_000),
        "xiaohongshu": _clean_text(data["xiaohongshu"], "xiaohongshu"),
        "wechat_summary": _clean_text(data["wechat_summary"], "wechat_summary"),
        "highlights": clean_highlights,
    }


def create_creator_pack(subtitles: str, segments: list[Dict[str, Any]], title: str) -> Dict[str, Any]:
    source = str(subtitles or "").strip()
    if len(source) < 20:
        raise ValueError("At least 20 subtitle characters are required for a creator pack")
    response = _request_json(
        "You are a Chinese creator assistant. Return JSON only. Generate concise, original copy based only on the supplied subtitles. "
        "The JSON must contain angle, summary, titles (exactly 5), spoken_outline, xiaohongshu, wechat_summary, and highlights (3-5). "
        "Each highlight must contain start, end, title, and reason.",
        json.dumps(
            {
                "title": str(title or ""),
                "subtitles": source[:40_000],
                "segments": [
                    {"start": segment.get("start"), "end": segment.get("end"), "text": segment.get("text", "")}
                    for segment in segments[:300]
                ],
            },
            ensure_ascii=False,
        ),
    )
    return validate_creator_pack(response)
