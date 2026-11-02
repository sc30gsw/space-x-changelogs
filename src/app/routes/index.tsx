import { Stack, Text, Title } from "@mantine/core";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useWorkspace } from "../../stores/workspace";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const { tracks, isLoading } = useWorkspace();
  const navigate = useNavigate();
  const cursor = tracks.find((track) => track.slug === "cursor");
  const first = tracks.toSorted(
    (left, right) => left.name.localeCompare(right.name, "ja") || left.id.localeCompare(right.id),
  )[0];
  const slug = cursor?.slug ?? first?.slug;

  useEffect(() => {
    if (slug === undefined) {
      return;
    }
    void navigate({ to: "/tracks/$slug", params: { slug }, replace: true });
  }, [navigate, slug]);

  if (isLoading || slug !== undefined) {
    return <Text>読み込み中</Text>;
  }

  return (
    <Stack>
      <Title order={1}>Track</Title>
      <Text>この Track はありません。</Text>
      <Link to="/manage">Track 管理</Link>
    </Stack>
  );
}
