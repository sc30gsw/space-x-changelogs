import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { addEntry, openCursor } from "./support";

test("Spotlight finds an Entry from Memo text and opens it", async ({ app, screen }) => {
  await openCursor(app, screen);
  const title = "検索で開く原文";
  await addEntry(screen, {
    title,
    url: "https://example.test/e2e-spotlight",
    summary: "Memo の文言から詳細へ進みます。",
  });
  await screen.getByRole("link", title).tap();
  await screen.getByRole("region", "Memo").getByRole("textbox").fill("星図のメモ");
  await screen.getByRole("button", "Memo を追加").tap();
  await expect(screen.getByText("星図のメモ")).toBeVisible();

  await screen.getByRole("button", "検索").tap();
  await screen.getByLabel("検索").fill("星図のメモ");
  await screen.getByRole("button", { name: title, exact: false }).tap();
  await expect(screen.getByRole("heading", title)).toBeVisible();
  await expect(screen.getByText("星図のメモ")).toBeVisible();
});
