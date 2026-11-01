import { createServerFn } from "@tanstack/react-start";
import {
  entriesSchema,
  entrySubsetSchema,
  entryUpdatesSchema,
  keysSchema,
  projectUpdatesSchema,
  projectsSchema,
} from "../data/schemas";
import { runHttp } from "../server/boundary.server";
import {
  deleteEntries,
  deleteProjects,
  insertEntries,
  insertProjects,
  readEntries,
  readEntriesMatching,
  readProjects,
  updateEntries,
  updateProjects,
} from "../server/records.server";

export const listProjects = createServerFn({ method: "GET" }).handler(() =>
  runHttp(readProjects()),
);

export const listEntries = createServerFn({ method: "GET" }).handler(() => runHttp(readEntries()));

export const listEntriesMatching = createServerFn({ method: "GET" })
  .validator(entrySubsetSchema)
  .handler(({ data }) => runHttp(readEntriesMatching(data)));

export const createProjects = createServerFn({ method: "POST" })
  .validator(projectsSchema)
  .handler(({ data }) => runHttp(insertProjects(data)));

export const saveProjects = createServerFn({ method: "POST" })
  .validator(projectUpdatesSchema)
  .handler(({ data }) => runHttp(updateProjects(data)));

export const removeProjects = createServerFn({ method: "POST" })
  .validator(keysSchema)
  .handler(({ data }) => runHttp(deleteProjects(data)));

export const createEntries = createServerFn({ method: "POST" })
  .validator(entriesSchema)
  .handler(({ data }) => runHttp(insertEntries(data)));

export const saveEntries = createServerFn({ method: "POST" })
  .validator(entryUpdatesSchema)
  .handler(({ data }) => runHttp(updateEntries(data)));

export const removeEntries = createServerFn({ method: "POST" })
  .validator(keysSchema)
  .handler(({ data }) => runHttp(deleteEntries(data)));
