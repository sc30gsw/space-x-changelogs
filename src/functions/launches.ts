import { createServerFn } from "@tanstack/react-start";
import { Changelog, type CatalogUnavailable } from "../server/changelog";
import { runHttp } from "../server/run";
import { launchSearchSchema } from "../schemas/launch-search";

const catalogStatus = (error: CatalogUnavailable): number => {
  switch (error._tag) {
    case "CatalogUnavailable":
      return 503;
    default: {
      const unexpected: never = error._tag;
      return unexpected;
    }
  }
};

export const listLaunches = createServerFn({ method: "GET" })
  .validator(launchSearchSchema)
  .handler(({ data }) =>
    runHttp(
      Changelog.use((api) => api.list(data)),
      catalogStatus,
    ),
  );
