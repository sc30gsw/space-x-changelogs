import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { entryCollection, projectCollection } from "./collections";

export function useEntryFeed() {
  return useLiveQuery({
    query: (q) =>
      q
        .from({ entry: entryCollection })
        .join(
          { project: projectCollection },
          ({ entry, project }) => eq(project.id, entry.projectId),
          "inner",
        )
        .select(({ entry, project }) => ({
          id: entry.id,
          title: entry.title,
          body: entry.body,
          createdAt: entry.createdAt,
          projectId: entry.projectId,
          projectName: project.name,
        })),
  });
}
