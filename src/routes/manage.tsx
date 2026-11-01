import { createFileRoute } from "@tanstack/react-router";
import { ManageScreen } from "../components/manage-screen";

export const Route = createFileRoute("/manage")({
  ssr: false,
  component: ManageScreen,
});
