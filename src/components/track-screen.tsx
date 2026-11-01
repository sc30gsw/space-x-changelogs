import { Anchor, Button, Checkbox, Group, Select, Stack, Text, Title } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { submitEntryFn } from "../functions/records";
import { useWorkspace } from "../data/workspace";
import type { EntryFormValues } from "../data/schemas";
import { entryKinds, type EntryKind } from "../domain/kinds";
import { formatJst, instantFromJstLocal } from "../domain/time";
import { EntryForm } from "./entry-form";

const kindFilterOptions = [
  { value: "all", label: "すべて" },
  ...entryKinds.map((kind) => ({ value: kind, label: kind })),
];

export function TrackScreen({ slug }: { readonly slug: string }) {
  const { tracks, sources, entries, entriesCollection, isLoading } = useWorkspace();
  const track = tracks.find((item) => item.slug === slug);
  const [kind, setKind] = useState<"all" | EntryKind>("all");
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
    .filter((entry) => (kind === "all" ? true : entry.kind === kind))
    .filter((entry) => (unreadOnly ? !entry.caughtUp : true))
    .toSorted(
      (left, right) =>
        right.publishedAt.localeCompare(left.publishedAt) || right.id.localeCompare(left.id),
    );
  const unreadIds = entries
    .filter((entry) => entry.trackId === track.id && !entry.caughtUp)
    .map((entry) => entry.id);

  const catchUp = async (id: string, caughtUp: boolean) => {
    const transaction = entriesCollection.update(id, (draft) => {
      draft.caughtUp = caughtUp;
    });
    await transaction.when("settled");
  };

  const catchUpAll = async () => {
    if (unreadIds.length === 0) {
      return;
    }
    const transaction = entriesCollection.update(unreadIds, (drafts) => {
      for (const draft of drafts) {
        draft.caughtUp = true;
      }
    });
    await transaction.when("settled");
  };

  const addEntry = async (values: EntryFormValues) => {
    const saved = await submitEntryFn({
      data: {
        trackId: values.trackId,
        kind: values.kind,
        title: values.title,
        url: values.url,
        publishedAt: instantFromJstLocal(values.publishedAt),
        summary: values.summary,
        body: values.body,
      },
    });
    await entriesCollection.utils.writeUpsert(saved);
    setMessage(saved.title);
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Title order={1}>{track.name}</Title>
        <Button type="button" onClick={() => void catchUpAll()} disabled={unreadIds.length === 0}>
          全部 Caught up にする
        </Button>
      </Group>
      <Group gap="md" aria-label="Source">
        {trackSources.map((source) => (
          <Anchor key={source.id} href={source.url} target="_blank" rel="noreferrer">
            {source.label}
          </Anchor>
        ))}
      </Group>
      <Group>
        <Select
          label="種類で絞り込み"
          data={kindFilterOptions}
          value={kind}
          allowDeselect={false}
          onChange={(value) => {
            if (
              value === "all" ||
              value === "Release" ||
              value === "X Post" ||
              value === "Bot Template" ||
              value === "Pull Request"
            ) {
              setKind(value);
            }
          }}
        />
        <Checkbox
          mt="lg"
          label="Unread"
          checked={unreadOnly}
          onChange={(event) => {
            setUnreadOnly(event.currentTarget.checked);
          }}
        />
      </Group>
      <Stack component="ul" gap="sm" aria-label="Entry">
        {trackEntries.map((entry) => (
          <Group
            key={entry.id}
            component="li"
            justify="space-between"
            wrap="nowrap"
            align="flex-start"
          >
            <Stack gap={2}>
              <Link to="/entries/$entryId" params={{ entryId: entry.id }}>
                {entry.title}
              </Link>
              <Text size="sm" c="dimmed">
                {entry.kind} · {formatJst(entry.publishedAt)} ·{" "}
                {entry.caughtUp ? "Caught up" : "Unread"}
              </Text>
              <Text size="sm">{entry.summary}</Text>
            </Stack>
            <Checkbox
              label="Caught up"
              aria-label={`Caught up ${entry.title}`}
              checked={entry.caughtUp}
              onChange={(event) => {
                void catchUp(entry.id, event.currentTarget.checked);
              }}
            />
          </Group>
        ))}
      </Stack>
      <section aria-label="Entry を追加">
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
