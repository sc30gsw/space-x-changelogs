import { Button, Divider, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import { Field, Form, reset, useForm } from "@formisch/react";
import type { SubmitHandler } from "@formisch/react";
import { useState } from "react";
import {
  sourceFormSchema,
  trackFormSchema,
  type Source,
  type SourceFormValues,
  type Track,
  type TrackFormValues,
} from "../../../types/schemas";
import { useWorkspace } from "../../../stores/workspace";

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
          {form.errors?.map((error) => (
            <Text role="alert" c="red" key={error}>
              {error}
            </Text>
          ))}
          {message !== null ? <Text role="status">{message}</Text> : null}
        </Stack>
      </Form>
    </section>
  );
}

function TrackEditor({ trackId }: { readonly trackId: Track["id"] }) {
  const { tracks, sources, tracksCollection, sourcesCollection } = useWorkspace();
  const track = tracks.find((item) => item.id === trackId);
  const trackSources = sources
    .filter((source) => source.trackId === trackId)
    .toSorted((left, right) => left.position - right.position || left.id.localeCompare(right.id));
  const [message, setMessage] = useState<string | null>(null);
  const trackForm = useForm({
    schema: trackFormSchema,
    initialInput: { name: track?.name ?? "", slug: track?.slug ?? "" },
  });
  const form = useForm({
    schema: sourceFormSchema,
    initialInput: { label: "", url: "" },
  });

  if (track === undefined) {
    return null;
  }

  const saveTrack: SubmitHandler<typeof trackFormSchema> = async (output: TrackFormValues) => {
    setMessage(null);
    const transaction = tracksCollection.update(track.id, (draft) => {
      draft.name = output.name;
      draft.slug = output.slug;
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
      <Form of={trackForm} onSubmit={saveTrack}>
        <Stack gap="sm" mt="sm">
          <Field of={trackForm} path={["name"]}>
            {(field) => (
              <TextInput
                {...field.props}
                label="名前"
                value={field.input}
                error={field.errors?.[0]}
              />
            )}
          </Field>
          <Field of={trackForm} path={["slug"]}>
            {(field) => (
              <TextInput
                {...field.props}
                label="slug"
                value={field.input}
                error={field.errors?.[0]}
              />
            )}
          </Field>
          <Button type="submit" loading={trackForm.isSubmitting}>
            Track を保存
          </Button>
          {trackForm.errors?.map((error) => (
            <Text role="alert" c="red" key={error}>
              {error}
            </Text>
          ))}
          {message !== null ? <Text role="status">{message}</Text> : null}
        </Stack>
      </Form>
      <Stack gap="sm" mt="sm">
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
            {form.errors?.map((error) => (
              <Text role="alert" c="red" key={error}>
                {error}
              </Text>
            ))}
          </Stack>
        </Form>
      </Stack>
    </section>
  );
}

function SourceEditor({ sourceId }: { readonly sourceId: Source["id"] }) {
  const { sources, sourcesCollection } = useWorkspace();
  const source = sources.find((item) => item.id === sourceId);
  const form = useForm({
    schema: sourceFormSchema,
    initialInput: { label: source?.label ?? "", url: source?.url ?? "" },
  });
  if (source === undefined) {
    return null;
  }

  const save: SubmitHandler<typeof sourceFormSchema> = async (output: SourceFormValues) => {
    const transaction = sourcesCollection.update(source.id, (draft) => {
      draft.label = output.label;
      draft.url = output.url;
    });
    await transaction.when("settled");
  };

  return (
    <Form of={form} onSubmit={save}>
      <Group align="flex-end" wrap="wrap">
        <Field of={form} path={["label"]}>
          {(field) => (
            <TextInput
              {...field.props}
              label={`ラベル ${source.label}`}
              value={field.input}
              error={field.errors?.[0]}
            />
          )}
        </Field>
        <Field of={form} path={["url"]}>
          {(field) => (
            <TextInput
              {...field.props}
              label={`URL ${source.label}`}
              value={field.input}
              error={field.errors?.[0]}
            />
          )}
        </Field>
        <Button type="submit" variant="default" loading={form.isSubmitting}>
          Source を保存
        </Button>
      </Group>
      {form.errors?.map((error) => (
        <Text role="alert" c="red" key={error}>
          {error}
        </Text>
      ))}
    </Form>
  );
}

export function ManageScreen() {
  const { tracks } = useWorkspace();
  const ordered = tracks.toSorted((left, right) => left.name.localeCompare(right.name, "ja"));

  return (
    <Stack gap="xl">
      <Title order={1}>Track 管理</Title>
      <Text lh={1.7}>Track を増やしたあとの Watcher 作成は Grok Bot App 側です。</Text>
      <TrackCreateForm />
      {ordered.map((track) => (
        <Stack key={track.id} gap="md">
          <Divider />
          <TrackEditor trackId={track.id} />
        </Stack>
      ))}
    </Stack>
  );
}
