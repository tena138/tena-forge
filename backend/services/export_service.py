import html
import base64
import hashlib
import os
import re
import shutil
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path
from typing import Iterable
from uuid import uuid4

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.platypus import HRFlowable, Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from database import get_settings
from models import ExamTemplate, HubTemplate, Problem
from services.math_normalization import normalize_geometry_notation
from services.template_renderer import build_visual_template_export_pages, render_hub_template_for_context, render_hub_template_for_export

FONT_NAME = "Helvetica"
MIKTEX_BIN = Path.home() / "AppData" / "Local" / "Programs" / "MiKTeX" / "miktex" / "bin" / "x64"
UNDERLINE_TAG_PATTERN = re.compile(r"</?u>", re.IGNORECASE)


def register_korean_font() -> str:
    global FONT_NAME
    candidates = [
        Path(__file__).resolve().parents[1] / "fonts" / "NanumGothic.ttf",
        Path("fonts/NanumGothic.ttf"),
        Path("/usr/share/fonts/truetype/nanum/NanumGothic.ttf"),
        Path("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"),
        Path("C:/Windows/Fonts/malgun.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            pdfmetrics.registerFont(TTFont("NanumGothic", str(candidate)))
            FONT_NAME = "NanumGothic"
            return FONT_NAME
    return FONT_NAME


class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, footer_text: str | None = None, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []
        self.footer_text = footer_text

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        page_count = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_footer(page_count)
            super().showPage()
        super().save()

    def draw_footer(self, page_count: int):
        width, _ = A4
        self.setFont(FONT_NAME, 8)
        self.setFillColor(colors.HexColor("#5f596d"))
        if self.footer_text:
            self.drawCentredString(width / 2, 11 * mm, self.footer_text)
        self.drawRightString(width - 15 * mm, 11 * mm, f"{self._pageNumber} / {page_count}")


def _static_to_path(url: str | None) -> Path | None:
    if not url or url.startswith("http") or not url.startswith("/static/"):
        return None
    relative = url.split("?", 1)[0].removeprefix("/static/")
    root = Path(get_settings().uploads_dir).resolve()
    path = (root / Path(*relative.split("/"))).resolve()
    if root in path.parents or path == root:
        return path if path.exists() else None
    return None


def _find_xelatex() -> str | None:
    found = shutil.which("xelatex")
    if found:
        return found
    candidate = MIKTEX_BIN / "xelatex.exe"
    return str(candidate) if candidate.exists() else None


def _tex_path(path: Path) -> str:
    return path.resolve().as_posix()


def _tex_escape(value: str | None) -> str:
    text = value or ""
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "<": r"\textless{}",
        ">": r"\textgreater{}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    return "".join(replacements.get(char, char) for char in text)


def _tex_escape_with_underline(value: str | None) -> str:
    text = value or ""
    rendered: list[str] = []
    cursor = 0
    underline_depth = 0
    for match in UNDERLINE_TAG_PATTERN.finditer(text):
        if match.start() > cursor:
            chunk = _tex_escape(text[cursor:match.start()])
            rendered.append(r"\underline{" + chunk + "}" if underline_depth > 0 and chunk else chunk)
        underline_depth = max(0, underline_depth - 1) if match.group(0).startswith("</") else underline_depth + 1
        cursor = match.end()
    if cursor < len(text):
        chunk = _tex_escape(text[cursor:])
        rendered.append(r"\underline{" + chunk + "}" if underline_depth > 0 and chunk else chunk)
    return "".join(rendered)


def _reportlab_text_markup(value: str | None) -> str:
    text = value or ""
    rendered: list[str] = []
    cursor = 0
    for match in UNDERLINE_TAG_PATTERN.finditer(text):
        if match.start() > cursor:
            rendered.append(html.escape(text[cursor:match.start()]))
        rendered.append("</u>" if match.group(0).startswith("</") else "<u>")
        cursor = match.end()
    if cursor < len(text):
        rendered.append(html.escape(text[cursor:]))
    return "".join(rendered)


def _normalize_latex_math(math: str) -> str:
    value = math.strip()
    value = value.replace(r"\dfrac", r"\frac")
    value = value.replace(r"\begin{aligned}", r"\begin{aligned}")
    value = re.sub(r"(?<!\\)\\\s+(?=[^\\]*&)", r"\\\\ ", value)
    value = re.sub(r"(\\begin\{cases\}.*?\\end\{cases\})", lambda match: re.sub(r"(?<!\\)\\\s+", r"\\\\ ", match.group(1)), value, flags=re.DOTALL)
    return value


def _tex_content(value: str | None) -> str:
    raw = normalize_geometry_notation(value or "")
    parts = re.split(r"(\$\$.*?\$\$|\$.*?\$)", raw, flags=re.DOTALL)
    output: list[str] = []
    for part in parts:
        if not part:
            continue
        if part.startswith("$$") and part.endswith("$$"):
            math = _normalize_latex_math(part[2:-2])
            output.append(f"\n\\[\n{math}\n\\]\n")
        elif part.startswith("$") and part.endswith("$"):
            math = _normalize_latex_math(part[1:-1])
            output.append(f"${math}$")
        else:
            escaped = _tex_escape_with_underline(part)
            escaped = escaped.replace("\r\n", "\n").replace("\n", r"\\ " + "\n")
            output.append(escaped)
    return "".join(output)


def _tex_header(template: ExamTemplate, export_values: dict) -> str:
    fields = template.header_fields or {}
    lines = []
    if template.academy_name:
        lines.append(r"\textbf{" + _tex_escape(template.academy_name) + "}")
    if fields.get("exam_title"):
        lines.append("시험명: " + _tex_escape(export_values.get("exam_title") or "___________"))
    parts = []
    if fields.get("class_name"):
        parts.append("반: " + _tex_escape(export_values.get("class_name") or "_______"))
    if fields.get("student_name"):
        parts.append("이름: " + _tex_escape(export_values.get("student_name") or "_______"))
    if fields.get("date"):
        parts.append("날짜: " + _tex_escape(export_values.get("date") or "_____"))
    if parts:
        lines.append(" \\quad ".join(parts))
    logo_path = _static_to_path(template.logo_url)
    if not lines and not logo_path:
        return ""
    text_block = r"\\ ".join(lines) if lines else r"\vphantom{X}"
    if logo_path:
        logo_cell = rf"\includegraphics[width=32mm,height=16mm,keepaspectratio]{{{_tex_path(logo_path)}}}"
    else:
        logo_cell = r"\vphantom{\includegraphics[width=32mm,height=16mm]{example-image}}"
    return "\n".join(
        [
            r"\noindent\begingroup",
            r"\setlength{\fboxsep}{3mm}%",
            r"\fbox{%",
            r"\begin{minipage}{\dimexpr\linewidth-2\fboxsep-2\fboxrule\relax}",
            r"\begin{tabular}{@{}m{34mm}@{\hspace{4mm}}m{\dimexpr\linewidth-38mm\relax}@{}}",
            logo_cell + " & " + text_block + r"\\",
            r"\end{tabular}",
            r"\end{minipage}%",
            r"}",
            r"\endgroup\par",
            r"\vspace{6mm}",
        ]
    )


def _tex_problem(problem: Problem, image_height: str = "0.28\\textheight") -> str:
    source_label = problem.tags.source if problem.tags and problem.tags.source else f"문 {problem.problem_number}"
    body = [
        r"\noindent\textbf{" + _tex_escape(source_label) + r"}\par",
        r"\vspace{2mm}",
        _tex_content(problem.problem_text),
    ]
    image_path = _static_to_path(problem.visual_url)
    if problem.has_visual and image_path:
        body.extend(
            [
                r"\vspace{2mm}",
                r"\begin{center}",
                rf"\includegraphics[width=\linewidth,height={image_height},keepaspectratio]{{{_tex_path(image_path)}}}",
                r"\end{center}",
            ]
        )
    return "\n".join(body)


def _has_solution(problem: Problem) -> bool:
    return bool(str(problem.answer or "").strip())


def _source_lookup_metadata(problem: Problem) -> str:
    tags = problem.tags
    batch = getattr(problem, "batch", None)
    lines = ["답안이 저장되어 있지 않습니다. 원본 자료에서 답지를 확인하세요."]
    if tags and tags.source:
        lines.append(f"저장된 출처: {tags.source}")
    if batch and getattr(batch, "name", None):
        lines.append(f"원본 배치: {batch.name}")
    if batch and getattr(batch, "problem_pdf_filename", None):
        lines.append(f"문항 PDF: {Path(str(batch.problem_pdf_filename)).name}")
    if problem.review_page_number:
        lines.append(f"원본 페이지: p.{problem.review_page_number}")
    lines.append(f"문항 번호: {problem.problem_number}번")
    if problem.answer:
        lines.append(f"저장된 정답: {problem.answer}")
    return "\n".join(lines)


def _solution_body(problem: Problem, include_missing_solution_metadata: bool) -> str:
    if problem.answer:
        return problem.answer or ""
    if include_missing_solution_metadata:
        return _source_lookup_metadata(problem)
    return "답안이 없습니다."


def _solution_export_problems(problems: Iterable[Problem], include_solution: bool, include_missing_solution_metadata: bool) -> list[Problem]:
    items = list(problems)
    if include_solution:
        return items
    if include_missing_solution_metadata:
        return [problem for problem in items if not _has_solution(problem)]
    return []


def _solution_section_title(include_solution: bool) -> str:
    return "정답" if include_solution else "답안 미등록 문항 원본 위치"


def _tex_solution(problem: Problem, include_missing_solution_metadata: bool = False) -> str:
    source_label = problem.tags.source if problem.tags and problem.tags.source else f"문 {problem.problem_number}"
    parts = [
        r"\noindent\textbf{" + _tex_escape(source_label) + r". 정답: " + _tex_content(problem.answer or "미확인") + r"}\par",
    ]
    if not problem.answer and include_missing_solution_metadata:
        parts.append(r"\smallskip")
        parts.append(_tex_content(_solution_body(problem, include_missing_solution_metadata)))
    parts.append(r"\par\medskip\hrule\medskip")
    return "\n".join(parts)


def _build_xelatex_document(
    problems: list[Problem],
    template: ExamTemplate,
    export_values: dict,
    include_solution: bool,
    include_missing_solution_metadata: bool = False,
) -> str:
    font_size = max(8, min(int(template.font_size or 10), 14))
    lines = [
        r"\documentclass[" + str(font_size) + r"pt,a4paper]{article}",
        r"\usepackage[margin=15mm]{geometry}",
        r"\usepackage{kotex}",
        r"\usepackage{amsmath,amssymb,mathtools}",
        r"\usepackage{graphicx}",
        r"\usepackage{xcolor}",
        r"\usepackage{fancyhdr}",
        r"\usepackage{array}",
        r"\usepackage{multicol}",
        r"\setlength{\parindent}{0pt}",
        r"\setlength{\parskip}{3pt}",
        r"\setlength{\columnsep}{8mm}",
        r"\sloppy",
        r"\emergencystretch=2em",
        r"\pagestyle{fancy}",
        r"\fancyhf{}",
        r"\rfoot{\thepage}",
    ]
    if template.footer_text:
        lines.append(r"\cfoot{" + _tex_escape(template.footer_text) + "}")
    lines.extend(
        [
            r"\begin{document}",
            _tex_header(template, export_values),
        ]
    )

    if template.problems_per_page == 1:
        for index, problem in enumerate(problems):
            if index:
                lines.extend([r"\newpage", _tex_header(template, export_values)])
            lines.append(_tex_problem(problem, "0.35\\textheight"))
    else:
        for index in range(0, len(problems), 2):
            if index:
                lines.extend([r"\newpage", _tex_header(template, export_values)])
            left = _tex_problem(problems[index], "0.22\\textheight")
            right = _tex_problem(problems[index + 1], "0.22\\textheight") if index + 1 < len(problems) else ""
            lines.extend(
                [
                    r"\begin{multicols}{2}",
                    left,
                    r"\columnbreak",
                    right,
                    r"\end{multicols}",
                ]
            )

    solution_problems = _solution_export_problems(problems, include_solution, include_missing_solution_metadata)
    if solution_problems:
        title = _solution_section_title(include_solution)
        lines.extend([r"\newpage", _tex_header(template, export_values), r"\begin{center}\Large\textbf{" + _tex_escape(title) + r"}\end{center}", r"\vspace{4mm}"])
        for problem in solution_problems:
            lines.append(_tex_solution(problem, include_missing_solution_metadata))

    lines.append(r"\end{document}")
    return "\n".join(lines)


def _generate_xelatex_pdf(
    problems: list[Problem],
    template: ExamTemplate,
    export_values: dict,
    include_solution: bool,
    include_missing_solution_metadata: bool = False,
) -> BytesIO:
    xelatex = _find_xelatex()
    if not xelatex:
        raise RuntimeError("xelatex is not installed")
    workdir = Path(tempfile.gettempdir()) / "tena_forge_latex" / uuid4().hex
    workdir.mkdir(parents=True, exist_ok=True)
    tex_path = workdir / "exam.tex"
    pdf_path = workdir / "exam.pdf"
    tex_path.write_text(
        _build_xelatex_document(problems, template, export_values, include_solution, include_missing_solution_metadata),
        encoding="utf-8",
    )
    env = os.environ.copy()
    env["PATH"] = f"{MIKTEX_BIN};{env.get('PATH', '')}"
    result = subprocess.run(
        [xelatex, "-interaction=nonstopmode", "-halt-on-error", "-output-directory", str(workdir), str(tex_path)],
        cwd=str(workdir),
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=180,
    )
    if result.returncode != 0 or not pdf_path.exists():
        log = (workdir / "exam.log").read_text(encoding="utf-8", errors="ignore") if (workdir / "exam.log").exists() else result.stdout + result.stderr
        raise RuntimeError(f"XeLaTeX export failed: {log[-3000:]}")
    buffer = BytesIO(pdf_path.read_bytes())
    buffer.seek(0)
    return buffer


LATEX_REPLACEMENTS = {
    r"\to": "→",
    r"\leq": "≤",
    r"\le": "≤",
    r"\geq": "≥",
    r"\ge": "≥",
    r"\neq": "≠",
    r"\ne": "≠",
    r"\cdot": "·",
    r"\times": "×",
    r"\div": "÷",
    r"\pm": "±",
    r"\mp": "∓",
    r"\circ": "∘",
    r"\infty": "∞",
    r"\therefore": "∴",
    r"\because": "∵",
    r"\alpha": "α",
    r"\beta": "β",
    r"\gamma": "γ",
    r"\theta": "θ",
    r"\pi": "π",
}


def _replace_latex_group_command(text: str, command: str, template: str) -> str:
    pattern = re.compile(rf"\\{command}\s*\{{([^{{}}]+)\}}")
    while True:
        next_text = pattern.sub(lambda match: template.format(match.group(1)), text)
        if next_text == text:
            return text
        text = next_text


def _replace_latex_fraction(text: str) -> str:
    pattern = re.compile(r"\\(?:dfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}")
    while True:
        next_text = pattern.sub(lambda match: f"({match.group(1)})/({match.group(2)})", text)
        if next_text == text:
            return text
        text = next_text


def _latex_to_text(text: str | None) -> str:
    value = text or ""
    value = value.replace("$$", "")
    value = value.replace("$", "")
    value = value.replace(r"\(", "").replace(r"\)", "")
    value = value.replace(r"\[", "").replace(r"\]", "")
    value = value.replace(r"\left", "").replace(r"\right", "")
    value = value.replace(r"\middle", "")
    value = re.sub(r"\\begin\{(?:cases|aligned|array|matrix|pmatrix|bmatrix)\}", "\n", value)
    value = re.sub(r"\\end\{(?:cases|aligned|array|matrix|pmatrix|bmatrix)\}", "\n", value)
    value = value.replace(r"\\", "\n")
    value = value.replace("&", " ")

    value = _replace_latex_fraction(value)
    value = _replace_latex_group_command(value, "sqrt", "√({})")
    value = _replace_latex_group_command(value, "overline", "overline({})")
    value = _replace_latex_group_command(value, "bar", "bar({})")

    value = re.sub(r"\\lim_\{([^{}]+)\}", r"lim \1", value)
    value = re.sub(r"\\sum_\{([^{}]+)\}\^\{([^{}]+)\}", r"Σ(\1 to \2)", value)
    value = re.sub(r"\\int_\{([^{}]+)\}\^\{([^{}]+)\}", r"∫(\1 to \2)", value)
    value = re.sub(r"([A-Za-z0-9)\]}])\^\{([^{}]+)\}", r"\1^(\2)", value)
    value = re.sub(r"([A-Za-z0-9)\]}])_\{([^{}]+)\}", r"\1_(\2)", value)
    value = re.sub(r"([A-Za-z0-9)\]}])\^([A-Za-z0-9+\-]+)", r"\1^(\2)", value)
    value = re.sub(r"([A-Za-z0-9)\]}])_([A-Za-z0-9+\-]+)", r"\1_(\2)", value)

    for latex, replacement in LATEX_REPLACEMENTS.items():
        value = value.replace(latex, replacement)

    value = re.sub(r"\\(sin|cos|tan|log|ln|max|min|lim)", r"\1", value)
    value = re.sub(r"\\[a-zA-Z]+", "", value)
    value = value.replace("{", "").replace("}", "")
    value = re.sub(r"[ \t]{2,}", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def _math_cache_dir() -> Path:
    path = Path(tempfile.gettempdir()) / "tena_forge_math"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _normalize_mathtext(latex: str) -> str:
    value = latex.strip()
    value = value.removeprefix("$$").removesuffix("$$").strip()
    value = value.removeprefix("$").removesuffix("$").strip()
    value = value.replace(r"\dfrac", r"\frac")
    value = value.replace(r"\tfrac", r"\frac")
    value = value.replace(r"\left", "").replace(r"\right", "")
    value = value.replace(r"\middle", "")
    value = value.replace(r"\displaystyle", "")
    value = value.replace(r"\textstyle", "")
    value = value.replace(r"\scriptstyle", "")
    value = re.sub(r"\\operatorname\s*\{([^{}]+)\}", r"\\mathrm{\1}", value)
    value = re.sub(r"\\text\s*\{([^{}]+)\}", r"\\mathrm{\1}", value)
    return value


def _apply_cases_displaystyle(latex: str) -> str:
    def replace(match: re.Match) -> str:
        body = match.group(1)
        styled = re.sub(
            r"(^|\\\\\s*)(?!\s*\\(?:display|text|script)style\b)",
            r"\1\\displaystyle ",
            body,
        )
        return rf"\begin{{cases}}{styled}\end{{cases}}"

    return re.sub(r"\\begin\{cases\}([\s\S]*?)\\end\{cases\}", replace, latex)


MATH_TOKEN_PATTERN = re.compile(r"(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)")


def _strip_math_delimiters(raw: str) -> tuple[str, bool]:
    if raw.startswith("$$") and raw.endswith("$$"):
        return raw[2:-2], True
    if raw.startswith(r"\[") and raw.endswith(r"\]"):
        return raw[2:-2], True
    if raw.startswith(r"\(") and raw.endswith(r"\)"):
        return raw[2:-2], False
    if raw.startswith("$") and raw.endswith("$"):
        return raw[1:-1], False
    return raw, False


def _math_needs_room(latex: str) -> bool:
    return bool(re.search(r"\\(?:lim|sum|prod|int|frac|dfrac|tfrac|sqrt|begin)\b|\\\\", latex))


def _math_needs_displaystyle(latex: str) -> bool:
    value = latex.strip()
    if re.search(r"\\(?:display|text|script)style\b", value):
        return False
    if re.search(r"\\(?:lim|sum|prod|int)\b", value):
        return True
    return bool(re.search(r"\\(?:frac|dfrac|tfrac)\b", value))


def _math_forced_block(latex: str) -> bool:
    return bool(re.search(r"\\begin\{|\\\\", latex))


def _math_needs_latex(latex: str) -> bool:
    return bool(re.search(r"\\begin\{(?:cases|aligned|array|matrix|pmatrix|bmatrix)\}", latex))


def _find_miktex_tool(name: str) -> str | None:
    found = shutil.which(name)
    if found:
        return found
    candidate = MIKTEX_BIN / f"{name}.exe"
    return str(candidate) if candidate.exists() else None


def _find_chromium() -> str | None:
    found = shutil.which("chrome") or shutil.which("msedge") or shutil.which("chromium")
    if found:
        return found
    candidates = [
        Path("C:/Program Files/Google/Chrome/Application/chrome.exe"),
        Path("C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"),
        Path("C:/Program Files/Microsoft/Edge/Application/msedge.exe"),
        Path("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return None


STATIC_SRC_PATTERN = re.compile(r'(?P<prefix>\bsrc=)(?P<quote>["\'])(?P<url>/static/[^"\']+)(?P=quote)')


def _localize_static_sources(html_doc: str) -> str:
    def replace(match: re.Match) -> str:
        url = html.unescape(match.group("url"))
        path = _static_to_path(url)
        if not path:
            return match.group(0)
        quote = match.group("quote")
        return f"{match.group('prefix')}{quote}{path.as_uri()}{quote}"

    return STATIC_SRC_PATTERN.sub(replace, html_doc)


def _render_html_pdf_with_chrome(html_doc: str) -> BytesIO:
    chrome = _find_chromium()
    if not chrome:
        raise RuntimeError("Chrome or Edge is required for browser PDF export.")

    workdir = Path(tempfile.gettempdir()) / "tena_forge_browser_pdf" / uuid4().hex
    workdir.mkdir(parents=True, exist_ok=True)
    html_path = workdir / "template.html"
    pdf_path = workdir / "template.pdf"
    try:
        html_path.write_text(_localize_static_sources(html_doc), encoding="utf-8")
        command = [
            chrome,
            "--headless=new",
            "--disable-gpu",
            "--disable-extensions",
            "--no-sandbox",
            "--allow-file-access-from-files",
            "--run-all-compositor-stages-before-draw",
            "--virtual-time-budget=3500",
            "--no-pdf-header-footer",
            "--print-to-pdf-no-header",
            f"--print-to-pdf={pdf_path}",
            html_path.as_uri(),
        ]
        result = subprocess.run(
            command,
            cwd=str(workdir),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
        )
        if result.returncode != 0 or not pdf_path.exists():
            fallback = command.copy()
            fallback[1] = "--headless"
            result = subprocess.run(
                fallback,
                cwd=str(workdir),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=120,
            )
        if result.returncode != 0 or not pdf_path.exists():
            raise RuntimeError((result.stdout + result.stderr)[-2000:])
        buffer = BytesIO(pdf_path.read_bytes())
        buffer.seek(0)
        return buffer
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def _normalize_latex_image_math(latex: str) -> str:
    value = latex.strip()
    value = value.removeprefix("$$").removesuffix("$$").strip()
    value = value.removeprefix("$").removesuffix("$").strip()
    value = value.replace(r"\dfrac", r"\frac")
    value = value.replace(r"\tfrac", r"\frac")
    value = value.replace(r"\middle", "")
    value = re.sub(
        r"(\\begin\{(?:cases|aligned|array|matrix|pmatrix|bmatrix)\}.*?\\end\{(?:cases|aligned|array|matrix|pmatrix|bmatrix)\})",
        lambda match: re.sub(r"(?<!\\)\\\s+", r"\\\\ ", match.group(1)),
        value,
        flags=re.DOTALL,
    )
    value = _apply_cases_displaystyle(value)
    return value


def _render_latex_math_image(latex: str, font_size: float, display_mode: bool) -> tuple[Path, float, float]:
    latex_bin = _find_miktex_tool("latex")
    dvipng_bin = _find_miktex_tool("dvipng")
    if not latex_bin or not dvipng_bin:
        raise RuntimeError("latex/dvipng is not installed")

    normalized = _normalize_latex_image_math(latex)
    render_size = max(7, font_size * (1.35 if display_mode else 1.0))
    key = hashlib.sha1(f"latex:{render_size}:{display_mode}:{normalized}".encode("utf-8")).hexdigest()
    path = _math_cache_dir() / f"{key}.png"
    if not path.exists():
        workdir = _math_cache_dir() / f"work_{key}"
        workdir.mkdir(parents=True, exist_ok=True)
        try:
            tex_path = workdir / "math.tex"
            png_path = workdir / "math.png"
            tex_path.write_text(
                "\n".join(
                    [
                        r"\documentclass[border=1pt]{standalone}",
                        r"\usepackage{amsmath,amssymb}",
                        r"\begin{document}",
                        rf"\fontsize{{{render_size:.2f}}}{{{render_size * 1.2:.2f}}}\selectfont",
                        rf"$\displaystyle {normalized}$",
                        r"\end{document}",
                    ]
                ),
                encoding="utf-8",
            )
            env = os.environ.copy()
            env["PATH"] = f"{MIKTEX_BIN};{env.get('PATH', '')}"
            latex_result = subprocess.run(
                [latex_bin, "-interaction=nonstopmode", "-halt-on-error", tex_path.name],
                cwd=str(workdir),
                env=env,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=90,
            )
            if latex_result.returncode != 0:
                raise RuntimeError((latex_result.stdout + latex_result.stderr)[-1000:])
            dvipng_result = subprocess.run(
                [dvipng_bin, "-T", "tight", "-D", "220", "-bg", "Transparent", "-o", png_path.name, "math.dvi"],
                cwd=str(workdir),
                env=env,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=90,
            )
            if dvipng_result.returncode != 0 or not png_path.exists():
                raise RuntimeError((dvipng_result.stdout + dvipng_result.stderr)[-1000:])
            path.write_bytes(png_path.read_bytes())
        finally:
            shutil.rmtree(workdir, ignore_errors=True)
    with PILImage.open(path) as image:
        width_px, height_px = image.size
    width = width_px * 72 / 220
    height = height_px * 72 / 220
    return path, width, height


def _render_math_image(latex: str, font_size: float, display_mode: bool = False) -> tuple[Path, float, float]:
    from matplotlib.backends.backend_agg import FigureCanvasAgg
    from matplotlib.figure import Figure

    if _math_needs_latex(latex):
        return _render_latex_math_image(latex, font_size, display_mode)

    normalized = _normalize_mathtext(latex)
    normalized = _apply_cases_displaystyle(normalized)
    if display_mode or _math_needs_displaystyle(latex):
        normalized = rf"\displaystyle {normalized}"
    render_size = max(5, font_size * (1.5 if display_mode else 1.08))
    key = hashlib.sha1(f"{render_size}:{display_mode}:{normalized}".encode("utf-8")).hexdigest()
    path = _math_cache_dir() / f"{key}.png"
    try:
        if not path.exists():
            fig = Figure(figsize=(0.01, 0.01), dpi=220)
            FigureCanvasAgg(fig)
            fig.text(0, 0, f"${normalized}$", fontsize=render_size, color="black")
            fig.savefig(path, dpi=220, transparent=True, bbox_inches="tight", pad_inches=0.02)
    except Exception:
        return _render_latex_math_image(latex, font_size, display_mode)
    with PILImage.open(path) as image:
        width_px, height_px = image.size
    width = width_px * 72 / 220
    height = height_px * 72 / 220
    return path, width, height


def _math_img_tag(latex: str, style: ParagraphStyle, display_mode: bool = False) -> str:
    try:
        path, width, height = _render_math_image(latex, style.fontSize, display_mode)
    except Exception:
        return html.escape(_latex_to_text(latex))
    if display_mode and _math_forced_block(latex):
        max_height = style.fontSize * 8.2
    else:
        max_height = style.fontSize * (4.2 if display_mode else 1.9)
    if height > max_height:
        ratio = max_height / height
        width *= ratio
        height *= ratio
    return f'<img src="{html.escape(path.as_posix())}" width="{width:.2f}" height="{height:.2f}" valign="middle"/>'


def _latex_paragraph_markup(text: str | None, style: ParagraphStyle) -> str:
    raw = normalize_geometry_notation(text or "")
    rendered: list[str] = []
    cursor = 0
    for match in MATH_TOKEN_PATTERN.finditer(raw):
        if match.start() > cursor:
            rendered.append(_reportlab_text_markup(raw[cursor:match.start()]))
        math, explicit_display = _strip_math_delimiters(match.group(0))
        line_prefix = raw[:match.start()].rsplit("\n", 1)[-1].strip()
        line_suffix = raw[match.end():].split("\n", 1)[0].strip()
        display_mode = explicit_display or _math_forced_block(math) or (not line_prefix and not line_suffix and _math_needs_room(math))
        tag = _math_img_tag(math, style, display_mode or _math_needs_room(math))
        rendered.append(f"<br/>{tag}<br/>" if display_mode else tag)
        cursor = match.end()
    if cursor < len(raw):
        rendered.append(_reportlab_text_markup(raw[cursor:]))
    return "".join(rendered)


def _paragraph(text: str | None, style: ParagraphStyle) -> Paragraph:
    value = _latex_paragraph_markup(text, style)
    value = value.replace("\n", "<br/>")
    return Paragraph(value or "&nbsp;", style)


def _scaled_image(path: Path, max_width: float, max_height: float | None = None) -> Image | None:
    try:
        with PILImage.open(path) as image:
            width, height = image.size
    except Exception:
        return None
    ratio = max_width / width
    if max_height is not None:
        ratio = min(ratio, max_height / height)
    ratio = min(ratio, 1.0)
    return Image(str(path), width=width * ratio, height=height * ratio)


def _header_table(template: ExamTemplate, export_values: dict, width: float):
    fields = template.header_fields or {}
    logo = None
    logo_path = _static_to_path(template.logo_url)
    if logo_path:
        logo = _scaled_image(logo_path, 34 * mm, 18 * mm)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("HeaderTitle", parent=styles["Normal"], fontName=FONT_NAME, fontSize=11, leading=14)
    line_style = ParagraphStyle("HeaderLine", parent=styles["Normal"], fontName=FONT_NAME, fontSize=9, leading=13)

    lines = []
    if template.academy_name:
        lines.append(Paragraph(f"<b>{html.escape(template.academy_name)}</b>", title_style))
    if fields.get("exam_title"):
        lines.append(_paragraph(f"시험명: {export_values.get('exam_title') or '___________'}", line_style))
    parts = []
    if fields.get("class_name"):
        parts.append(f"반: {export_values.get('class_name') or '_______'}")
    if fields.get("student_name"):
        parts.append(f"이름: {export_values.get('student_name') or '_______'}")
    if fields.get("date"):
        parts.append(f"날짜: {export_values.get('date') or '_____'}")
    if parts:
        lines.append(_paragraph("  ".join(parts), line_style))

    table = Table([[logo or "", lines]], colWidths=[40 * mm, width - 40 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#d7d0e8")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def _problem_block(problem: Problem, column_width: float, styles: dict):
    source_label = problem.tags.source if problem.tags and problem.tags.source else f"문 {problem.problem_number}"
    content = [
        Paragraph(f"<b>{html.escape(source_label)}</b>", styles["problem_title"]),
        Spacer(1, 3 * mm),
        _paragraph(problem.problem_text, styles["problem"]),
    ]
    image_path = _static_to_path(problem.visual_url)
    if problem.has_visual and image_path:
        visual = _scaled_image(image_path, column_width, 62 * mm)
        if visual:
            content.extend([Spacer(1, 3 * mm), visual])
    content.extend([Spacer(1, 4 * mm), HRFlowable(width="100%", color=colors.HexColor("#ddd6ef"), thickness=0.6), Spacer(1, 3 * mm)])
    return content


def _build_exam_story(problems: list[Problem], template: ExamTemplate, export_values: dict, doc_width: float, styles: dict):
    story = [_header_table(template, export_values, doc_width), Spacer(1, 7 * mm)]
    if template.problems_per_page == 1:
        for index, problem in enumerate(problems):
            story.extend(_problem_block(problem, doc_width, styles))
            if index < len(problems) - 1:
                story.append(PageBreak())
                story.extend([_header_table(template, export_values, doc_width), Spacer(1, 7 * mm)])
        return story

    column_width = (doc_width - 8 * mm) / 2
    for index in range(0, len(problems), 2):
        left = _problem_block(problems[index], column_width, styles)
        right = _problem_block(problems[index + 1], column_width, styles) if index + 1 < len(problems) else []
        table = Table([[left, right]], colWidths=[column_width, column_width], hAlign="LEFT")
        table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 8)]))
        story.append(table)
        if index + 2 < len(problems):
            story.append(PageBreak())
            story.extend([_header_table(template, export_values, doc_width), Spacer(1, 7 * mm)])
    return story


def _build_solution_story(
    problems: Iterable[Problem],
    template: ExamTemplate,
    export_values: dict,
    doc_width: float,
    styles: dict,
    include_solution: bool,
    include_missing_solution_metadata: bool = False,
):
    story = [PageBreak(), _header_table(template, export_values, doc_width), Spacer(1, 8 * mm)]
    centered = ParagraphStyle("SolutionHeading", parent=styles["problem_title"], alignment=TA_CENTER, fontSize=18, leading=24)
    story.extend([Paragraph(_solution_section_title(include_solution), centered), Spacer(1, 8 * mm)])
    for problem in problems:
        answer = _latex_paragraph_markup(problem.answer or "미확인", styles["problem_title"])
        source_label = html.escape(problem.tags.source if problem.tags and problem.tags.source else f"문 {problem.problem_number}")
        story.append(Paragraph(f"<b>{source_label}. 정답: {answer}</b>", styles["problem_title"]))
        if not problem.answer and include_missing_solution_metadata:
            story.extend([Spacer(1, 3 * mm), _paragraph(_solution_body(problem, include_missing_solution_metadata), styles["problem"])])
        story.extend([Spacer(1, 4 * mm), HRFlowable(width="100%", color=colors.HexColor("#ddd6ef"), thickness=0.6), Spacer(1, 4 * mm)])
    return story


def _generate_reportlab_pdf(
    problems: list[Problem],
    template: ExamTemplate,
    export_values: dict,
    include_solution: bool,
    include_missing_solution_metadata: bool = False,
) -> BytesIO:
    register_korean_font()
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=20 * mm, bottomMargin=20 * mm)

    base = getSampleStyleSheet()
    styles = {
        "problem": ParagraphStyle("Problem", parent=base["Normal"], fontName=FONT_NAME, fontSize=template.font_size, leading=template.font_size + 5),
        "problem_title": ParagraphStyle("ProblemTitle", parent=base["Normal"], fontName=FONT_NAME, fontSize=template.font_size + 1, leading=template.font_size + 5),
        "chip": ParagraphStyle("Chip", parent=base["Normal"], fontName=FONT_NAME, fontSize=9, leading=13, textColor=colors.HexColor("#4c1d95")),
    }
    story = _build_exam_story(problems, template, export_values, doc.width, styles)
    solution_problems = _solution_export_problems(problems, include_solution, include_missing_solution_metadata)
    if solution_problems:
        story.extend(_build_solution_story(solution_problems, template, export_values, doc.width, styles, include_solution, include_missing_solution_metadata))
    doc.build(story, canvasmaker=lambda *args, **kwargs: NumberedCanvas(*args, footer_text=template.footer_text, **kwargs))
    buffer.seek(0)
    return buffer


def generate_exam_pdf(
    problems: list[Problem],
    template: ExamTemplate,
    export_values: dict,
    include_solution: bool,
    include_missing_solution_metadata: bool = False,
) -> BytesIO:
    try:
        return _generate_xelatex_pdf(problems, template, export_values, include_solution, include_missing_solution_metadata)
    except Exception:
        return _generate_reportlab_pdf(problems, template, export_values, include_solution, include_missing_solution_metadata)


def _canvas_color(value: str | None, fallback=colors.black):
    if not value or value == "transparent":
        return None
    if value.startswith("rgba"):
        numbers = re.findall(r"[\d.]+", value)
        if len(numbers) >= 3:
            return colors.Color(int(numbers[0]) / 255, int(numbers[1]) / 255, int(numbers[2]) / 255)
    try:
        return colors.HexColor(value)
    except Exception:
        return fallback


def _canvas_image_reader(src: str | None):
    if not src:
        return None
    try:
        if src.startswith("data:image"):
            encoded = src.split(",", 1)[1]
            return ImageReader(BytesIO(base64.b64decode(encoded)))
        image_path = _static_to_path(src)
        if image_path:
            return ImageReader(str(image_path))
    except Exception:
        return None
    return None


VISUAL_PX_TO_PT = 72 / 96


def _visual_num(value, default: float = 0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _visual_color(value: str | None, fallback=colors.black):
    if not value or value == "transparent":
        return None
    named = {
        "white": colors.white,
        "black": colors.black,
        "currentColor": fallback,
        "inherit": fallback,
    }
    if value in named:
        return named[value]
    return _canvas_color(value, fallback)


def _visual_style(element: dict, key: str, default=None):
    style = element.get("style") if isinstance(element.get("style"), dict) else {}
    return style.get(key, default)


def _visual_box(element: dict, scale: float, page_height: float) -> tuple[float, float, float, float]:
    x = _visual_num(element.get("x")) * scale
    y_top = _visual_num(element.get("y")) * scale
    w = max(1, _visual_num(element.get("width"), 1) * scale)
    h = max(1, _visual_num(element.get("height"), 1) * scale)
    return x, page_height - y_top - h, w, h


def _visual_resolve_text(value: str | None, data: dict) -> str:
    text = value or ""

    def replace(match):
        return str(data.get(match.group(1), ""))

    return re.sub(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}", replace, text)


def _visual_paragraph_style(name: str, style: dict | None, scale: float, fallback_size: float = 12) -> ParagraphStyle:
    style = style or {}
    align = str(style.get("textAlign") or "left")
    alignment = TA_CENTER if align == "center" else TA_RIGHT if align == "right" else 0
    font_size = max(5, _visual_num(style.get("fontSize"), fallback_size) * scale)
    leading = font_size * _visual_num(style.get("lineHeight"), 1.45)
    color = _visual_color(style.get("color"), colors.black) or colors.black
    return ParagraphStyle(
        name,
        fontName=FONT_NAME,
        fontSize=font_size,
        leading=leading,
        alignment=alignment,
        textColor=color,
    )


def _paragraph_markup(text: str | None, style: ParagraphStyle) -> str:
    return _latex_paragraph_markup(text, style).replace("\n", "<br/>")


def _visual_text_blocks(text: str | None, style: ParagraphStyle) -> list[tuple[str, str]]:
    raw = normalize_geometry_notation(text or "")
    blocks: list[tuple[str, str]] = []
    inline_parts: list[str] = []
    cursor = 0

    def flush_inline() -> None:
        if not inline_parts:
            return
        markup = "".join(inline_parts).replace("\n", "<br/>")
        if markup:
            blocks.append(("paragraph", markup))
        inline_parts.clear()

    for match in MATH_TOKEN_PATTERN.finditer(raw):
        if match.start() > cursor:
            inline_parts.append(_reportlab_text_markup(raw[cursor:match.start()]))
        math, explicit_display = _strip_math_delimiters(match.group(0))
        line_prefix = raw[:match.start()].rsplit("\n", 1)[-1].strip()
        line_suffix = raw[match.end():].split("\n", 1)[0].strip()
        display_mode = explicit_display or _math_forced_block(math) or (not line_prefix and not line_suffix and _math_needs_room(math))
        if display_mode:
            flush_inline()
            blocks.append(("math", math))
        else:
            inline_parts.append(_math_img_tag(math, style, False))
        cursor = match.end()
    if cursor < len(raw):
        inline_parts.append(_reportlab_text_markup(raw[cursor:]))
    flush_inline()
    return blocks or [("paragraph", "&nbsp;")]


def _visual_display_math_size(latex: str, style: ParagraphStyle, width: float) -> tuple[Path | None, float, float]:
    try:
        path, image_w, image_h = _render_math_image(latex, style.fontSize, True)
    except Exception:
        return None, 0, 0
    max_height = style.fontSize * (8.2 if _math_forced_block(latex) else 4.8)
    ratio = min(1.0, width / max(1, image_w), max_height / max(1, image_h))
    return path, image_w * ratio, image_h * ratio


def _visual_text_height(text: str | None, width: float, height: float, style: ParagraphStyle) -> float:
    total = 0.0
    for kind, value in _visual_text_blocks(text, style):
        if kind == "math":
            _, _, image_h = _visual_display_math_size(value, style, width)
            total += image_h + style.leading * 0.25
            continue
        paragraph = Paragraph(value or "&nbsp;", style)
        _, used_h = paragraph.wrap(max(1, width), max(1, height))
        total += used_h
    return total


def _paragraph_height(text: str | None, width: float, height: float, style: ParagraphStyle) -> float:
    return _visual_text_height(text, width, height, style)


def _draw_text_blocks(pdf: canvas.Canvas, text: str, x: float, y: float, w: float, h: float, style: ParagraphStyle, valign: str = "top") -> None:
    blocks = _visual_text_blocks(text, style)
    used_total = _visual_text_height(text, w, h, style)
    if valign == "center":
        cursor_top = y + h - max(0, (h - used_total) / 2)
    elif valign == "bottom":
        cursor_top = y + min(h, used_total)
    else:
        cursor_top = y + h
    bottom = y
    drew_any = False

    for kind, value in blocks:
        if kind == "math":
            path, image_w, image_h = _visual_display_math_size(value, style, w)
            if not path or image_h <= 0:
                continue
            block_h = image_h + style.leading * 0.25
            if cursor_top - block_h < bottom - 0.1 and drew_any:
                break
            image_x = x + max(0, (w - image_w) / 2)
            image_y = cursor_top - image_h
            pdf.drawImage(str(path), image_x, image_y, width=image_w, height=image_h, mask="auto")
            cursor_top -= block_h
            drew_any = True
            continue

        paragraph = Paragraph(value or "&nbsp;", style)
        _, used_h = paragraph.wrap(max(1, w), max(1, h))
        if cursor_top - used_h < bottom - 0.1 and drew_any:
            break
        paragraph.drawOn(pdf, x, cursor_top - used_h)
        cursor_top -= used_h
        drew_any = True


def _draw_paragraph_box(pdf: canvas.Canvas, text: str, x: float, y: float, w: float, h: float, style: ParagraphStyle) -> None:
    _draw_text_blocks(pdf, text, x, y, w, h, style, "top")


def _draw_centered_paragraph_box(pdf: canvas.Canvas, text: str, x: float, y: float, w: float, h: float, style: ParagraphStyle) -> None:
    _draw_text_blocks(pdf, text, x, y, w, h, style, "center")


def _visual_radius(value, w: float, h: float, scale: float) -> float:
    return max(0, min(_visual_num(value, 0) * scale, w / 2, h / 2))


def _visual_border_style(style: dict, default_width: float = 0, default_style: str = "solid") -> tuple[float, str]:
    width = _visual_num(style.get("strokeWidth"), default_width)
    border_style = str(style.get("borderStyle") or (default_style if width > 0 else "none"))
    return width, border_style


def _set_visual_dash(pdf: canvas.Canvas, border_style: str, scale: float) -> None:
    if border_style == "dashed":
        pdf.setDash(4 * scale, 3 * scale)
    elif border_style == "dotted":
        pdf.setDash(1 * scale, 2.5 * scale)
    else:
        pdf.setDash()


def _problem_number_label(item: dict, element: dict) -> str:
    number = str(item.get("number") or item.get("problem_number") or "")
    return str(element.get("numberFormat") or "문 {n}.").replace("{n}", number)


def _draw_visual_frame(pdf: canvas.Canvas, element: dict, x: float, y: float, w: float, h: float, scale: float) -> None:
    style = element.get("style") if isinstance(element.get("style"), dict) else {}
    fill = _visual_color(_visual_style(element, "fill"), None)
    stroke = _visual_color(_visual_style(element, "stroke"), None)
    stroke_width_raw, border_style = _visual_border_style(style, 0)
    stroke_width = stroke_width_raw * scale
    stroke_enabled = bool(stroke and stroke_width > 0 and border_style != "none")
    radius = _visual_radius(_visual_style(element, "radius"), w, h, scale)
    if not fill and not stroke_enabled:
        return
    if fill:
        pdf.setFillColor(fill)
    if stroke_enabled:
        pdf.setStrokeColor(stroke)
        pdf.setLineWidth(stroke_width)
        _set_visual_dash(pdf, border_style, scale)
    if radius:
        pdf.roundRect(x, y, w, h, radius, stroke=1 if stroke_enabled else 0, fill=1 if fill else 0)
    else:
        pdf.rect(x, y, w, h, stroke=1 if stroke_enabled else 0, fill=1 if fill else 0)
    if stroke_enabled:
        pdf.setDash()


def _draw_visual_column_dividers(pdf: canvas.Canvas, element: dict, x: float, y: float, w: float, h: float, scale: float, columns: int, padding: float, column_gap: float) -> None:
    if columns <= 1:
        return
    style = element.get("columnDividerStyle") if isinstance(element.get("columnDividerStyle"), dict) else {}
    stroke_width_raw, border_style = _visual_border_style(style, 0, "none")
    stroke_width = stroke_width_raw * scale
    stroke = _visual_color(style.get("stroke"), colors.HexColor("#d8dee9"))
    if not stroke or stroke_width <= 0 or border_style == "none":
        return
    total_gap = column_gap * (columns - 1)
    content_w = max(1, w - padding * 2 - total_gap)
    pdf.setStrokeColor(stroke)
    pdf.setLineWidth(max(0.4, stroke_width))
    _set_visual_dash(pdf, border_style, scale)
    for index in range(1, columns):
        line_x = x + padding + (content_w * index / columns) + column_gap * (index - 0.5)
        pdf.line(line_x, y + padding, line_x, y + h - padding)
    pdf.setDash()


def _draw_visual_problem_region(pdf: canvas.Canvas, element: dict, items: list[dict], base_data: dict, x: float, y: float, w: float, h: float, scale: float) -> None:
    _draw_visual_frame(pdf, element, x, y, w, h, scale)
    columns = max(1, int(_visual_num(element.get("columns"), 1)))
    rows = max(0, int(_visual_num(element.get("rows"), 0)))
    padding = _visual_num(element.get("padding"), 12) * scale
    column_gap = _visual_num(element.get("columnGap"), 12) * scale
    row_gap = _visual_num(element.get("rowGap"), 12) * scale
    _draw_visual_column_dividers(pdf, element, x, y, w, h, scale, columns, padding, column_gap)
    if not items:
        return
    max_slots = columns * rows if rows else len(items)
    usable_w = max(1, w - padding * 2 - column_gap * (columns - 1))
    col_w = usable_w / columns
    slot_h = None
    if rows:
        usable_h = max(1, h - padding * 2 - row_gap * (rows - 1))
        slot_h = usable_h / rows
    col_heights = [0.0 for _ in range(columns)]
    placed_count = 0

    card_style = element.get("cardStyle") if isinstance(element.get("cardStyle"), dict) else {}
    number_style = element.get("numberStyle") if isinstance(element.get("numberStyle"), dict) else {}
    body_style = element.get("bodyStyle") if isinstance(element.get("bodyStyle"), dict) else {}
    answer_space_style = element.get("answerSpaceStyle") if isinstance(element.get("answerSpaceStyle"), dict) else {}
    number_paragraph = _visual_paragraph_style("VisualProblemNumber", number_style, scale, 12)
    body_paragraph = _visual_paragraph_style("VisualProblemBody", body_style, scale, 12)
    solution_style = ParagraphStyle("VisualProblemSolution", fontName=FONT_NAME, fontSize=8.5, leading=12, textColor=colors.HexColor("#334155"))

    for item in items[:max_slots]:
        if rows and slot_h is not None:
            if element.get("fillDirection") == "column-first":
                column = placed_count // rows
                row = placed_count % rows
            else:
                column = placed_count % columns
                row = placed_count // columns
            if column >= columns or row >= rows:
                break
        else:
            column = placed_count % columns if element.get("fillDirection") == "row-first" else col_heights.index(min(col_heights))
            row = 0
        inner = 12 * scale
        body_width = max(1, col_w - inner * 2)
        max_item_h = max(_visual_num(element.get("minItemHeight"), 120), _visual_num(element.get("maxItemHeight"), 420)) * scale
        text_used_h = _paragraph_height(str(item.get("text") or ""), body_width, max_item_h, body_paragraph)
        solution_used_h = 0.0
        answer_text = str(item.get("answer") or item.get("solution") or "")
        if element.get("type") == "solutionRegion" or base_data.get("include_solution"):
            solution_used_h = _paragraph_height(answer_text, body_width, 80 * scale, solution_style)
        elif element.get("type") == "answerRegion":
            solution_used_h = _paragraph_height(answer_text, body_width, 36 * scale, body_paragraph)

        estimated_h = max(78 * scale, _visual_num(element.get("minItemHeight"), 120) * scale)
        estimated_h = max(estimated_h, inner * 2 + 24 * scale + min(text_used_h, 260 * scale))
        if item.get("visual_url"):
            estimated_h += 70 * scale
        if element.get("type") == "solutionRegion" or base_data.get("include_solution"):
            estimated_h += max(42 * scale, min(solution_used_h, 78 * scale)) + 8 * scale
        elif element.get("type") == "answerRegion":
            estimated_h += max(24 * scale, min(solution_used_h, 36 * scale))
        if element.get("type") not in {"solutionRegion", "answerRegion"}:
            estimated_h += 38 * scale
        estimated_h = min(estimated_h, max_item_h)

        card_x = x + padding + column * (col_w + column_gap)
        if rows and slot_h is not None:
            estimated_h = slot_h
            card_top = y + h - padding - row * (slot_h + row_gap)
            card_y = card_top - slot_h
        else:
            card_top = y + h - padding - col_heights[column]
            card_y = card_top - estimated_h
        if not rows and card_y < y + padding:
            continue

        card_fill = _visual_color(card_style.get("fill"), colors.white) or colors.white
        card_stroke = _visual_color(card_style.get("stroke"), colors.HexColor("#e5e7eb")) or colors.HexColor("#e5e7eb")
        card_stroke_width_raw, card_border_style = _visual_border_style(card_style, 1)
        card_stroke_enabled = card_stroke_width_raw > 0 and card_border_style != "none"
        card_radius = _visual_radius(card_style.get("radius"), col_w, estimated_h, scale)
        pdf.setFillColor(card_fill)
        if card_stroke_enabled:
            pdf.setStrokeColor(card_stroke)
            pdf.setLineWidth(max(0.4, card_stroke_width_raw * scale))
            _set_visual_dash(pdf, card_border_style, scale)
        pdf.roundRect(card_x, card_y, col_w, estimated_h, card_radius, stroke=1 if card_stroke_enabled else 0, fill=1)
        if card_stroke_enabled:
            pdf.setDash()

        cursor_top = card_y + estimated_h - inner
        heading_label = _problem_number_label(item, element)
        heading_h = 18 * scale
        _draw_paragraph_box(pdf, heading_label, card_x + inner, cursor_top - heading_h, col_w - inner * 2, heading_h, number_paragraph)
        cursor_top -= 24 * scale
        reserved_bottom = 44 * scale if element.get("type") not in {"solutionRegion", "answerRegion"} else 10 * scale
        available_text_height = max(34 * scale, cursor_top - card_y - inner - reserved_bottom)
        text_height = max(34 * scale, min(available_text_height, text_used_h + 4 * scale))
        _draw_paragraph_box(pdf, str(item.get("text") or ""), card_x + inner, cursor_top - text_height, col_w - inner * 2, text_height, body_paragraph)
        cursor_top -= text_height + 6 * scale

        reader = _canvas_image_reader(item.get("visual_url"))
        if reader and cursor_top - 54 * scale > card_y + inner:
            pdf.drawImage(reader, card_x + inner, cursor_top - 54 * scale, col_w - inner * 2, 50 * scale, preserveAspectRatio=True, mask="auto")
            cursor_top -= 60 * scale

        if element.get("type") == "solutionRegion" or base_data.get("include_solution"):
            solution_height = max(38 * scale, min(solution_used_h + 4 * scale, 78 * scale))
            _draw_paragraph_box(pdf, answer_text, card_x + inner, max(card_y + inner, cursor_top - solution_height), col_w - inner * 2, solution_height, solution_style)
        elif element.get("type") == "answerRegion":
            answer_height = max(24 * scale, min(solution_used_h + 4 * scale, 36 * scale))
            _draw_paragraph_box(pdf, answer_text, card_x + inner, max(card_y + inner, cursor_top - answer_height), col_w - inner * 2, answer_height, body_paragraph)
        else:
            answer_fill = _visual_color(answer_space_style.get("fill"), None)
            answer_stroke = _visual_color(answer_space_style.get("stroke"), colors.HexColor("#cbd5e1")) or colors.HexColor("#cbd5e1")
            answer_stroke_width_raw, answer_border_style = _visual_border_style(answer_space_style, 1, "dashed")
            answer_stroke_enabled = answer_stroke_width_raw > 0 and answer_border_style != "none"
            if answer_fill:
                pdf.setFillColor(answer_fill)
            if answer_stroke_enabled:
                pdf.setStrokeColor(answer_stroke)
                pdf.setLineWidth(max(0.4, answer_stroke_width_raw * scale))
                _set_visual_dash(pdf, answer_border_style, scale)
            answer_radius = _visual_radius(answer_space_style.get("radius"), col_w - inner * 2, 28 * scale, scale)
            pdf.roundRect(
                card_x + inner,
                card_y + inner,
                col_w - inner * 2,
                28 * scale,
                answer_radius,
                stroke=1 if answer_stroke_enabled else 0,
                fill=1 if answer_fill else 0,
            )
            if answer_stroke_enabled:
                pdf.setDash()

        if not rows:
            col_heights[column] += estimated_h + row_gap
        placed_count += 1


def _draw_visual_element(pdf: canvas.Canvas, element: dict, placements: dict, data: dict, scale: float, page_height: float) -> None:
    if element.get("hidden"):
        return
    x, y, w, h = _visual_box(element, scale, page_height)
    element_type = element.get("type")
    opacity = max(0, min(_visual_num(element.get("opacity"), 1), 1))
    pdf.saveState()
    try:
        pdf.setFillAlpha(opacity)
        pdf.setStrokeAlpha(opacity)
    except Exception:
        pass
    rotation = _visual_num(element.get("rotation"), 0)
    if rotation:
        pdf.translate(x + w / 2, y + h / 2)
        pdf.rotate(-rotation)
        x, y = -w / 2, -h / 2

    if element_type in {"problemRegion", "solutionRegion", "answerRegion", "contentRegion"}:
        _draw_visual_problem_region(pdf, element, placements.get(str(element.get("id") or ""), []), data, x, y, w, h, scale)
        pdf.restoreState()
        return

    _draw_visual_frame(pdf, element, x, y, w, h, scale)
    style = element.get("style") if isinstance(element.get("style"), dict) else {}
    if element_type == "text":
        paragraph_style = _visual_paragraph_style("VisualText", style, scale, 14)
        _draw_paragraph_box(pdf, _visual_resolve_text(element.get("text"), data), x, y, w, h, paragraph_style)
    elif element_type == "richText":
        paragraph_style = _visual_paragraph_style("VisualRichText", style, scale, 12)
        raw = re.sub(r"<[^>]+>", "", _visual_resolve_text(element.get("html"), data))
        _draw_paragraph_box(pdf, raw, x, y, w, h, paragraph_style)
    elif element_type == "variable":
        paragraph_style = _visual_paragraph_style("VisualVariable", style, scale, 12)
        _draw_centered_paragraph_box(pdf, str(data.get(str(element.get("variableKey") or ""), element.get("fallback") or "")), x, y, w, h, paragraph_style)
    elif element_type == "pageNumber":
        paragraph_style = _visual_paragraph_style("VisualPageNumber", style, scale, 10)
        _draw_centered_paragraph_box(pdf, _visual_resolve_text(element.get("format") or "{{page_number}} / {{total_pages}}", data), x, y, w, h, paragraph_style)
    elif element_type == "image":
        reader = _canvas_image_reader(element.get("src"))
        if reader:
            pdf.drawImage(reader, x, y, w, h, preserveAspectRatio=element.get("objectFit") != "fill", mask="auto")
    elif element_type == "shape":
        fill = _visual_color(style.get("fill"), colors.HexColor("#e2e8f0")) or colors.HexColor("#e2e8f0")
        stroke = _visual_color(style.get("stroke"), colors.HexColor("#cbd5e1"))
        pdf.setFillColor(fill)
        if stroke:
            pdf.setStrokeColor(stroke)
        shape = element.get("shape")
        if shape == "circle":
            pdf.ellipse(x, y, x + w, y + h, stroke=1 if stroke else 0, fill=1)
        elif shape == "triangle":
            path = pdf.beginPath()
            path.moveTo(x + w / 2, y + h)
            path.lineTo(x + w, y)
            path.lineTo(x, y)
            path.close()
            pdf.drawPath(path, stroke=1 if stroke else 0, fill=1)
        else:
            radius = _visual_radius(style.get("radius"), w, h, scale)
            pdf.roundRect(x, y, w, h, radius, stroke=1 if stroke else 0, fill=1) if radius else pdf.rect(x, y, w, h, stroke=1 if stroke else 0, fill=1)
    elif element_type == "line":
        stroke = _visual_color(style.get("stroke"), colors.black) or colors.black
        pdf.setStrokeColor(stroke)
        pdf.setLineWidth(max(0.5, _visual_num(style.get("strokeWidth"), 1) * scale))
        if element.get("lineKind") == "dashed":
            pdf.setDash(4, 3)
        elif element.get("lineKind") == "dotted":
            pdf.setDash(1, 3)
        pdf.line(x, y + h / 2, x + w, y + h / 2)
        pdf.setDash()
    elif element_type == "table":
        rows = max(1, int(_visual_num(element.get("rows"), 3)))
        cols = max(1, int(_visual_num(element.get("columns"), 3)))
        pdf.setStrokeColor(_visual_color(style.get("stroke"), colors.HexColor("#cbd5e1")) or colors.HexColor("#cbd5e1"))
        for row in range(rows + 1):
            yy = y + h * row / rows
            pdf.line(x, yy, x + w, yy)
        for col in range(cols + 1):
            xx = x + w * col / cols
            pdf.line(xx, y, xx, y + h)
    elif element_type == "qr":
        pdf.setStrokeColor(colors.black)
        pdf.rect(x, y, w, h)
        pdf.setFont(FONT_NAME, max(8, 18 * scale))
        pdf.drawCentredString(x + w / 2, y + h / 2, "QR")
    elif element_type == "watermark":
        paragraph_style = _visual_paragraph_style("VisualWatermark", style, scale, 24)
        _draw_paragraph_box(pdf, _visual_resolve_text(element.get("text"), data), x, y, w, h, paragraph_style)
    elif element_type == "headerBlock":
        paragraph_style = _visual_paragraph_style("VisualHeader", style, scale, 14)
        title = _visual_resolve_text(element.get("title"), data)
        subtitle = _visual_resolve_text(element.get("subtitle"), data)
        _draw_paragraph_box(pdf, f"{title}\n{subtitle}".strip(), x, y, w, h, paragraph_style)
    elif element_type == "footerBlock":
        paragraph_style = _visual_paragraph_style("VisualFooter", style, scale, 10)
        _draw_paragraph_box(pdf, _visual_resolve_text(element.get("text"), data), x, y, w, h, paragraph_style)
    pdf.restoreState()


def _hub_visual_schema(template: HubTemplate) -> dict | None:
    schema = template.schema_json if isinstance(template.schema_json, dict) else {}
    visual = schema.get("visualTemplateSet")
    if isinstance(visual, dict) and isinstance(visual.get("pages"), list):
        return visual
    return None


def _draw_visual_page_background(pdf: canvas.Canvas, background: dict, width: float, height: float) -> None:
    bg = _visual_color(background.get("color"), colors.white) or colors.white
    pdf.setFillColor(bg)
    pdf.rect(0, 0, width, height, stroke=0, fill=1)

    image_url = background.get("imageUrl")
    reader = _canvas_image_reader(str(image_url)) if image_url else None
    if not reader:
        return

    opacity = max(0, min(_visual_num(background.get("opacity"), 1), 1))
    pdf.saveState()
    try:
        pdf.setFillAlpha(opacity)
        pdf.setStrokeAlpha(opacity)
    except Exception:
        pass
    pdf.drawImage(reader, 0, 0, width, height, preserveAspectRatio=False, mask="auto")
    pdf.restoreState()


def _generate_hub_template_reportlab_pdf(template: HubTemplate, problems: list[Problem], export_values: dict) -> BytesIO:
    visual = _hub_visual_schema(template)
    if not visual:
        raise ValueError("Hub template does not contain a visual template set.")
    register_korean_font()
    export_pages = build_visual_template_export_pages(visual, problems, export_values)
    buffer = BytesIO()
    pdf: canvas.Canvas | None = None

    for page_index, export_page in enumerate(export_pages):
        page = export_page["page"]
        page_size = page.get("pageSize") if isinstance(page.get("pageSize"), dict) else visual.get("defaultPageSize") or {}
        width_px = _visual_num(page_size.get("width"), 794)
        height_px = _visual_num(page_size.get("height"), 1123)
        width_pt = width_px * VISUAL_PX_TO_PT
        height_pt = height_px * VISUAL_PX_TO_PT
        if pdf is None:
            pdf = canvas.Canvas(buffer, pagesize=(width_pt, height_pt))
        elif page_index:
            pdf.showPage()
            pdf.setPageSize((width_pt, height_pt))

        background = page.get("background") if isinstance(page.get("background"), dict) else {}
        _draw_visual_page_background(pdf, background, width_pt, height_pt)

        elements = sorted([item for item in page.get("elements", []) if isinstance(item, dict)], key=lambda item: _visual_num(item.get("zIndex"), 0))
        for element in elements:
            _draw_visual_element(pdf, element, export_page["placements"], export_page["data"], VISUAL_PX_TO_PT, height_pt)

    if pdf is None:
        pdf = canvas.Canvas(buffer, pagesize=A4)
        pdf.drawString(40, 800, "No template pages")
    pdf.save()
    buffer.seek(0)
    return buffer


def generate_hub_template_pdf(template: HubTemplate, problems: list[Problem], export_values: dict) -> BytesIO:
    visual = _hub_visual_schema(template)
    if not visual:
        raise ValueError("Hub template does not contain a visual template set.")
    html_doc = render_hub_template_for_export(template, problems, export_values)
    return _render_html_pdf_with_chrome(html_doc)


def generate_hub_context_pdf(template: HubTemplate, export_values: dict) -> BytesIO:
    visual = _hub_visual_schema(template)
    if not visual:
        raise ValueError("Hub template does not contain a visual template set.")
    html_doc = render_hub_template_for_context(template, export_values)
    return _render_html_pdf_with_chrome(html_doc)


def _canvas_preview_pages(canvas_json: dict) -> list[dict]:
    pages = canvas_json.get("pages")
    if isinstance(pages, list) and pages:
        normalized = []
        for page in pages:
            if not isinstance(page, dict):
                continue
            normalized.append({
                "page": page.get("page") or canvas_json.get("page", {}),
                "elements": page.get("elements") if isinstance(page.get("elements"), list) else [],
            })
        if normalized:
            return normalized
    return [{"page": canvas_json.get("page", {}), "elements": canvas_json.get("elements", [])}]


def generate_canvas_preview_pdf(canvas_json: dict) -> BytesIO:
    register_korean_font()
    page_docs = _canvas_preview_pages(canvas_json)
    first_page = page_docs[0].get("page", {})
    first_page_size = landscape(A4) if first_page.get("orientation", "portrait") == "landscape" else A4
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=first_page_size)

    for index, page_doc in enumerate(page_docs):
        page = page_doc.get("page", {})
        orientation = page.get("orientation", "portrait")
        page_size = landscape(A4) if orientation == "landscape" else A4
        if index:
            pdf.setPageSize(page_size)
        width_pt, height_pt = page_size
        doc_width = float(page.get("width", 794))
        doc_height = float(page.get("height", 1123))
        scale = min(width_pt / doc_width, height_pt / doc_height)

        bg = _canvas_color(page.get("backgroundColor", "#ffffff"), colors.white)
        if bg:
            pdf.setFillColor(bg)
            pdf.rect(0, 0, width_pt, height_pt, stroke=0, fill=1)

        elements = sorted(page_doc.get("elements", []), key=lambda element: element.get("zIndex", 0))
        for element in elements:
            if element.get("visible", True) is False:
                continue
            x = float(element.get("x", 0)) * scale
            y_top = float(element.get("y", 0)) * scale
            w = float(element.get("width", 120)) * scale
            h = float(element.get("height", 40)) * scale
            y = height_pt - y_top - h
            opacity = max(0, min(float(element.get("opacity", 1)), 1))
            pdf.saveState()
            try:
                pdf.setFillAlpha(opacity)
                pdf.setStrokeAlpha(opacity)
            except Exception:
                pass

            rotation = float(element.get("rotation", 0))
            if rotation:
                pdf.translate(x + w / 2, y + h / 2)
                pdf.rotate(-rotation)
                x, y = -w / 2, -h / 2

            fill = _canvas_color(element.get("fill") or element.get("backgroundColor"))
            stroke = _canvas_color(element.get("stroke"), colors.black)
            stroke_width = float(element.get("strokeWidth", 0)) * scale
            kind = element.get("type")

            if kind in {"rect", "box", "content_box", "question_area", "solution_area", "answer_table"}:
                if fill:
                    pdf.setFillColor(fill)
                if stroke and stroke_width > 0:
                    pdf.setStrokeColor(stroke)
                    pdf.setLineWidth(stroke_width)
                radius = float(element.get("radius", element.get("borderRadius", 0))) * scale
                if radius:
                    pdf.roundRect(x, y, w, h, radius, stroke=1 if stroke_width > 0 else 0, fill=1 if fill else 0)
                else:
                    pdf.rect(x, y, w, h, stroke=1 if stroke_width > 0 else 0, fill=1 if fill else 0)
                if kind in {"question_area", "solution_area", "answer_table"}:
                    label = {"question_area": "문항 영역", "solution_area": "답안 영역", "answer_table": "답안표 영역"}[kind]
                    pdf.setFillColor(colors.HexColor("#6b7280"))
                    pdf.setFont(FONT_NAME, max(8, float(element.get("fontSize", 12)) * scale))
                    pdf.drawCentredString(x + w / 2, y + h / 2, label)
            elif kind in {"circle", "ellipse"}:
                if fill:
                    pdf.setFillColor(fill)
                if stroke and stroke_width > 0:
                    pdf.setStrokeColor(stroke)
                    pdf.setLineWidth(stroke_width)
                pdf.ellipse(x, y, x + w, y + h, stroke=1 if stroke_width > 0 else 0, fill=1 if fill else 0)
            elif kind in {"line", "divider"}:
                pdf.setStrokeColor(stroke or colors.black)
                pdf.setLineWidth(max(1, float(element.get("strokeWidth", element.get("thickness", 1))) * scale))
                if element.get("dash") or element.get("strokeStyle") == "dashed":
                    pdf.setDash(4 * scale, 3 * scale)
                pdf.line(x, y + h / 2, x + w, y + h / 2)
            elif kind in {"image", "logo"}:
                reader = _canvas_image_reader(element.get("src"))
                if reader:
                    pdf.drawImage(reader, x, y, w, h, preserveAspectRatio=element.get("objectFit") != "fill", mask="auto")
                elif stroke:
                    pdf.setStrokeColor(stroke)
                    pdf.rect(x, y, w, h)
            else:
                text = element.get("previewValue") or element.get("text") or element.get("name") or ""
                color = _canvas_color(element.get("color") or element.get("fill"), colors.black) or colors.black
                font_size = max(4, float(element.get("fontSize", 14)) * scale)
                pdf.setFillColor(color)
                pdf.setFont(FONT_NAME, font_size)
                lines = str(text).splitlines() or [""]
                line_height = font_size * float(element.get("lineHeight", 1.25))
                current_y = y + h - line_height
                for line in lines[: max(1, int(h / max(line_height, 1)))]:
                    pdf.drawString(x, current_y, line)
                    current_y -= line_height
            pdf.restoreState()

        pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer
