import { describe, expect, it } from "vitest";
import { dueCount, isDue, mastery, review } from "./leitner";

const D = "2026-10-25";

describe("Leitner scheduling", () => {
  it("moves a correct card up a box and delays it", () => {
    let deck = review({}, "q", true, D);
    expect(deck.q).toEqual({ box: 1, due: "2026-10-26" });
    deck = review(deck, "q", true, "2026-10-26");
    expect(deck.q).toEqual({ box: 2, due: "2026-10-28" });
  });

  it("sends a missed card back to box 1, due today", () => {
    let deck = review({}, "q", true, D);
    deck = review(deck, "q", true, D);
    deck = review(deck, "q", false, D);
    expect(deck.q).toEqual({ box: 1, due: D });
    expect(isDue(deck, "q", D)).toBe(true);
  });

  it("caps at box 5 with the longest wait", () => {
    let deck = {};
    for (let i = 0; i < 9; i++) deck = review(deck, "q", true, D);
    expect(deck).toEqual({ q: { box: 5, due: "2026-11-10" } });
  });

  it("knows what is due and never touches the old deck", () => {
    const before = review({}, "a", false, D);
    const after = review(before, "b", true, D);
    expect(Object.keys(before)).toEqual(["a"]);
    expect(dueCount(after, D)).toBe(1);
    expect(dueCount(after, "2026-10-26")).toBe(2);
    expect(isDue(after, "unknown", D)).toBe(false);
  });

  it("reports mastery as progress through the boxes", () => {
    expect(mastery({}, 10)).toBe(0);
    expect(mastery({ a: { box: 5, due: D }, b: { box: 5, due: D } }, 2)).toBe(100);
    expect(mastery({}, 0)).toBe(0);
  });
});
