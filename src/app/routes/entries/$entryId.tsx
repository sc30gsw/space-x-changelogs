import { createFileRoute } from "@tanstack/react-router";
import { EntryDetail } from "../../../features/entries/components/entry-detail";

export const Route = createFileRoute("/entries/$entryId")({
  ssr: false,
  component: EntryRoute,
});

function EntryRoute() {
  const { entryId } = Route.useParams();
  return <EntryDetail entryId={entryId} />;
}
