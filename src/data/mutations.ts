import type { DbClient } from "@tanstack/db";
import { Effect, Predicate } from "effect";
import { entryCollection, projectCollection } from "./collections";
import { PersistRejected } from "./errors";
import type { Entry, EntryChanges, Project } from "./schemas";

const settled = <A>(promise: Promise<A>) =>
  Effect.tryPromise({
    try: () => promise,
    catch: (cause) =>
      new PersistRejected({
        message: Predicate.isError(cause)
          ? cause.message
          : "The optimistic change was rolled back.",
        cause,
      }),
  });

export const insertProject = Effect.fn("insertProject")(function* (client: DbClient, row: Project) {
  const transaction = client.collection(projectCollection).insert(row);
  return yield* settled(transaction.when("settled"));
});

export const updateProject = Effect.fn("updateProject")(function* (
  client: DbClient,
  id: string,
  name: string,
) {
  const transaction = client.collection(projectCollection).update(id, (draft) => {
    draft.name = name;
  });
  return yield* settled(transaction.when("settled"));
});

export const deleteProject = Effect.fn("deleteProject")(function* (client: DbClient, id: string) {
  const transaction = client.collection(projectCollection).delete(id);
  return yield* settled(transaction.when("settled"));
});

export const insertEntry = Effect.fn("insertEntry")(function* (client: DbClient, row: Entry) {
  const transaction = client.collection(entryCollection).insert(row);
  return yield* settled(transaction.when("settled"));
});

export const updateEntry = Effect.fn("updateEntry")(function* (
  client: DbClient,
  id: string,
  changes: EntryChanges,
) {
  const transaction = client.collection(entryCollection).update(id, (draft) => {
    if (changes.projectId !== undefined) {
      draft.projectId = changes.projectId;
    }
    if (changes.title !== undefined) {
      draft.title = changes.title;
    }
    if (changes.body !== undefined) {
      draft.body = changes.body;
    }
    if (changes.createdAt !== undefined) {
      draft.createdAt = changes.createdAt;
    }
  });
  return yield* settled(transaction.when("settled"));
});

export const deleteEntry = Effect.fn("deleteEntry")(function* (client: DbClient, id: string) {
  const transaction = client.collection(entryCollection).delete(id);
  return yield* settled(transaction.when("settled"));
});
