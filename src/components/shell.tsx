import * as stylex from "@stylexjs/stylex";
import { Container, Stack, Title } from "@mantine/core";
import { mantine } from "../styles/tokens.stylex";

const styles = stylex.create({
  panel: {
    backgroundColor: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))",
    borderRadius: mantine.radius,
    color: mantine.text,
    padding: mantine.spacing,
  },
});

export function Shell() {
  return (
    <Container size="sm" py="xl">
      <Stack {...stylex.props(styles.panel)}>
        <Title order={1}>SpaceX changelogs</Title>
      </Stack>
    </Container>
  );
}
