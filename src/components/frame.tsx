import * as stylex from "@stylexjs/stylex";
import { AppShell, Badge, Burger, Group, Text, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { spotlight } from "@mantine/spotlight";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { mantine } from "../styles/tokens.stylex.ts";
import { useWorkspace } from "../stores/workspace";
import { SearchSpotlight } from "../features/search/components/search-spotlight";

const styles = stylex.create({
  main: {
    backgroundColor: "light-dark(#f6f1e8, var(--mantine-color-dark-8))",
    color: mantine.text,
    minHeight: "100%",
  },
});

const unreadCount = (
  entries: ReadonlyArray<{ readonly trackId: string; readonly caughtUp: boolean }>,
  trackId: string,
): number => {
  let count = 0;
  for (const entry of entries) {
    if (entry.trackId === trackId && !entry.caughtUp) {
      count += 1;
    }
  }
  return count;
};

export function Frame({ children }: { readonly children: ReactNode }) {
  const [opened, { toggle }] = useDisclosure();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { tracks, entries, isLoading, isError } = useWorkspace();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 260, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              aria-label="ナビゲーション"
            />
            <Title order={2} size="h4">
              SpaceX changelogs
            </Title>
          </Group>
          <button type="button" onClick={spotlight.open}>
            検索
          </button>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="sm">
        <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb="xs">
          Track
        </Text>
        {tracks.map((track) => {
          const unread = unreadCount(entries, track.id);
          const href = `/tracks/${track.slug}`;
          return (
            <Link
              key={track.id}
              to="/tracks/$slug"
              params={{ slug: track.slug }}
              aria-current={pathname === href ? "page" : undefined}
              aria-label={unread > 0 ? `${track.name} ${unread} Unread` : track.name}
              onClick={() => {
                if (opened) {
                  toggle();
                }
              }}
            >
              <Group justify="space-between" gap="xs">
                <span>{track.name}</span>
                {unread > 0 ? (
                  <Badge color="orange" variant="filled" aria-hidden="true">
                    {unread}
                  </Badge>
                ) : null}
              </Group>
            </Link>
          );
        })}
        <Link to="/manage" aria-current={pathname === "/manage" ? "page" : undefined}>
          Track 管理
        </Link>
        {isLoading ? (
          <Text size="sm" c="dimmed" mt="md">
            読み込み中
          </Text>
        ) : null}
        {isError ? (
          <Text size="sm" c="red" mt="md" role="alert">
            読み込めませんでした
          </Text>
        ) : null}
      </AppShell.Navbar>
      <AppShell.Main {...stylex.props(styles.main)}>{children}</AppShell.Main>
      <SearchSpotlight />
    </AppShell>
  );
}
