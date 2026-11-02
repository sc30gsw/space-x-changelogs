import { createFileRoute } from "@tanstack/react-router";
import { ManageScreen } from "../../features/tracks/components/manage-screen";

export const Route = createFileRoute("/manage")({
  ssr: false,
  component: ManageScreen,
});
