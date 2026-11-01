import * as stylex from "@stylexjs/stylex";
import { Button, Group, Text } from "@mantine/core";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Shell } from "../components/shell";

const styles = stylex.create({
  action: {
    "--button-bg": "var(--mantine-color-pink-filled)",
    "--button-hover": "var(--mantine-color-pink-filled-hover)",
  },
});

export const Route = createFileRoute("/")({
  // The home shell is content the document should contain on first paint.
  ssr: true,
  component: Home,
});

function Home() {
  return (
    <Shell title="Development shell">
      <Text>TanStack Start scaffold with Mantine, StyleX, and a small Effect API.</Text>
      <Group>
        <Button component={Link} to="/launches" {...stylex.props(styles.action)}>
          Launches
        </Button>
        <Button component={Link} to="/feedback" variant="default">
          Feedback
        </Button>
      </Group>
    </Shell>
  );
}
