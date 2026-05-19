from __future__ import annotations

import argparse
import html
import json
import os
from pathlib import Path
from typing import Any

import fitz


REPO_ROOT = Path(__file__).resolve().parents[1]


def render_page_images(pdf_path: Path, output_dir: Path, page_limit: int, dpi: int) -> list[Path]:
    pages_dir = output_dir / "pages"
    pages_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf_path)
    matrix = fitz.Matrix(dpi / 72, dpi / 72)
    image_paths: list[Path] = []
    try:
        for index in range(min(page_limit, doc.page_count)):
            target = pages_dir / f"page-{index + 1:02d}.png"
            if not target.exists():
                pix = doc[index].get_pixmap(matrix=matrix, alpha=False)
                pix.save(target)
            image_paths.append(target)
    finally:
        doc.close()
    return image_paths


def relative_href(from_file: Path, target: Path) -> str:
    return Path(os.path.relpath(Path(target).resolve(), from_file.resolve().parent)).as_posix()


def safe(value: Any) -> str:
    return html.escape("" if value is None else str(value))


def model_page(results: list[dict[str, Any]], model: str, page_number: int) -> dict[str, Any] | None:
    model_result = next((item for item in results if item.get("model") == model), None)
    if not model_result:
        return None
    return next((page for page in model_result.get("pages", []) if page.get("page_number") == page_number), None)


def render_item(item: dict[str, Any], index: int) -> str:
    fields = []
    problem_number = item.get("problem_number", "-")
    has_visual = "도형 있음" if item.get("has_visual") else "도형 없음"
    suspicious = item.get("answer_choice_suspicious")
    if suspicious:
        fields.append('<span class="badge warn">선지 의심</span>')
    fields.append(f'<span class="badge">{safe(has_visual)}</span>')
    text = safe(item.get("problem_text", ""))
    return f"""
      <article class="item">
        <div class="item-head">
          <strong>{index}. 문항 {safe(problem_number)}</strong>
          <span class="badges">{''.join(fields)}</span>
        </div>
        <div class="latex-text">{text}</div>
      </article>
    """


def render_model_card(page: dict[str, Any] | None, model: str) -> str:
    if not page:
        return f'<section class="model-card"><h3>{safe(model)}</h3><p class="muted">결과 없음</p></section>'
    if page.get("error"):
        return f"""
          <section class="model-card error-card">
            <h3>{safe(model)}</h3>
            <p class="error">{safe(page.get("error"))}</p>
          </section>
        """
    items = page.get("items") or []
    usage = page.get("usage") or {}
    body = "\n".join(render_item(item, index + 1) for index, item in enumerate(items)) or '<p class="muted">추출 문항 없음</p>'
    return f"""
      <section class="model-card">
        <div class="model-head">
          <h3>{safe(model)}</h3>
          <span>{len(items)}개 · {safe(page.get("duration_seconds", "-"))}s · {safe(usage.get("total_tokens", "-"))} tokens</span>
        </div>
        {body}
      </section>
    """


def build_html(data: dict[str, Any], output_file: Path, image_paths: list[Path]) -> str:
    results = data.get("results") or []
    models = [item.get("model") for item in results if item.get("model")]
    summaries = data.get("summaries") or []
    source_pdf = Path(data["source_pdf"])
    katex_css = REPO_ROOT / "frontend" / "node_modules" / "katex" / "dist" / "katex.min.css"
    katex_js = REPO_ROOT / "frontend" / "node_modules" / "katex" / "dist" / "katex.min.js"
    auto_render_js = REPO_ROOT / "frontend" / "node_modules" / "katex" / "dist" / "contrib" / "auto-render.min.js"

    summary_rows = "\n".join(
        f"""
        <tr>
          <td>{safe(row.get("model"))}</td>
          <td>{safe(row.get("items"))}</td>
          <td>{safe(row.get("errors"))}</td>
          <td>{safe(row.get("duration_seconds"))}s</td>
          <td>{safe((row.get("usage") or {}).get("total_tokens"))}</td>
        </tr>
        """
        for row in summaries
    )

    page_sections = []
    for index, image_path in enumerate(image_paths, start=1):
        cards = "\n".join(render_model_card(model_page(results, model, index), model) for model in models)
        page_sections.append(
            f"""
            <section class="page-section" id="page-{index}">
              <div class="page-title">
                <h2>Page {index}</h2>
                <a href="#top">위로</a>
              </div>
              <div class="compare-grid">
                <aside class="source-panel">
                  <div class="sticky-source">
                    <div class="source-label">원본 PDF 페이지</div>
                    <img src="{relative_href(output_file, image_path)}" alt="PDF page {index}" />
                  </div>
                </aside>
                <div class="model-grid">
                  {cards}
                </div>
              </div>
            </section>
            """
        )

    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Model A/B Rendered Comparison</title>
  <link rel="stylesheet" href="{relative_href(output_file, katex_css)}" />
  <style>
    :root {{
      color-scheme: dark;
      --bg: #080910;
      --panel: #11131d;
      --panel-2: #171a26;
      --border: rgba(255,255,255,.12);
      --text: #eef2ff;
      --muted: #98a2b3;
      --accent: #a78bfa;
      --good: #34d399;
      --warn: #fbbf24;
      --error: #fb7185;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }}
    header {{
      position: sticky;
      top: 0;
      z-index: 10;
      border-bottom: 1px solid var(--border);
      background: rgba(8,9,16,.9);
      backdrop-filter: blur(16px);
      padding: 16px 22px;
    }}
    h1, h2, h3, p {{ margin: 0; }}
    h1 {{ font-size: 20px; }}
    .sub {{ margin-top: 6px; color: var(--muted); font-size: 13px; }}
    .summary {{
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: start;
      margin-top: 14px;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border-radius: 8px;
      border: 1px solid var(--border);
      font-size: 13px;
    }}
    th, td {{ padding: 8px 10px; border-bottom: 1px solid var(--border); text-align: left; }}
    th {{ color: var(--muted); background: rgba(255,255,255,.04); }}
    tr:last-child td {{ border-bottom: 0; }}
    nav {{
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      max-width: 420px;
    }}
    nav a, .page-title a {{
      color: var(--text);
      text-decoration: none;
      border: 1px solid var(--border);
      border-radius: 7px;
      padding: 7px 9px;
      background: rgba(255,255,255,.04);
      font-size: 12px;
    }}
    main {{ padding: 20px 22px 64px; }}
    .page-section {{
      margin-bottom: 28px;
      border-top: 1px solid var(--border);
      padding-top: 18px;
    }}
    .page-title {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }}
    .page-title h2 {{ font-size: 18px; }}
    .compare-grid {{
      display: grid;
      grid-template-columns: minmax(300px, 38vw) minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }}
    .source-panel {{
      min-width: 0;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #05060b;
      padding: 10px;
    }}
    .sticky-source {{ position: sticky; top: 138px; }}
    .source-label {{ margin-bottom: 8px; color: var(--muted); font-size: 12px; font-weight: 700; }}
    .source-panel img {{
      display: block;
      width: 100%;
      border-radius: 6px;
      background: white;
    }}
    .model-grid {{
      display: grid;
      grid-template-columns: repeat(3, minmax(260px, 1fr));
      gap: 12px;
      align-items: start;
    }}
    .model-card {{
      min-width: 0;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
      overflow: hidden;
    }}
    .model-head {{
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      border-bottom: 1px solid var(--border);
      background: rgba(255,255,255,.04);
      padding: 10px 12px;
    }}
    .model-head h3 {{ font-size: 14px; color: var(--accent); }}
    .model-head span {{ color: var(--muted); font-size: 12px; white-space: nowrap; }}
    .item {{ padding: 12px; border-bottom: 1px solid var(--border); }}
    .item:last-child {{ border-bottom: 0; }}
    .item-head {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
      color: #dbeafe;
      font-size: 13px;
    }}
    .badges {{ display: inline-flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }}
    .badge {{
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 2px 7px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
    }}
    .badge.warn {{ border-color: rgba(251,191,36,.35); color: var(--warn); }}
    .latex-text {{
      color: var(--text);
      font-size: 15px;
      line-height: 1.85;
      word-break: keep-all;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }}
    .latex-text .katex-display {{ margin: .65rem 0; overflow-x: auto; overflow-y: hidden; }}
    .muted {{ color: var(--muted); padding: 12px; }}
    .error {{ color: var(--error); padding: 12px; line-height: 1.5; }}
    @media (max-width: 1280px) {{
      .compare-grid {{ grid-template-columns: 1fr; }}
      .sticky-source {{ position: static; }}
      .model-grid {{ grid-template-columns: 1fr; }}
      .source-panel img {{ max-height: 72vh; object-fit: contain; }}
    }}
  </style>
</head>
<body>
  <header id="top">
    <h1>Model A/B Rendered Comparison</h1>
    <p class="sub">Source: {safe(source_pdf.name)} · Pages: {safe(data.get("page_limit"))} · Created: {safe(data.get("created_at"))}</p>
    <div class="summary">
      <table>
        <thead><tr><th>Model</th><th>Items</th><th>Errors</th><th>Duration</th><th>Total tokens</th></tr></thead>
        <tbody>{summary_rows}</tbody>
      </table>
      <nav aria-label="Pages">
        {''.join(f'<a href="#page-{index}">Page {index}</a>' for index in range(1, len(image_paths) + 1))}
      </nav>
    </div>
  </header>
  <main>
    {''.join(page_sections)}
  </main>
  <script src="{relative_href(output_file, katex_js)}"></script>
  <script src="{relative_href(output_file, auto_render_js)}"></script>
  <script>
    renderMathInElement(document.body, {{
      delimiters: [
        {{left: "$$", right: "$$", display: true}},
        {{left: "\\\\[", right: "\\\\]", display: true}},
        {{left: "$", right: "$", display: false}},
        {{left: "\\\\(", right: "\\\\)", display: false}}
      ],
      throwOnError: false,
      strict: false
    }});
  </script>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Render model A/B JSON into a KaTeX HTML report.")
    parser.add_argument("results", type=Path, help="Path to results.json")
    parser.add_argument("--dpi", type=int, default=150, help="DPI for source page images.")
    args = parser.parse_args()

    results_path = args.results.resolve()
    data = json.loads(results_path.read_text(encoding="utf-8"))
    output_dir = results_path.parent
    output_file = output_dir / "comparison-rendered.html"
    image_paths = render_page_images(Path(data["source_pdf"]), output_dir, int(data["page_limit"]), args.dpi)
    output_file.write_text(build_html(data, output_file, image_paths), encoding="utf-8")
    print(output_file)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
