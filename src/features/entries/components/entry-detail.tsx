import { Anchor, Box, Button, Group, Modal, Stack, Switch, Text, Title } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  catchUp,
  ingestEntry,
  removeEntries,
  removeMemos,
  saveMemo,
} from "../../../stores/changelog";
import { useWorkspace } from "../../../stores/workspace";
import type { EntryFormValues } from "../../../types/schemas";
import { formatJst, instantFromJstLocal, jstLocalFromInstant } from "../../../utils/time";
import { EntryForm } from "./entry-form";
import { MarkdownView } from "../../../components/markdown-view";
import { sanitizeMemo } from "../../../lib/memo-html";
import { MemoEditor, memoPlainText } from "../../memos/components/memo-editor";

export function EntryDetail({ entryId }: { readonly entryId: string }) {
  const { entries, memos, tracks, isLoading } = useWorkspace();
  const entry = entries.find((item) => item.id === entryId);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const memoHtmlRef = useRef("<p></p>");
  const [memoKey, setMemoKey] = useState(0);
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const editingHtmlRef = useRef("");
  const [message, setMessage] = useState<string | null>(null);

  if (entry === undefined && isLoading) {
    return <Text>読み込み中</Text>;
  }

  if (entry === undefined) {
    return (
      <Stack>
        <Title order={1}>Entry</Title>
        <Text>この Entry はありません。</Text>
      </Stack>
    );
  }

  const track = tracks.find((item) => item.id === entry.trackId);
  const entryMemos = memos
    .filter((memo) => memo.entryId === entry.id)
    .toSorted(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    );

  const toggleCaughtUp = async (caughtUp: boolean) => {
    await catchUp([{ id: entry.id, caughtUp }]);
  };

  const saveEntry = async (values: EntryFormValues) => {
    await ingestEntry({
      id: entry.id,
      trackId: values.trackId,
      kind: values.kind,
      title: values.title,
      url: values.url,
      publishedAt: instantFromJstLocal(values.publishedAt),
      summary: values.summary,
      body: values.body,
    });
    setEditing(false);
  };

  const removeEntry = async () => {
    await removeEntries([entry.id]);
    setConfirming(false);
  };

  const addMemo = async () => {
    const html = memoHtmlRef.current;
    if (memoPlainText(html).length === 0) {
      setMessage("Memo を入力してください");
      return;
    }
    await saveMemo({ id: crypto.randomUUID(), entryId: entry.id, body: html });
    memoHtmlRef.current = "<p></p>";
    setMemoKey((value) => value + 1);
    setMessage(null);
  };

  const editMemo = async (id: string) => {
    const html = editingHtmlRef.current;
    if (memoPlainText(html).length === 0) {
      setMessage("Memo を入力してください");
      return;
    }
    await saveMemo({ id, entryId: entry.id, body: html });
    setEditingMemoId(null);
  };

  return (
    <Stack gap="lg">
      {track !== undefined ? (
        <Link className="log-link" to="/tracks/$slug" params={{ slug: track.slug }}>
          {track.name}
        </Link>
      ) : (
        <Text>Track</Text>
      )}
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
      <Title order={1}>{entry.title}</Title>
      <Text size="lg" lh={1.75}>
        {entry.summary}
      </Text>
      <Anchor href={entry.url} target="_blank" rel="noreferrer" c="ink.8">
        原文
      </Anchor>
      <MarkdownView text={entry.body} />
      <Switch
        label="Caught up"
        checked={entry.caughtUp}
        onChange={(event) => {
          void toggleCaughtUp(event.currentTarget.checked);
        }}
      />
      <Group>
        <Button type="button" variant="default" onClick={() => setEditing((value) => !value)}>
          編集
        </Button>
        <Button type="button" color="red" variant="light" onClick={() => setConfirming(true)}>
          削除
        </Button>
      </Group>
      {editing ? (
        <section aria-label="Entry を編集">
          <EntryForm
            initial={{
              trackId: entry.trackId,
              kind: entry.kind,
              title: entry.title,
              url: entry.url,
              publishedAt: jstLocalFromInstant(entry.publishedAt),
              summary: entry.summary,
              body: entry.body,
            }}
            submitLabel="保存"
            onSubmit={saveEntry}
          />
        </section>
      ) : null}
      <section aria-label="Memo" style={{ borderTop: "1px solid #e6e7ea", paddingTop: 28 }}>
        <Title order={2} size="h3">
          Memo
        </Title>
        <Stack component="ul" gap="md" mt="md">
          {entryMemos.map((memo) => (
            <Stack key={memo.id} component="li" gap="xs">
              {editingMemoId === memo.id ? (
                <>
                  <MemoEditor
                    initial={memo.body}
                    onChange={(html) => {
                      editingHtmlRef.current = html;
                    }}
                    label="Memo を編集"
                  />
                  <Group>
                    <Button type="button" onClick={() => void editMemo(memo.id)}>
                      Memo を保存
                    </Button>
                    <Button type="button" variant="default" onClick={() => setEditingMemoId(null)}>
                      キャンセル
                    </Button>
                  </Group>
                </>
              ) : (
                <>
                  <div dangerouslySetInnerHTML={{ __html: sanitizeMemo(memo.body) }} />
                  <Group>
                    <Button
                      type="button"
                      variant="default"
                      onClick={() => {
                        editingHtmlRef.current = memo.body;
                        setEditingMemoId(memo.id);
                      }}
                    >
                      Memo を編集
                    </Button>
                    <Button
                      type="button"
                      color="red"
                      variant="subtle"
                      onClick={() => {
                        void removeMemos([memo.id]);
                      }}
                    >
                      Memo を削除
                    </Button>
                  </Group>
                </>
              )}
            </Stack>
          ))}
        </Stack>
        <Stack mt="md">
          <MemoEditor
            key={memoKey}
            initial="<p></p>"
            onChange={(html) => {
              memoHtmlRef.current = html;
            }}
            label="Memo"
          />
          <Button type="button" onClick={() => void addMemo()}>
            Memo を追加
          </Button>
          {message !== null ? (
            <Text role="alert" c="red">
              {message}
            </Text>
          ) : null}
        </Stack>
      </section>
      <Modal opened={confirming} onClose={() => setConfirming(false)} title="Entry を削除します">
        <Text>この Entry と Memo を削除します。</Text>
        <Group mt="md">
          <Button type="button" color="red" onClick={() => void removeEntry()}>
            削除する
          </Button>
          <Button type="button" variant="default" onClick={() => setConfirming(false)}>
            キャンセル
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}
