import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { addEntry, openCursor } from "./support";

test("the same 原文 URL overwrites one Entry and keeps Memo and Caught up", async ({ app, screen }) => {
  await openCursor(app, screen);
  const url = "https://example.test/e2e-overwrite";
  const first = "最初の原文";
  const next = "上書きした原文";
  await addEntry(screen, { title: first, url, summary: "最初の要約です。" });
  await expect(screen.getByRole("listitem").filter({ hasText: first })).toContainText("Unread");

  await screen.getByRole("checkbox", `Caught up ${first}`).tap();
  await expect(screen.getByRole("checkbox", `Caught up ${first}`)).toBeChecked();
  await screen.getByRole("link", first).tap();
  await expect(screen.getByRole("heading", first)).toBeVisible();
  await expect(screen.getByRole("switch", "Caught up")).toBeChecked();
  await screen.getByRole("region", "Memo").getByRole("textbox").fill("上書きしても残る学び");
  await screen.getByRole("button", "Memo を追加").tap();
  await expect(screen.getByText("上書きしても残る学び")).toBeVisible();

  await screen.getByRole("navigation").getByRole("link", "Cursor").tap();
  await addEntry(screen, { title: next, url, summary: "上書きした要約です。" });
  await expect(screen.getByRole("list", "Entry").getByRole("link", next)).toHaveCount(1);
  await expect(screen.getByRole("link", first)).toHaveCount(0);
  await expect(screen.getByRole("checkbox", `Caught up ${next}`)).toBeChecked();
  await expect(screen.getByRole("list", "Entry").getByText("上書きした要約です。")).toBeVisible();

  await screen.getByRole("link", next).tap();
  await expect(screen.getByRole("heading", next)).toBeVisible();
  await expect(screen.getByRole("switch", "Caught up")).toBeChecked();
  await expect(screen.getByText("上書きしても残る学び")).toBeVisible();
});
