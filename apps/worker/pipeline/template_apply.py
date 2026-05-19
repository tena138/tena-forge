from jinja2 import Environment, BaseLoader, select_autoescape

from models.schemas import ExtractedItem


env = Environment(loader=BaseLoader(), autoescape=select_autoescape(["html", "xml"]))


def apply_template(template_html: str, template_css: str | None, items: list[ExtractedItem], variables: dict) -> str:
    item_payload = [item.model_dump() for item in items]
    rendered = env.from_string(template_html).render(items=item_payload, **variables)
    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <style>{template_css or ""}</style>
</head>
<body>{rendered}</body>
</html>"""
