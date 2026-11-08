import { createServerFn } from "@tanstack/react-start";
import { runHttp } from "../lib/boundary.ts";
import {
  catchUpEffect,
  ingestEntryEffect,
  removeEntriesEffect,
  removeMemosEffect,
  saveMemoEffect,
  saveSourceEffect,
  saveTrackEffect,
} from "../lib/db/write.ts";
import {
  catchUpSchema,
  ingestEntrySchema,
  memoSaveSchema,
  removeIdsSchema,
  sourceSaveSchema,
  trackSaveSchema,
} from "../types/writes.ts";

export const ingestEntryFn = createServerFn({ method: "POST" })
  .validator(ingestEntrySchema)
  .handler(({ data }) => runHttp(ingestEntryEffect(data)));

export const catchUpFn = createServerFn({ method: "POST" })
  .validator(catchUpSchema)
  .handler(({ data }) => runHttp(catchUpEffect(data)));

export const saveTrackFn = createServerFn({ method: "POST" })
  .validator(trackSaveSchema)
  .handler(({ data }) => runHttp(saveTrackEffect(data)));

export const saveSourceFn = createServerFn({ method: "POST" })
  .validator(sourceSaveSchema)
  .handler(({ data }) => runHttp(saveSourceEffect(data)));

export const saveMemoFn = createServerFn({ method: "POST" })
  .validator(memoSaveSchema)
  .handler(({ data }) => runHttp(saveMemoEffect(data)));

export const removeEntriesFn = createServerFn({ method: "POST" })
  .validator(removeIdsSchema)
  .handler(({ data }) => runHttp(removeEntriesEffect(data)));

export const removeMemosFn = createServerFn({ method: "POST" })
  .validator(removeIdsSchema)
  .handler(({ data }) => runHttp(removeMemosEffect(data)));
