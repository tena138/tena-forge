def render_pdf_bytes(html: str) -> bytes:
    try:
        from weasyprint import HTML
        return HTML(string=html).write_pdf()
    except Exception:
        # Development fallback: store HTML bytes when native PDF dependencies are not installed.
        return html.encode("utf-8")
