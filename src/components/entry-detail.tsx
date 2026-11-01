import { Anchor, Button, Group, Modal, Stack, Switch, Text, Title } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { submitEntryFn } from "../functions/records";
import { useWorkspace } from "../data/workspace";
import type { EntryFormValues } from "../data/schemas";
import { formatJst, instantFromJstLocal, jstLocalFromInstant, nowInstant } from "../domain/time";
import { EntryForm } from "./entry-form";
import { MarkdownView } from "./markdown-view";
import { MemoEditor, memoPlainText, sanitizeMemo } from "./memo-editor";

export function EntryDetail({ entryId }: { readonly entryId: string }) {
  const { entries, memos, tracks, entriesCollection, memosCollection, isLoading } = useWorkspace();
  const entry = entries.find((item) => item.id === entryId);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [memoHtml, setMemoHtml] = useState("<p></p>");
  const [memoKey, setMemoKey] = useState(0);
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [editingHtml, setEditingHtml] = useState("");
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
    const transaction = entriesCollection.update(entry.id, (draft) => {
      draft.caughtUp = caughtUp;
    });
    await transaction.when("settled");
  };

  const saveEntry = async (values: EntryFormValues) => {
    const saved = await submitEntryFn({
      data: {
        id: entry.id,
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
    setEditing(false);
  };

  const removeEntry = async () => {
    const memoIds = entryMemos.map((memo) => memo.id);
    const transaction = entriesCollection.delete(entry.id);
    await transaction.when("settled");
    if (memoIds.length > 0) {
      const memoTransaction = memosCollection.delete(memoIds);
      await memoTransaction.when("settled");
    }
    setConfirming(false);
  };

  const addMemo = async () => {
    if (memoPlainText(memoHtml).length === 0) {
      setMessage("Memo を入力してください");
      return;
    }
    const now = nowInstant();
    const transaction = memosCollection.insert({
      id: crypto.randomUUID(),
      entryId: entry.id,
      body: memoHtml,
      createdAt: now,
      updatedAt: now,
    });
    await transaction.when("settled");
    setMemoHtml("<p></p>");
    setMemoKey((value) => value + 1);
    setMessage(null);
  };

  const saveMemo = async (id: string) => {
    if (memoPlainText(editingHtml).length === 0) {
      setMessage("Memo を入力してください");
      return;
    }
    const transaction = memosCollection.update(id, (draft) => {
      draft.body = editingHtml;
    });
    await transaction.when("settled");
    setEditingMemoId(null);
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        {track !== undefined ? (
          <Link to="/tracks/$slug" params={{ slug: track.slug }}>
            {track.name}
          </Link>
        ) : (
          <Text>Track</Text>
        )}
        <Text>{entry.caughtUp ? "Caught up" : "Unread"}</Text>
      </Group>
      <Title order={1}>{entry.title}</Title>
      <Text>
        {entry.kind} · {formatJst(entry.publishedAt)}
      </Text>
      <Anchor href={entry.url} target="_blank" rel="noreferrer">
        原文
      </Anchor>
      <Text>{entry.summary}</Text>
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
      <section aria-label="Memo">
        <Title order={2} size="h3">
          Memo
        </Title>
        <Stack component="ul" gap="md" mt="md">
          {entryMemos.map((memo) => (
            <Stack key={memo.id} component="li" gap="xs">
              {editingMemoId === memo.id ? (
                <>
                  <MemoEditor initial={memo.body} onChange={setEditingHtml} label="Memo を編集" />
                  <Group>
                    <Button type="button" onClick={() => void saveMemo(memo.id)}>
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
                        setEditingMemoId(memo.id);
                        setEditingHtml(memo.body);
                      }}
                    >
                      Memo を編集
                    </Button>
                    <Button
                      type="button"
                      color="red"
                      variant="subtle"
                      onClick={() => {
                        void memosCollection.delete(memo.id).when("settled");
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
          <MemoEditor key={memoKey} initial="<p></p>" onChange={setMemoHtml} label="Memo" />
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
