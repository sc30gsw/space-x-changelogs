import { Button, Divider, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import { Field, Form, reset, useForm } from "@formisch/react";
import type { SubmitHandler } from "@formisch/react";
import { useRef, useState } from "react";
import { saveSource, saveTrack } from "../../../stores/changelog";
import { useWorkspace } from "../../../stores/workspace";
import {
  sourceFormSchema,
  trackFormSchema,
  type Source,
  type SourceFormValues,
  type Track,
  type TrackFormValues,
} from "../../../types/schemas";

const rejectionText = (error: unknown): string =>
  error instanceof Error && error.message.length > 0 ? error.message : "保存できませんでした";

function TrackCreateForm() {
  const draftId = useRef(crypto.randomUUID());
  const [message, setMessage] = useState<string | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  const form = useForm({
    schema: trackFormSchema,
    initialInput: { name: "", slug: "" },
  });
  const handleSubmit: SubmitHandler<typeof trackFormSchema> = async (output: TrackFormValues) => {
    setMessage(null);
    setRejection(null);
    try {
      await saveTrack({ id: draftId.current, name: output.name, slug: output.slug });
    } catch (error) {
      setRejection(rejectionText(error));
      return;
    }
    draftId.current = crypto.randomUUID();
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
          {rejection !== null ? (
            <Text role="alert" c="red">
              {rejection}
            </Text>
          ) : null}
          {message !== null ? <Text role="status">{message}</Text> : null}
        </Stack>
      </Form>
    </section>
  );
}

function TrackEditor({ trackId }: { readonly trackId: Track["id"] }) {
  const { tracks, sources } = useWorkspace();
  const sourceDraftId = useRef(crypto.randomUUID());
  const track = tracks.find((item) => item.id === trackId);
  const trackSources = sources
    .filter((source) => source.trackId === trackId)
    .toSorted((left, right) => left.position - right.position || left.id.localeCompare(right.id));
  const [message, setMessage] = useState<string | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  const [sourceRejection, setSourceRejection] = useState<string | null>(null);
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

  const saveThisTrack: SubmitHandler<typeof trackFormSchema> = async (output: TrackFormValues) => {
    setMessage(null);
    setRejection(null);
    try {
      await saveTrack({ id: track.id, name: output.name, slug: output.slug });
    } catch (error) {
      setRejection(rejectionText(error));
      return;
    }
    setMessage("保存しました");
  };

  const addSource: SubmitHandler<typeof sourceFormSchema> = async (output: SourceFormValues) => {
    setSourceRejection(null);
    try {
      await saveSource({
        id: sourceDraftId.current,
        trackId: track.id,
        label: output.label,
        url: output.url,
      });
    } catch (error) {
      setSourceRejection(rejectionText(error));
      return;
    }
    sourceDraftId.current = crypto.randomUUID();
    reset(form);
  };

  return (
    <section aria-label={track.name}>
      <Title order={2} size="h3">
        {track.name}
      </Title>
      <Form of={trackForm} onSubmit={saveThisTrack}>
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
          {rejection !== null ? (
            <Text role="alert" c="red">
              {rejection}
            </Text>
          ) : null}
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
            {sourceRejection !== null ? (
              <Text role="alert" c="red">
                {sourceRejection}
              </Text>
            ) : null}
          </Stack>
        </Form>
      </Stack>
    </section>
  );
}

function SourceEditor({ sourceId }: { readonly sourceId: Source["id"] }) {
  const { sources } = useWorkspace();
  const source = sources.find((item) => item.id === sourceId);
  const [rejection, setRejection] = useState<string | null>(null);
  const form = useForm({
    schema: sourceFormSchema,
    initialInput: { label: source?.label ?? "", url: source?.url ?? "" },
  });
  if (source === undefined) {
    return null;
  }

  const save: SubmitHandler<typeof sourceFormSchema> = async (output: SourceFormValues) => {
    setRejection(null);
    try {
      await saveSource({
        id: source.id,
        trackId: source.trackId,
        label: output.label,
        url: output.url,
      });
    } catch (error) {
      setRejection(rejectionText(error));
    }
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
      {rejection !== null ? (
        <Text role="alert" c="red">
          {rejection}
        </Text>
      ) : null}
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
