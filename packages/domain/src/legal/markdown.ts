/**
 * 약관 본문(`legal_document.body`)의 작은 마크다운. HTML 로 바꾸지 않고 블록 목록으로 읽어 React 가
 * 텍스트로 그린다 — 본문에 HTML 이 있어도 글자로 보일 뿐 실행되지 않는다.
 *
 * - `## 제목` — 조항 제목
 * - 빈 줄로 나눈 문단 (여러 줄이면 공백으로 잇는다)
 * - `- 항목` — 목록
 * - `[글자](주소)` — `https:`, `mailto:`, 같은 사이트(`/…`) 주소만 링크, 그 밖은 글자 그대로
 */

export type LegalInline =
  | { type: "text"; text: string }
  | { type: "link"; text: string; href: string };

export type LegalBlock =
  | { type: "heading"; content: LegalInline[] }
  | { type: "paragraph"; content: LegalInline[] }
  | { type: "list"; items: LegalInline[][] };

const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const HEADING = /^##\s+/;
const LIST_ITEM = /^-\s+/;

export function isAllowedHref(href: string): boolean {
  if (href.startsWith("/")) return !href.startsWith("//");
  return href.startsWith("https://") || href.startsWith("mailto:");
}

function parseInline(text: string): LegalInline[] {
  const content: LegalInline[] = [];
  let plain = "";
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const [whole, label = "", href = ""] = match;
    plain += text.slice(last, match.index);
    last = match.index + whole.length;
    if (!isAllowedHref(href)) {
      plain += whole;
      continue;
    }
    if (plain) content.push({ type: "text", text: plain });
    plain = "";
    content.push({ type: "link", text: label, href });
  }
  plain += text.slice(last);
  if (plain) content.push({ type: "text", text: plain });
  return content;
}

export function parseLegalMarkdown(source: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", content: parseInline(paragraph.join(" ")) });
    }
    if (list.length > 0) blocks.push({ type: "list", items: list.map(parseInline) });
    paragraph = [];
    list = [];
  };

  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line === "") {
      flush();
    } else if (HEADING.test(line)) {
      flush();
      blocks.push({ type: "heading", content: parseInline(line.replace(HEADING, "")) });
    } else if (LIST_ITEM.test(line)) {
      if (paragraph.length > 0) flush();
      list.push(line.replace(LIST_ITEM, ""));
    } else {
      if (list.length > 0) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

const HTML_TAG = /<\/?[a-zA-Z][^>]*>/g;
const UNSUPPORTED_LINE = [/^#(?!#\s)/, /^###/, /^\d+\.\s/, /^>/, /^\*\s/, /^```/];
const UNSUPPORTED_INLINE = [/\*\*[^*]+\*\*/, /`[^`]+`/];

/**
 * 공개 전에 본문을 검사한다. 그릴 수 없거나 그리지 않을 문법(HTML·막힌 링크·지원하지 않는 마크다운)을
 * 찾아 사람이 읽을 문장으로 돌려준다. 비어 있으면 문제 없음.
 */
export function findMarkdownProblems(source: string): string[] {
  if (source.trim() === "") return ["본문이 비어 있어요"];
  const problems: string[] = [];
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    for (const [tag] of line.matchAll(HTML_TAG)) problems.push(`HTML 은 쓸 수 없어요: ${tag}`);
    for (const match of line.matchAll(LINK)) {
      const href = match[2] ?? "";
      if (!isAllowedHref(href)) problems.push(`허용하지 않는 링크예요: ${href}`);
    }
    const body = line.replace(HEADING, "").replace(LIST_ITEM, "");
    if (
      UNSUPPORTED_LINE.some((pattern) => pattern.test(line)) ||
      UNSUPPORTED_INLINE.some((pattern) => pattern.test(body))
    ) {
      problems.push(`지원하지 않는 문법이에요: ${line}`);
    }
  }
  return problems;
}
