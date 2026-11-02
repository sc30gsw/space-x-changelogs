import { expect, type Screen } from "e2e";

export const openCursor = async (
  app: { open(path?: string): Promise<void> },
  screen: Screen,
): Promise<void> => {
  await app.open("/tracks/cursor");
  await expect(screen.getByRole("heading", "Cursor")).toBeVisible();
};

export const catchUpCursor = async (screen: Screen): Promise<void> => {
  const button = screen.getByRole("button", "全部 Caught up にする");
  if (await button.isEnabled()) {
    await button.tap();
  }
  await expect(screen.getByRole("link", "Cursor")).toBeVisible();
};

export const addEntry = async (
  screen: Screen,
  input: { readonly title: string; readonly url: string; readonly summary: string },
): Promise<void> => {
  const region = screen.getByRole("region", "Entry を追加");
  await region.getByLabel("原文タイトル").fill(input.title);
  await region.getByLabel("原文 URL").fill(input.url);
  await region.getByLabel("要約").fill(input.summary);
  await region.getByRole("button", "Entry を追加").tap();
  await expect(screen.getByRole("link", input.title)).toBeVisible();
};
