import * as stylex from "@stylexjs/stylex";
import { Anchor, Container, Stack, Title } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { mantine } from "../styles/tokens.stylex";

const styles = stylex.create({
  panel: {
    backgroundColor: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))",
    borderRadius: mantine.radius,
    color: mantine.text,
    padding: mantine.spacing,
  },
});

export function Shell({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <Container size="sm" py="xl">
      <Stack {...stylex.props(styles.panel)}>
        <Anchor component={Link} to="/">
          SpaceX changelogs
        </Anchor>
        <Title order={2}>{title}</Title>
        {children}
      </Stack>
    </Container>
  );
}
