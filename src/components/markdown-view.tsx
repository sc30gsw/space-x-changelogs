import { Anchor, Code, List, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

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

export function MarkdownView({ text }: { readonly text: string }) {
  if (text.trim().length === 0) {
    return null;
  }

  const blocks = text.replaceAll("\r\n", "\n").split(/\n{2,}/u);
  return (
    <div>
      {blocks.map((block, index) => {
        const lines = block.split("\n");
        const heading = /^(#{1,3}) (.+)$/u.exec(lines[0] ?? "");
        if (heading !== null && lines.length === 1) {
          const level = heading[1]?.length ?? 1;
          const order = level === 1 ? 2 : level === 2 ? 3 : 4;
          return (
            <Title key={index} order={order} mt="md">
              {renderInline(heading[2] ?? "", `h-${index}`)}
            </Title>
          );
        }
        if (lines.every((line) => line.startsWith("- "))) {
          return (
            <List key={index} mt="sm">
              {lines.map((line, lineIndex) => (
                <List.Item key={lineIndex}>
                  {renderInline(line.slice(2), `li-${index}-${lineIndex}`)}
                </List.Item>
              ))}
            </List>
          );
        }
        if (block.startsWith("```")) {
          const code = block.replace(/^```[^\n]*\n?/u, "").replace(/```$/u, "");
          return (
            <Code key={index} block mt="sm">
              {code}
            </Code>
          );
        }
        return (
          <Text key={index} mt="sm">
            {renderInline(block, `p-${index}`)}
          </Text>
        );
      })}
    </div>
  );
}
