from html import escape
from models.schemas import ExtractedItem


def generate_preview_html(items: list[ExtractedItem], title: str = "Tena Forge Preview") -> str:
    body = "\n".join(
        f'<article class="item"><p class="meta">page {item.source_page or "-"}</p><div class="content">{item.content_html or escape(item.content_text)}</div></article>'
        for item in items
    )
    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <style>
    body {{ margin: 0; background: #f8fafc; color: #111827; font-family: Pretendard, "Noto Sans KR", sans-serif; }}
    main {{ width: 794px; min-height: 1123px; margin: 0 auto; padding: 56px; background: white; box-sizing: border-box; }}
    h1 {{ font-size: 28px; border-bottom: 2px solid #111827; padding-bottom: 16px; }}
    .item {{ break-inside: avoid; padding: 20px 0; border-bottom: 1px solid #e5e7eb; }}
    .meta {{ color: #6b7280; font-size: 12px; }}
    .content {{ font-size: 15px; line-height: 1.75; }}
  </style>
</head>
<body><main><h1>{escape(title)}</h1>{body}</main></body>
</html>"""
