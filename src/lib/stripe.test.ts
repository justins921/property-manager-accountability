import { describe, expect, it } from "vitest";
import { onConnectedAccount } from "./stripe";

describe("onConnectedAccount", () => {
  it("pins the call to the connected account", () => {
    expect(onConnectedAccount("acct_1ABCdef", { idempotencyKey: "k" })).toEqual({
      idempotencyKey: "k",
      stripeAccount: "acct_1ABCdef",
    });
  });

  it("refuses to run without a connected account (never falls back to the platform)", () => {
    for (const bad of [null, undefined, "", "  ", "cus_123", "acct_", "acct_1; drop"]) {
      expect(() => onConnectedAccount(bad as string | null | undefined)).toThrow(/No connected Stripe account/);
    }
  });
});
