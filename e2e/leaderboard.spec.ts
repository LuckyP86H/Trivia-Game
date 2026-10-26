import { expect, playRound, test } from "./support";

test.describe("leaderboard on the Worker and D1", () => {
  test("posts a finished daily score and shows it on the home screen", async ({ page }, info) => {
    const nickname = `${info.project.name}-${Date.now()}`.slice(0, 24);
    await page.goto("/");
    await page.getByRole("button", { name: "Play today's challenge" }).click();
    await playRound(page, [true, true, true, true, true]);

    await page.getByLabel("Post your score to the leaderboard").fill(nickname);
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByText("Score posted to today's leaderboard.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Post", exact: true })).toBeDisabled();

    await page.getByRole("button", { name: "Back to home" }).click();
    await expect(page.getByRole("heading", { name: "Today's top scores" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: nickname })).toBeVisible();
  });

  test("the Post button needs a nickname", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Play today's challenge" }).click();
    await playRound(page, [true, false, true, false, true]);
    await expect(page.getByRole("button", { name: "Post", exact: true })).toBeDisabled();
  });

  test("the API sits behind the same origin and rejects a forged score", async ({ request }) => {
    const health = await request.get("/api/health");
    expect(await health.json()).toEqual({ ok: true });

    const forged = await request.post(
      `/api/daily/${new Date().toISOString().slice(0, 10)}/scores`,
      {
        data: {
          playerId: "6f1c4a9e-2f64-4f27-9b51-0f0f6a1b8c01",
          nickname: "cheater",
          points: 99999,
          correct: 5,
          total: 5,
        },
      },
    );
    expect(forged.status()).toBe(400);
  });
});
