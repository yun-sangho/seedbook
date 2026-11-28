import { describe, expect, it } from "vitest";
import { findMarkdownProblems, parseLegalMarkdown } from "./markdown";

describe("parseLegalMarkdown", () => {
  it("reads headings, paragraphs and lists", () => {
    const blocks = parseLegalMarkdown("## 1. 목적\n\n첫 문단\n\n- 하나\n- 둘\n");

    expect(blocks).toEqual([
      { type: "heading", content: [{ type: "text", text: "1. 목적" }] },
      { type: "paragraph", content: [{ type: "text", text: "첫 문단" }] },
      {
        type: "list",
        items: [[{ type: "text", text: "하나" }], [{ type: "text", text: "둘" }]],
      },
    ]);
  });

  it("joins the lines of one paragraph with a space", () => {
    expect(parseLegalMarkdown("앞 줄\n뒷 줄")).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "앞 줄 뒷 줄" }] },
    ]);
  });

  it("ends a list at a blank line", () => {
    expect(parseLegalMarkdown("- 항목\n\n문단").map((block) => block.type)).toEqual([
      "list",
      "paragraph",
    ]);
  });

  it("reads https, mailto and same-site links", () => {
    const [block] = parseLegalMarkdown(
      "[문의](mailto:a@b.c) [KISA](https://privacy.kisa.or.kr) [약관](/terms)"
    );

    expect(block).toEqual({
      type: "paragraph",
      content: [
        { type: "link", text: "문의", href: "mailto:a@b.c" },
        { type: "text", text: " " },
        { type: "link", text: "KISA", href: "https://privacy.kisa.or.kr" },
        { type: "text", text: " " },
        { type: "link", text: "약관", href: "/terms" },
      ],
    });
  });

  it.each([
    ["javascript", "[x](javascript:alert(1))"],
    ["data", "[x](data:text/html,hi)"],
    ["protocol-relative", "[x](//evil.example)"],
    ["plain http", "[x](http://example.com)"],
  ])("keeps a %s link as plain text", (_, source) => {
    expect(parseLegalMarkdown(source)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: source }] },
    ]);
  });

  it("keeps HTML as plain text", () => {
    expect(parseLegalMarkdown("<script>alert(1)</script>")).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script>" }] },
    ]);
  });
});

describe("findMarkdownProblems", () => {
  it("accepts the supported syntax", () => {
    expect(findMarkdownProblems("## 제목\n\n문단 [메일](mailto:a@b.c)\n\n- 항목")).toEqual([]);
  });

  it("rejects an empty body", () => {
    expect(findMarkdownProblems("  \n")).toEqual(["본문이 비어 있어요"]);
  });

  it("rejects HTML tags", () => {
    expect(findMarkdownProblems("문단 <b>굵게</b>")).toEqual([
      "HTML 은 쓸 수 없어요: <b>",
      "HTML 은 쓸 수 없어요: </b>",
    ]);
  });

  it("rejects a link it would not render", () => {
    expect(findMarkdownProblems("[x](javascript:void)")).toEqual([
      "허용하지 않는 링크예요: javascript:void",
    ]);
  });

  it("rejects markdown it does not support", () => {
    expect(findMarkdownProblems("# 큰 제목\n\n**굵게**\n\n1. 번호")).toEqual([
      "지원하지 않는 문법이에요: # 큰 제목",
      "지원하지 않는 문법이에요: **굵게**",
      "지원하지 않는 문법이에요: 1. 번호",
    ]);
  });
});
