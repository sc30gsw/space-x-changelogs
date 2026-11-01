import { AppShell, Box, Burger, Button, Group, Text, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { spotlight } from "@mantine/spotlight";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { Entry, Track } from "../types/schemas";
import { useWorkspace } from "../stores/workspace";
import { SearchSpotlight } from "../features/search/components/search-spotlight";

const unreadCount = (
  entries: ReadonlyArray<Pick<Entry, "trackId" | "caughtUp">>,
  trackId: Entry["trackId"],
): number => {
  let count = 0;
  for (const entry of entries) {
    if (entry.trackId === trackId && !entry.caughtUp) {
      count += 1;
    }
  }
  return count;
};

function TrackLink({
  track,
  unread,
  current,
  onNavigate,
}: {
  readonly track: Pick<Track, "id" | "name" | "slug">;
  readonly unread: number;
  readonly current: boolean;
  readonly onNavigate: () => void;
}) {
  return (
    <Link
      to="/tracks/$slug"
      params={{ slug: track.slug }}
      className="log-link"
      aria-current={current ? "page" : undefined}
      aria-label={unread > 0 ? `${track.name} ${unread} Unread` : track.name}
      onClick={onNavigate}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 12,
        padding: "9px 12px",
        color: current ? "#16191d" : "#3d434b",
        fontWeight: current ? 600 : 400,
        borderLeft: current ? "2px solid #16191d" : "2px solid transparent",
      }}
    >
      <span>{track.name}</span>
      {unread > 0 ? (
        <Text span size="sm" fw={600} aria-hidden="true">
          {unread}
        </Text>
      ) : null}
    </Link>
  );
}

export function Frame({ children }: { readonly children: ReactNode }) {
  const [opened, { toggle }] = useDisclosure();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { tracks, entries, isLoading, isError } = useWorkspace();
  const closeOnNavigate = () => {
    if (opened) {
      toggle();
    }
  };

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 232, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="xl"
      styles={{
        header: { background: "#fbfbfc", borderBottom: "1px solid #e6e7ea" },
        navbar: { background: "#fbfbfc", borderRight: "1px solid #e6e7ea" },
        main: { background: "#fbfbfc", color: "#16191d", minHeight: "100%" },
      }}
    >
      <AppShell.Header>
        <Group h="100%" px="lg" justify="space-between">
          <Group gap="sm">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              aria-label="ナビゲーション"
            />
            <Title order={2} size="h4" fw={600}>
              SpaceX changelogs
            </Title>
          </Group>
          <Button type="button" variant="default" size="compact-sm" onClick={spotlight.open}>
            検索
          </Button>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="sm">
        <Text size="sm" c="dimmed" px="xs" mb="xs">
          Track
        </Text>
        {tracks.map((track) => (
          <TrackLink
            key={track.id}
            track={track}
            unread={unreadCount(entries, track.id)}
            current={pathname === `/tracks/${track.slug}`}
            onNavigate={closeOnNavigate}
          />
        ))}
        <Box mt="md" pt="sm" style={{ borderTop: "1px solid #e6e7ea" }}>
          <Link
            to="/manage"
            className="log-link"
            aria-current={pathname === "/manage" ? "page" : undefined}
            onClick={closeOnNavigate}
            style={{
              display: "block",
              padding: "9px 12px",
              color: pathname === "/manage" ? "#16191d" : "#3d434b",
              fontWeight: pathname === "/manage" ? 600 : 400,
            }}
          >
            Track 管理
          </Link>
        </Box>
        {isLoading ? (
          <Text size="sm" c="dimmed" mt="md" px="xs">
            読み込み中
          </Text>
        ) : null}
        {isError ? (
          <Text size="sm" c="red" mt="md" px="xs" role="alert">
            読み込めませんでした
          </Text>
        ) : null}
      </AppShell.Navbar>
      <AppShell.Main>
        <Box maw={680} w="100%" mx="auto">
          {children}
        </Box>
      </AppShell.Main>
      <SearchSpotlight />
    </AppShell>
  );
}
