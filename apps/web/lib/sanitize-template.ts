const blockedTags = /<\/?(script|iframe|object|embed)\b[^>]*>/gi;
const externalImports = /<link\b(?=[^>]*rel=["']?import["']?)[^>]*>/gi;
const eventHandlers = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const javascriptUrls = /(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi;

export function sanitizeTemplateHtml(html: string) {
  return html
    .replace(blockedTags, "")
    .replace(externalImports, "")
    .replace(eventHandlers, "")
    .replace(javascriptUrls, "$1=\"#\"");
}

export function sanitizeTemplateCss(css = "") {
  return css.replace(/@import[^;]+;/gi, "").replace(/url\(\s*javascript:[^)]+\)/gi, "url(#)");
}
