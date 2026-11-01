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

const renderInline = (source: string, keyPrefix: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/gu;
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push(source.slice(cursor, index));
    }
    if (match[1] !== undefined && match[2] !== undefined) {
      nodes.push(
        <Anchor key={`${keyPrefix}-${index}`} href={match[2]} target="_blank" rel="noreferrer">
          {match[1]}
        </Anchor>,
      );
    } else if (match[3] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-${index}`}>{match[3]}</strong>);
    } else if (match[4] !== undefined) {
      nodes.push(<em key={`${keyPrefix}-${index}`}>{match[4]}</em>);
    } else if (match[5] !== undefined) {
      nodes.push(<Code key={`${keyPrefix}-${index}`}>{match[5]}</Code>);
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
      return <Text mt="sm">{renderInline(block.text, block.key)}</Text>;
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
