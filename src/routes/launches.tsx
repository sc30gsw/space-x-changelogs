import * as stylex from "@stylexjs/stylex";
import { Button, Group, Stack, Text, TextInput } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Predicate } from "effect";
import { loadLaunchRoute } from "../api/launches";
import { Shell } from "../components/shell";
import { launchSearchSchema } from "../schemas/launch-search";

const styles = stylex.create({
  label: {
    fontWeight: 600,
  },
  input: {
    "--input-bd": "var(--mantine-color-teal-filled)",
    "--input-bd-focus": "var(--mantine-color-teal-filled)",
  },
});

const inputClassNames = {
  label: stylex.props(styles.label).className,
  input: stylex.props(styles.input).className,
};

export const Route = createFileRoute("/launches")({
  validateSearch: launchSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => loadLaunchRoute(deps),
  // The loader reads the catalog on the server for the first request.
  // The list formats that timestamp with the browser locale, so the
  // component itself renders on the client.
  ssr: "data-only",
  pendingComponent: LaunchPending,
  errorComponent: LaunchError,
  component: Launches,
});

function LaunchPending() {
  return (
    <Shell title="Launches">
      <Text>Loading launches…</Text>
    </Shell>
  );
}

function LaunchError({ error }: { readonly error: unknown }) {
  return (
    <Shell title="Launches">
      <Text c="red">{Predicate.isError(error) ? error.message : "Could not load launches."}</Text>
    </Shell>
  );
}

function Launches() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const data = Route.useLoaderData();
  const [locale, setLocale] = useState<string | null>(null);

  useEffect(() => {
    setLocale(navigator.language);
  }, []);

  const generatedAt =
    locale === null
      ? data.generatedAt
      : new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(data.generatedAt));

  return (
    <Shell title="Launches">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const query = formData.get("q");
          const yearValue = formData.get("year");
          const year = typeof yearValue === "string" ? Number(yearValue) : search.year;
          void navigate({
            search: {
              q: typeof query === "string" ? query : "",
              year: Number.isInteger(year) ? year : search.year,
            },
          });
        }}
      >
        <Stack>
          <TextInput name="q" label="Title" defaultValue={search.q} classNames={inputClassNames} />
          <TextInput
            name="year"
            label="Year"
            type="number"
            defaultValue={search.year}
            classNames={inputClassNames}
          />
          <Group>
            <Button type="submit">Filter</Button>
          </Group>
        </Stack>
      </form>
      <Text size="sm">Generated {generatedAt}</Text>
      {data.launches.length === 0 ? (
        <Text>No launches match this filter.</Text>
      ) : (
        <Stack gap="xs">
          {data.launches.map((launch) => (
            <Text key={launch.id}>
              {launch.year} · {launch.title}
            </Text>
          ))}
        </Stack>
      )}
    </Shell>
  );
}
