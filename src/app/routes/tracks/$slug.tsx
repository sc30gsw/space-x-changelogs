import { createFileRoute } from "@tanstack/react-router";
import { TrackScreen } from "../../../features/tracks/components/track-screen";

export const Route = createFileRoute("/tracks/$slug")({
  ssr: false,
  component: TrackRoute,
});

function TrackRoute() {
  const { slug } = Route.useParams();
  return <TrackScreen slug={slug} />;
}
