import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("Track 管理 adds a Track and a Source", async ({ app, screen }) => {
  await app.open("/manage");
  await expect(screen.getByRole("heading", "Track 管理")).toBeVisible();
  await expect(screen.getByText("Track を増やしたあとの Watcher 作成は Grok Bot App 側です。")).toBeVisible();

  const create = screen.getByRole("region", "Track を追加");
  await create.getByLabel("名前").fill("検証用");
  await create.getByLabel("slug").fill("e2e-extra");
  await create.getByRole("button", "Track を追加").tap();
  const track = screen.getByRole("region", "検証用");
  await expect(track).toBeVisible();
  await track.getByLabel("ラベル").fill("公開ノート");
  await track.getByLabel("URL").fill("https://example.test/source");
  await track.getByRole("button", "Source を追加").tap();
  await expect(track.getByLabel("ラベル 公開ノート")).toBeVisible();

  await app.open("/tracks/e2e-extra");
  await expect(screen.getByRole("heading", "検証用")).toBeVisible();
  await expect(screen.getByRole("link", "公開ノート")).toBeVisible();
});
