import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "../components/shell";

export const Route = createFileRoute("/")({
  // Full-document SSR. Start streams this route inside the root document.
  ssr: true,
  component: Home,
});

function Home() {
  return <Shell />;
}
