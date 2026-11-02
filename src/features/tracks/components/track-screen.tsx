import { Anchor, Box, Button, Checkbox, Group, Select, Stack, Text, Title } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { catchUp, ingestEntry } from "../../../stores/changelog";
import { useWorkspace } from "../../../stores/workspace";
import type { EntryFormValues } from "../../../types/schemas";
import { entryKinds, entryMatchesKind, isKindFilter, type KindFilter } from "../../../utils/kinds";
import { formatJst, instantFromJstLocal } from "../../../utils/time";
import { EntryForm } from "../../entries/components/entry-form";

const kindFilterOptions = [
  { value: "all", label: "すべて" },
  ...entryKinds.map((kind) => ({ value: kind, label: kind })),
];

export function TrackScreen({ slug }: { readonly slug: string }) {
  const { tracks, sources, entries, isLoading } = useWorkspace();
  const track = tracks.find((item) => item.slug === slug);
  const [kind, setKind] = useState<KindFilter>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (track === undefined && isLoading) {
    return <Text>読み込み中</Text>;
  }

  if (track === undefined) {
    return (
      <Stack>
        <Title order={1}>Track</Title>
        <Text>この Track はありません。</Text>
        <Link to="/manage">Track 管理</Link>
      </Stack>
    );
  }

  const trackSources = sources
    .filter((source) => source.trackId === track.id)
    .toSorted((left, right) => left.position - right.position || left.id.localeCompare(right.id));
  const trackEntries = entries
    .filter((entry) => entry.trackId === track.id)
    .filter((entry) => entryMatchesKind(kind, entry.kind))
    .filter((entry) => (unreadOnly ? !entry.caughtUp : true))
    .toSorted(
      (left, right) =>
        right.publishedAt.localeCompare(left.publishedAt) || right.id.localeCompare(left.id),
    );
  const unreadIds = entries
    .filter((entry) => entry.trackId === track.id && !entry.caughtUp)
    .map((entry) => entry.id);

  const markCaughtUp = async (id: string, caughtUp: boolean) => {
    await catchUp([{ id, caughtUp }]);
  };

  const markAllCaughtUp = async () => {
    if (unreadIds.length === 0) {
      return;
    }
    await catchUp(unreadIds.map((id) => ({ id, caughtUp: true })));
  };

  const addEntry = async (values: EntryFormValues) => {
    const saved = await ingestEntry({
      trackId: values.trackId,
      kind: values.kind,
      title: values.title,
      url: values.url,
      publishedAt: instantFromJstLocal(values.publishedAt),
      summary: values.summary,
      body: values.body,
    });
    setMessage(saved.title);
  };

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Title order={1}>{track.name}</Title>
        <Button
          type="button"
          variant="default"
          onClick={() => void markAllCaughtUp()}
          disabled={unreadIds.length === 0}
        >
          全部 Caught up にする
        </Button>
      </Group>
      <Group gap="lg" aria-label="Source">
        {trackSources.map((source) => (
          <Anchor key={source.id} href={source.url} target="_blank" rel="noreferrer" c="ink.8">
            {source.label}
          </Anchor>
        ))}
      </Group>
      <Group align="flex-end" wrap="wrap">
        <Select
          label="種類で絞り込み"
          data={kindFilterOptions}
          value={kind}
          allowDeselect={false}
          onChange={(value) => {
            if (value !== null && isKindFilter(value)) {
              setKind(value);
            }
          }}
        />
        <Checkbox
          mb={8}
          label="Unread"
          checked={unreadOnly}
          onChange={(event) => {
            setUnreadOnly(event.currentTarget.checked);
          }}
        />
      </Group>
      <Stack
        component="ul"
        gap={0}
        aria-label="Entry"
        style={{ listStyle: "none", margin: 0, padding: 0 }}
      >
        {trackEntries.map((entry) => (
          <Box key={entry.id} component="li" py="lg" style={{ borderTop: "1px solid #e6e7ea" }}>
            <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
              <Stack gap={8} style={{ flex: "1 1 16rem" }}>
                <Group gap="sm" align="center">
                  {entry.caughtUp ? null : (
                    <Box aria-hidden w={7} h={7} bg="ink.8" style={{ borderRadius: 1 }} />
                  )}
                  <Text size="sm" c="dimmed">
                    {formatJst(entry.publishedAt)}
                  </Text>
                  <Text size="sm">{entry.kind}</Text>
                  <Text size="sm" fw={entry.caughtUp ? 400 : 600}>
                    {entry.caughtUp ? "Caught up" : "Unread"}
                  </Text>
                </Group>
                <Title order={2}>
                  <Link className="log-link" to="/entries/$entryId" params={{ entryId: entry.id }}>
                    {entry.title}
                  </Link>
                </Title>
                <Text lh={1.7}>{entry.summary}</Text>
              </Stack>
              <Checkbox
                label="Caught up"
                aria-label={`Caught up ${entry.title}`}
                checked={entry.caughtUp}
                onChange={(event) => {
                  void markCaughtUp(entry.id, event.currentTarget.checked);
                }}
              />
            </Group>
          </Box>
        ))}
      </Stack>
      {trackEntries.length === 0 ? <Text>この絞り込みに Entry はありません。</Text> : null}
      <section aria-label="Entry を追加" style={{ borderTop: "1px solid #e6e7ea", paddingTop: 28 }}>
        <Title order={2} size="h3" mb="sm">
          Entry を追加
        </Title>
        <EntryForm initial={{ trackId: track.id }} submitLabel="Entry を追加" onSubmit={addEntry} />
        {message !== null ? (
          <Text role="status" mt="sm">
            {message}
          </Text>
        ) : null}
      </section>
    </Stack>
  );
}
