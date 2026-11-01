import { createServerFn } from "@tanstack/react-start";
import {
  entryUpdatesSchema,
  keysSchema,
  memoUpdatesSchema,
  memosSchema,
  sourceUpdatesSchema,
  sourcesSchema,
  submitEntrySchema,
  trackUpdatesSchema,
  tracksSchema,
} from "../data/schemas";
import { runHttp } from "../server/boundary.server";
import {
  ingestEntry,
  insertMemos,
  insertSources,
  insertTracks,
  readEntries,
  readMemos,
  readSources,
  readTracks,
  removeEntries,
  removeMemos,
  updateEntries,
  updateMemos,
  updateSources,
  updateTracks,
} from "../server/records.server";

export const listTracks = createServerFn({ method: "GET" }).handler(() => runHttp(readTracks()));

export const listSources = createServerFn({ method: "GET" }).handler(() => runHttp(readSources()));

export const listEntries = createServerFn({ method: "GET" }).handler(() => runHttp(readEntries()));

export const listMemos = createServerFn({ method: "GET" }).handler(() => runHttp(readMemos()));

export const createTracks = createServerFn({ method: "POST" })
  .validator(tracksSchema)
  .handler(({ data }) => runHttp(insertTracks(data)));

export const saveTracks = createServerFn({ method: "POST" })
  .validator(trackUpdatesSchema)
  .handler(({ data }) => runHttp(updateTracks(data)));

export const createSources = createServerFn({ method: "POST" })
  .validator(sourcesSchema)
  .handler(({ data }) => runHttp(insertSources(data)));

export const saveSources = createServerFn({ method: "POST" })
  .validator(sourceUpdatesSchema)
  .handler(({ data }) => runHttp(updateSources(data)));

export const submitEntryFn = createServerFn({ method: "POST" })
  .validator(submitEntrySchema)
  .handler(({ data }) => runHttp(ingestEntry(data)));

export const saveEntries = createServerFn({ method: "POST" })
  .validator(entryUpdatesSchema)
  .handler(({ data }) => runHttp(updateEntries(data)));

export const removeEntriesFn = createServerFn({ method: "POST" })
  .validator(keysSchema)
  .handler(({ data }) => runHttp(removeEntries(data)));

export const createMemos = createServerFn({ method: "POST" })
  .validator(memosSchema)
  .handler(({ data }) => runHttp(insertMemos(data)));

export const saveMemos = createServerFn({ method: "POST" })
  .validator(memoUpdatesSchema)
  .handler(({ data }) => runHttp(updateMemos(data)));

export const removeMemosFn = createServerFn({ method: "POST" })
  .validator(keysSchema)
  .handler(({ data }) => runHttp(removeMemos(data)));
