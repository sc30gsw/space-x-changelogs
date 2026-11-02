import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("pages reject a request that does not carry Basic auth", async ({ app, screen }) => {
  const url = app.baseUrl;
  if (url === undefined) {
    throw new Error("The web target has no base URL.");
  }

  const bare = await fetch(url, { redirect: "manual" });
  expect(bare.status).toBe(401);
  const wrong = await fetch(url, {
    redirect: "manual",
    headers: { authorization: `Basic ${Buffer.from("watcher:incorrect").toString("base64")}` },
  });
  expect(wrong.status).toBe(401);

  await app.open("/tracks/cursor");
  await expect(screen.getByRole("heading", "Cursor")).toBeVisible();
});
