import { Text } from "@seed-design/react";
import { type LegalInline, parseLegalMarkdown } from "@seedbook/database/legal/markdown";

/**
 * 약관 본문을 그린다. 마크다운을 블록으로 읽어 React 요소로만 만든다 — `dangerouslySetInnerHTML`
 * 을 쓰지 않으므로 본문의 HTML 은 글자로 보이고, 링크는 허용한 주소(https·mailto·같은 사이트)만 된다.
 */
export function LegalMarkdown({ source }: { source: string }) {
  return (
    <div className="flex flex-col gap-x3">
      {parseLegalMarkdown(source).map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === "heading") {
          return (
            <Text key={key} as="h2" textStyle="t6Bold" color="fg.neutral" className="pt-x7">
              <Inline content={block.content} />
            </Text>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={key} className="list-disc flex flex-col gap-x1 pl-x5">
              {block.items.map((item, itemIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 본문은 바뀌지 않는 정적 목록이다.
                <li key={itemIndex}>
                  <Inline content={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={key}>
            <Inline content={block.content} />
          </p>
        );
      })}
    </div>
  );
}

function Inline({ content }: { content: LegalInline[] }) {
  return content.map((part, index) => {
    if (part.type === "text") return part.text;
    const external = part.href.startsWith("https://");
    return (
      <a
        // biome-ignore lint/suspicious/noArrayIndexKey: 본문은 바뀌지 않는 정적 목록이다.
        key={index}
        href={part.href}
        className="text-fg-neutral underline underline-offset-4"
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {part.text}
      </a>
    );
  });
}
