import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("the Cursor track shows its name and a Source", async ({ app, screen }) => {
  await app.open("/tracks/cursor");
  await expect(screen.getByRole("heading", "Cursor")).toBeVisible();
  await expect(screen.getByRole("link", "Cursor changelog")).toBeVisible();
});
