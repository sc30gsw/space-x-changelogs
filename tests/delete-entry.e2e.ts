import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { addEntry, openCursor } from "./support";

test("confirming delete removes the Entry and its Memo", async ({ app, screen }) => {
  await openCursor(app, screen);
  const title = "削除する原文";
  await addEntry(screen, {
    title,
    url: "https://example.test/e2e-delete",
    summary: "確認した削除で Entry と Memo が消えます。",
  });
  await screen.getByRole("link", title).tap();
  await screen.getByRole("region", "Memo").getByRole("textbox").fill("一緒に消えるメモ");
  await screen.getByRole("button", "Memo を追加").tap();
  await expect(screen.getByText("一緒に消えるメモ")).toBeVisible();

  await screen.getByRole("button", "削除").tap();
  await screen.getByRole("button", "削除する").tap();
  await expect(screen.getByRole("heading", "Entry")).toBeVisible();
  await expect(screen.getByText("この Entry はありません。")).toBeVisible();

  await screen.getByRole("button", "検索").tap();
  await screen.getByLabel("検索").fill("一緒に消えるメモ");
  await expect(screen.getByText("一致する Entry はありません")).toBeVisible();
  await app.open("/tracks/cursor");
  await expect(screen.getByRole("link", title)).toHaveCount(0);
});
