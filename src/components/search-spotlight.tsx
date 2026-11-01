import { Spotlight } from "@mantine/spotlight";
import { useNavigate } from "@tanstack/react-router";
import { memoPlainText } from "./memo-editor";
import { useWorkspace } from "../data/workspace";

export function SearchSpotlight() {
  const navigate = useNavigate();
  const { tracks, entries, memos } = useWorkspace();
  const memoByEntry = new Map<string, string>();
  for (const memo of memos) {
    const text = memoPlainText(memo.body);
    const current = memoByEntry.get(memo.entryId);
    memoByEntry.set(memo.entryId, current === undefined ? text : `${current} ${text}`);
  }

  const trackActions = tracks.map((track) => ({
    id: `track:${track.id}`,
    label: track.name,
    description: "Track",
    group: "Track",
    onClick: () => {
      void navigate({ to: "/tracks/$slug", params: { slug: track.slug } });
    },
  }));

  const entryActions = entries.map((entry) => {
    const track = tracks.find((item) => item.id === entry.trackId);
    const memoText = memoByEntry.get(entry.id) ?? "";
    return {
      id: `entry:${entry.id}`,
      label: entry.title,
      description: `${track?.name ?? "Track"} · ${entry.kind}`,
      group: "Entry",
      keywords: [entry.summary, entry.body, memoText, entry.kind, track?.name ?? ""].join(" "),
      onClick: () => {
        void navigate({ to: "/entries/$entryId", params: { entryId: entry.id } });
      },
    };
  });

  return (
    <Spotlight
      actions={[...trackActions, ...entryActions]}
      nothingFound="一致する Entry はありません"
      highlightQuery
      searchProps={{ placeholder: "原文タイトル、要約、本文、Memo", "aria-label": "検索" }}
    />
  );
}
