import type { SeedTrack } from "../../types/schemas";

// Initial Tracks and Sources. Later Tracks are added from the manage screen.
export const seedTracks: readonly SeedTrack[] = [
  {
    id: "track-cursor",
    name: "Cursor",
    slug: "cursor",
    sources: [
      {
        id: "source-cursor-changelog",
        label: "Cursor changelog",
        url: "https://cursor.com/changelog",
      },
      {
        id: "source-cursor-ja",
        label: "日本語版",
        url: "https://cursor.com/ja/changelog",
      },
      {
        id: "source-cursor-page-2",
        label: "page 2 以降",
        url: "https://cursor.com/changelog/page/2",
      },
      {
        id: "source-cursor-ai",
        label: "@cursor_ai",
        url: "https://x.com/cursor_ai",
      },
    ],
  },
  {
    id: "track-grok-bot",
    name: "Grok Bot",
    slug: "grok-bot",
    sources: [
      {
        id: "source-grok-changelog",
        label: "Grok Bot changelog",
        url: "https://x.ai/changelog/bot",
      },
      {
        id: "source-grok-marketplace",
        label: "Bot Marketplace",
        url: "https://x.ai/bot/marketplace",
      },
      {
        id: "source-grok-bot-account",
        label: "@bot",
        url: "https://x.com/bot",
      },
      {
        id: "source-grok-shared",
        label: "X 上で共有された Grok Bot",
        url: "https://x.ai/bot/<id>",
      },
    ],
  },
  {
    id: "track-pstack",
    name: "pstack",
    slug: "pstack",
    sources: [
      {
        id: "source-pstack-plugins",
        label: "cursor/plugins の pstack/",
        url: "https://github.com/cursor/plugins",
      },
    ],
  },
];
