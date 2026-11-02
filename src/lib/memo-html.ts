const allowedTags = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "u",
  "ul",
]);

const escapeAttr = (value: string): string =>
  value
    .replaceAll(/&amp;/giu, "&")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const decodeHref = (value: string): string =>
  value
    .replaceAll(/&#x([0-9a-f]+);?/giu, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replaceAll(/&#([0-9]+);?/gu, (_, num: string) => {
      const code = Number.parseInt(num, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replaceAll(/&colon;/giu, ":")
    .replaceAll(/&tab;|&newline;/giu, "");

const withoutControls = (value: string): string => {
  let next = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 32) {
      next += char;
    }
  }
  return next;
};

const safeHref = (raw: string): string | null => {
  const decoded = withoutControls(decodeHref(raw));
  if (/^(https?:|mailto:)/iu.test(decoded)) {
    return escapeAttr(decoded);
  }
  if (decoded.startsWith("/") || decoded.startsWith("#")) {
    return escapeAttr(decoded);
  }
  return null;
};

const hrefOf = (rest: string): string | null => {
  const match = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/iu.exec(rest);
  if (match === null) {
    return null;
  }
  return safeHref(match[1] ?? match[2] ?? match[3] ?? "");
};

export const sanitizeMemo = (html: string): string =>
  html
    .replaceAll(/<script[\s\S]*?<\/script>/giu, "")
    .replaceAll(/<\/?([a-z0-9]+)([^>]*)>/giu, (full, name: string, rest: string) => {
      const tag = name.toLowerCase();
      if (!allowedTags.has(tag)) {
        return "";
      }
      if (full.startsWith("</")) {
        return `</${tag}>`;
      }
      if (tag === "br") {
        return "<br>";
      }
      if (tag !== "a") {
        return `<${tag}>`;
      }
      const href = hrefOf(rest);
      return href === null ? "<a>" : `<a href="${href}">`;
    });
