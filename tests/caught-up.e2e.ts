import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { addEntry, catchUpCursor, openCursor } from "./support";

test("opening a detail leaves the Entry Unread and the badge matches", async ({ app, screen }) => {
  await openCursor(app, screen);
  await catchUpCursor(screen);
  const title = "詳細を開いても Unread";
  await addEntry(screen, {
    title,
    url: "https://example.test/e2e-unread",
    summary: "開いただけでは Caught up になりません。",
  });
  await expect(screen.getByRole("link", "Cursor 1 Unread")).toBeVisible();
  await expect(screen.getByRole("listitem").filter({ hasText: title })).toContainText("Unread");

  await screen.getByRole("link", title).tap();
  await expect(screen.getByRole("heading", title)).toBeVisible();
  await expect(screen.getByText("Unread")).toBeVisible();

  await screen.getByRole("link", "Cursor 1 Unread").tap();
  await expect(screen.getByRole("listitem").filter({ hasText: title })).toContainText("Unread");
  await screen.getByRole("checkbox", `Caught up ${title}`).tap();
  await expect(screen.getByRole("link", "Cursor")).toBeVisible();
  await expect(screen.getByRole("listitem").filter({ hasText: title })).toContainText("Caught up");
});
