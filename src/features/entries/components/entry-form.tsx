import { Button, Group, Select, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { Field, Form, reset, useForm, type SubmitHandler } from "@formisch/react";
import { useState } from "react";
import { entryFormSchema, type EntryFormValues } from "../../../types/schemas";
import { entryKinds, isEntryKind } from "../../../utils/kinds";
import { todayAtMidnightJst } from "../../../utils/time";
import { useWorkspace } from "../../../stores/workspace";

const kindOptions = entryKinds.map((kind) => ({ value: kind, label: kind }));

export function EntryForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  readonly initial?: Partial<EntryFormValues>;
  readonly submitLabel: string;
  readonly onSubmit: (values: EntryFormValues) => Promise<void>;
}) {
  const { tracks } = useWorkspace();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({
    schema: entryFormSchema,
    initialInput: {
      trackId: initial?.trackId ?? tracks[0]?.id ?? "",
      kind: initial?.kind ?? "Release",
      title: initial?.title ?? "",
      url: initial?.url ?? "",
      publishedAt: initial?.publishedAt ?? todayAtMidnightJst(),
      summary: initial?.summary ?? "",
      body: initial?.body ?? "",
    },
  });

  const handleSubmit: SubmitHandler<typeof entryFormSchema> = async (output) => {
    setMessage(null);
    try {
      await onSubmit(output);
      if (initial === undefined) {
        reset(form);
      }
      setMessage("保存しました");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存できませんでした");
    }
  };

  const trackOptions = tracks.map((track) => ({ value: track.id, label: track.name }));

  return (
    <Form of={form} onSubmit={handleSubmit}>
      <Stack gap="sm">
        <Field of={form} path={["trackId"]}>
          {(field) => (
            <Select
              label="Track"
              data={trackOptions}
              value={field.input}
              allowDeselect={false}
              error={field.errors?.[0]}
              onChange={(value) => {
                field.onChange(value ?? "");
              }}
            />
          )}
        </Field>
        <Field of={form} path={["kind"]}>
          {(field) => (
            <Select
              label="種類"
              data={kindOptions}
              value={field.input}
              allowDeselect={false}
              error={field.errors?.[0]}
              onChange={(value) => {
                if (value !== null && isEntryKind(value)) {
                  field.onChange(value);
                }
              }}
            />
          )}
        </Field>
        <Field of={form} path={["title"]}>
          {(field) => (
            <TextInput
              {...field.props}
              label="原文タイトル"
              value={field.input}
              error={field.errors?.[0]}
            />
          )}
        </Field>
        <Field of={form} path={["url"]}>
          {(field) => (
            <TextInput
              {...field.props}
              label="原文 URL"
              value={field.input}
              error={field.errors?.[0]}
            />
          )}
        </Field>
        <Field of={form} path={["publishedAt"]}>
          {(field) => (
            <TextInput
              {...field.props}
              type="datetime-local"
              label="公開日時"
              description="JST。時刻が不明なら 00:00"
              value={field.input}
              error={field.errors?.[0]}
            />
          )}
        </Field>
        <Field of={form} path={["summary"]}>
          {(field) => (
            <Textarea
              {...field.props}
              label="要約"
              description="1〜3文の日本語"
              minRows={3}
              value={field.input}
              error={field.errors?.[0]}
            />
          )}
        </Field>
        <Field of={form} path={["body"]}>
          {(field) => (
            <Textarea
              {...field.props}
              label="本文"
              description="Markdown"
              minRows={5}
              value={field.input}
              error={field.errors?.[0]}
            />
          )}
        </Field>
        <Group>
          <Button type="submit" loading={form.isSubmitting}>
            {submitLabel}
          </Button>
        </Group>
        {message !== null ? (
          <Text role="status" c={message === "保存しました" ? "teal" : "red"}>
            {message}
          </Text>
        ) : null}
      </Stack>
    </Form>
  );
}
