import { Button, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import { Field, Form, reset, useForm } from "@formisch/react";
import type { SubmitHandler } from "@formisch/react";
import { useState } from "react";
import {
  sourceFormSchema,
  trackFormSchema,
  type SourceFormValues,
  type TrackFormValues,
} from "../data/schemas";
import { useWorkspace } from "../data/workspace";

function TrackCreateForm() {
  const { tracksCollection } = useWorkspace();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({
    schema: trackFormSchema,
    initialInput: { name: "", slug: "" },
  });
  const handleSubmit: SubmitHandler<typeof trackFormSchema> = async (output: TrackFormValues) => {
    setMessage(null);
    const transaction = tracksCollection.insert({
      id: crypto.randomUUID(),
      name: output.name,
      slug: output.slug,
    });
    await transaction.when("settled");
    reset(form);
    setMessage(`${output.name} を追加しました`);
  };

  return (
    <section aria-label="Track を追加">
      <Title order={2} size="h3" mb="sm">
        Track を追加
      </Title>
      <Form of={form} onSubmit={handleSubmit}>
        <Stack gap="sm">
          <Field of={form} path={["name"]}>
            {(field) => (
              <TextInput
                {...field.props}
                label="名前"
                value={field.input}
                error={field.errors?.[0]}
              />
            )}
          </Field>
          <Field of={form} path={["slug"]}>
            {(field) => (
              <TextInput
                {...field.props}
                label="slug"
                value={field.input}
                error={field.errors?.[0]}
              />
            )}
          </Field>
          <Button type="submit" loading={form.isSubmitting}>
            Track を追加
          </Button>
          {message !== null ? <Text role="status">{message}</Text> : null}
        </Stack>
      </Form>
    </section>
  );
}

function TrackEditor({ trackId }: { readonly trackId: string }) {
  const { tracks, sources, tracksCollection, sourcesCollection } = useWorkspace();
  const track = tracks.find((item) => item.id === trackId);
  const trackSources = sources
    .filter((source) => source.trackId === trackId)
    .toSorted((left, right) => left.position - right.position || left.id.localeCompare(right.id));
  const [name, setName] = useState(track?.name ?? "");
  const [slug, setSlug] = useState(track?.slug ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({
    schema: sourceFormSchema,
    initialInput: { label: "", url: "" },
  });

  if (track === undefined) {
    return null;
  }

  const saveTrack = async () => {
    const parsedName = name.trim();
    const parsedSlug = slug.trim();
    if (parsedName.length === 0 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(parsedSlug)) {
      setMessage("名前と slug を確認してください");
      return;
    }
    const transaction = tracksCollection.update(track.id, (draft) => {
      draft.name = parsedName;
      draft.slug = parsedSlug;
    });
    await transaction.when("settled");
    setMessage("保存しました");
  };

  const addSource: SubmitHandler<typeof sourceFormSchema> = async (output: SourceFormValues) => {
    const position = trackSources.reduce((max, source) => Math.max(max, source.position), -1) + 1;
    const transaction = sourcesCollection.insert({
      id: crypto.randomUUID(),
      trackId: track.id,
      label: output.label,
      url: output.url,
      position,
    });
    await transaction.when("settled");
    reset(form);
  };

  return (
    <section aria-label={track.name}>
      <Title order={2} size="h3">
        {track.name}
      </Title>
      <Stack gap="sm" mt="sm">
        <TextInput
          label="名前"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <TextInput
          label="slug"
          value={slug}
          onChange={(event) => setSlug(event.currentTarget.value)}
        />
        <Button type="button" onClick={() => void saveTrack()}>
          Track を保存
        </Button>
        <Text fw={600}>Source</Text>
        {trackSources.map((source) => (
          <SourceEditor key={source.id} sourceId={source.id} />
        ))}
        <Form of={form} onSubmit={addSource}>
          <Stack gap="sm">
            <Field of={form} path={["label"]}>
              {(field) => (
                <TextInput
                  {...field.props}
                  label="ラベル"
                  value={field.input}
                  error={field.errors?.[0]}
                />
              )}
            </Field>
            <Field of={form} path={["url"]}>
              {(field) => (
                <TextInput
                  {...field.props}
                  label="URL"
                  value={field.input}
                  error={field.errors?.[0]}
                />
              )}
            </Field>
            <Button type="submit">Source を追加</Button>
          </Stack>
        </Form>
        {message !== null ? <Text role="status">{message}</Text> : null}
      </Stack>
    </section>
  );
}

function SourceEditor({ sourceId }: { readonly sourceId: string }) {
  const { sources, sourcesCollection } = useWorkspace();
  const source = sources.find((item) => item.id === sourceId);
  const [label, setLabel] = useState(source?.label ?? "");
  const [url, setUrl] = useState(source?.url ?? "");
  if (source === undefined) {
    return null;
  }

  const save = async () => {
    const transaction = sourcesCollection.update(source.id, (draft) => {
      draft.label = label.trim();
      draft.url = url.trim();
    });
    await transaction.when("settled");
  };

  return (
    <Group align="flex-end">
      <TextInput
        label={`ラベル ${source.label}`}
        value={label}
        onChange={(event) => setLabel(event.currentTarget.value)}
      />
      <TextInput
        label={`URL ${source.label}`}
        value={url}
        onChange={(event) => setUrl(event.currentTarget.value)}
      />
      <Button type="button" variant="default" onClick={() => void save()}>
        Source を保存
      </Button>
    </Group>
  );
}

export function ManageScreen() {
  const { tracks } = useWorkspace();
  const ordered = tracks.toSorted((left, right) => left.name.localeCompare(right.name, "ja"));

  return (
    <Stack gap="xl">
      <Title order={1}>Track 管理</Title>
      <Text>Track を増やしたあとの Watcher 作成は Grok Bot App 側です。</Text>
      <TrackCreateForm />
      {ordered.map((track) => (
        <TrackEditor key={track.id} trackId={track.id} />
      ))}
    </Stack>
  );
}
