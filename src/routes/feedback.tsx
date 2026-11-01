import * as stylex from "@stylexjs/stylex";
import { Button, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { Field, Form, useForm } from "@formisch/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { submitFeedback } from "../api/feedback";
import { Shell } from "../components/shell";
import { feedbackSchema } from "../schemas/feedback";
import type { FeedbackReceipt } from "../server/changelog";

const styles = stylex.create({
  label: {
    fontWeight: 600,
  },
  input: {
    "--input-bd": "var(--mantine-color-teal-filled)",
    "--input-bd-focus": "var(--mantine-color-teal-filled)",
  },
  submit: {
    "--button-bg": "var(--mantine-color-pink-filled)",
    "--button-hover": "var(--mantine-color-pink-filled-hover)",
  },
});

const inputClassNames = {
  label: stylex.props(styles.label).className,
  input: stylex.props(styles.input).className,
};

export const Route = createFileRoute("/feedback")({
  // The empty form is document content and hydrates on the client.
  // Submission goes through a typed server function.
  ssr: true,
  component: FeedbackPage,
});

function FeedbackPage() {
  const form = useForm({
    schema: feedbackSchema,
    initialInput: {
      name: "",
      email: "",
      message: "",
    },
  });
  const [receipt, setReceipt] = useState<FeedbackReceipt | null>(null);

  return (
    <Shell title="Feedback">
      <Form
        of={form}
        onSubmit={(output) =>
          submitFeedback(output).then((next) => {
            setReceipt(next);
          })
        }
      >
        <Stack>
          <Field of={form} path={["name"]}>
            {(field) => (
              <TextInput
                label="Name"
                name={field.props.name}
                value={field.input}
                onBlur={field.props.onBlur}
                onChange={(event) => {
                  field.onChange(event.currentTarget.value);
                }}
                error={field.errors?.[0]}
                classNames={inputClassNames}
              />
            )}
          </Field>
          <Field of={form} path={["email"]}>
            {(field) => (
              <TextInput
                label="Email"
                type="email"
                name={field.props.name}
                value={field.input}
                onBlur={field.props.onBlur}
                onChange={(event) => {
                  field.onChange(event.currentTarget.value);
                }}
                error={field.errors?.[0]}
                classNames={inputClassNames}
              />
            )}
          </Field>
          <Field of={form} path={["message"]}>
            {(field) => (
              <Textarea
                label="Message"
                name={field.props.name}
                value={field.input}
                minRows={4}
                onBlur={field.props.onBlur}
                onChange={(event) => {
                  field.onChange(event.currentTarget.value);
                }}
                error={field.errors?.[0]}
                classNames={inputClassNames}
              />
            )}
          </Field>
          {form.errors ? <Text c="red">{form.errors[0]}</Text> : null}
          {receipt ? (
            <Text>
              Saved {receipt.id} at {receipt.acceptedAt}.
            </Text>
          ) : null}
          <Button type="submit" loading={form.isSubmitting} {...stylex.props(styles.submit)}>
            Send
          </Button>
        </Stack>
      </Form>
    </Shell>
  );
}
