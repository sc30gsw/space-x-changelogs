import { Anchor, Code, List, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

const headingMarks = ["#", "##", "###"] as const;

type HeadingMarks = (typeof headingMarks)[number];

type MarkdownBlock =
  | {
      readonly kind: "heading";
      readonly key: string;
      readonly order: 2 | 3 | 4;
      readonly text: string;
    }
  | {
      readonly kind: "list";
      readonly key: string;
      readonly items: readonly { readonly key: string; readonly text: string }[];
    }
  | { readonly kind: "code"; readonly key: string; readonly text: string }
  | { readonly kind: "paragraph"; readonly key: string; readonly text: string };

type InlineSpan =
  | { readonly kind: "link"; readonly label: string; readonly href: string }
  | { readonly kind: "strong"; readonly text: string }
  | { readonly kind: "emphasis"; readonly text: string }
  | { readonly kind: "code"; readonly text: string };

const inlineSpan = (match: RegExpMatchArray): InlineSpan | undefined => {
  const label = match[1];
  const href = match[2];
  const strong = match[3];
  const emphasis = match[4];
  const code = match[5];
  if (label !== undefined && href !== undefined) {
    return { kind: "link", label, href };
  }
  if (strong !== undefined) {
    return { kind: "strong", text: strong };
  }
  if (emphasis !== undefined) {
    return { kind: "emphasis", text: emphasis };
  }
  if (code !== undefined) {
    return { kind: "code", text: code };
  }
  return undefined;
};

const inlineNode = (span: InlineSpan, key: string): ReactNode => {
  switch (span.kind) {
    case "link":
      return (
        <Anchor key={key} href={span.href} target="_blank" rel="noreferrer">
          {span.label}
        </Anchor>
      );
    case "strong":
      return <strong key={key}>{span.text}</strong>;
    case "emphasis":
      return <em key={key}>{span.text}</em>;
    case "code":
      return <Code key={key}>{span.text}</Code>;
    default: {
      const unreachable: never = span;
      return unreachable;
    }
  }
};

const renderInline = (source: string, keyPrefix: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/gu;
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push(source.slice(cursor, index));
    }
    const span = inlineSpan(match);
    if (span !== undefined) {
      nodes.push(inlineNode(span, `${keyPrefix}-${index}`));
    }
    cursor = index + match[0].length;
  }
  if (cursor < source.length) {
    nodes.push(source.slice(cursor));
  }
  return nodes;
};

const isHeadingMarks = (value: string): value is HeadingMarks =>
  headingMarks.some((marks) => marks === value);

const headingOrder = (marks: HeadingMarks): 2 | 3 | 4 => {
  switch (marks) {
    case "#":
      return 2;
    case "##":
      return 3;
    case "###":
      return 4;
    default: {
      const unreachable: never = marks;
      return unreachable;
    }
  }
};

const nextKey = (seen: Map<string, number>, kind: string, text: string): string => {
  const label = `${kind}:${text}`;
  const count = seen.get(label) ?? 0;
  seen.set(label, count + 1);
  return `${label}:${count}`;
};

const parseBlocks = (text: string): readonly MarkdownBlock[] => {
  const seen = new Map<string, number>();
  return text
    .replaceAll("\r\n", "\n")
    .split(/\n{2,}/u)
    .flatMap((block): readonly MarkdownBlock[] => {
      const lines = block.split("\n");
      const heading = /^(#{1,3}) (.+)$/u.exec(lines[0] ?? "");
      if (heading !== null && lines.length === 1 && isHeadingMarks(heading[1] ?? "")) {
        const marks = heading[1] ?? "";
        if (!isHeadingMarks(marks)) {
          return [];
        }
        return [
          {
            kind: "heading",
            key: nextKey(seen, "heading", block),
            order: headingOrder(marks),
            text: heading[2] ?? "",
          },
        ];
      }
      if (lines.every((line) => line.startsWith("- "))) {
        const itemSeen = new Map<string, number>();
        return [
          {
            kind: "list",
            key: nextKey(seen, "list", block),
            items: lines.map((line) => {
              const item = line.slice(2);
              return { key: nextKey(itemSeen, "item", item), text: item };
            }),
          },
        ];
      }
      if (block.startsWith("```")) {
        return [
          {
            kind: "code",
            key: nextKey(seen, "code", block),
            text: block.replace(/^```[^\n]*\n?/u, "").replace(/```$/u, ""),
          },
        ];
      }
      return [
        {
          kind: "paragraph",
          key: nextKey(seen, "paragraph", block),
          text: block,
        },
      ];
    });
};

function MarkdownBlockView({ block }: { readonly block: MarkdownBlock }) {
  switch (block.kind) {
    case "heading":
      return (
        <Title order={block.order} mt="md">
          {renderInline(block.text, block.key)}
        </Title>
      );
    case "list":
      return (
        <List mt="sm">
          {block.items.map((item) => (
            <List.Item key={item.key}>{renderInline(item.text, item.key)}</List.Item>
          ))}
        </List>
      );
    case "code":
      return (
        <Code block mt="sm">
          {block.text}
        </Code>
      );
    case "paragraph":
      return (
        <Text mt="sm" lh={1.75}>
          {renderInline(block.text, block.key)}
        </Text>
      );
    default: {
      const unreachable: never = block;
      return unreachable;
    }
  }
}

export function MarkdownView({ text }: { readonly text: string }) {
  if (text.trim().length === 0) {
    return null;
  }

  return (
    <div>
      {parseBlocks(text).map((block) => (
        <MarkdownBlockView key={block.key} block={block} />
      ))}
    </div>
  );
}
