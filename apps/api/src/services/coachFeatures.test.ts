import { describe, expect, it } from "vitest";

import { classifyCoachCard } from "./coachFeatures.js";

const classify = (oracleText: string, typeLine = "Instant", mechanics: string[] = []) =>
  classifyCoachCard({
    oracleText,
    typeLine,
    manaValue: 2,
    keywords: [],
    mechanics
  });

describe("Coach deterministic feature rules", () => {
  it("strips parenthetical reminder text before classifying graveyard themes", () => {
    const features = classify(
      "Target opponent sacrifices a creature. Delirium — (There are four or more card types among cards in your graveyard.)"
    );

    expect(features.themes.has("graveyard")).toBe(false);
  });

  it("does not treat opponent discard as stocking your graveyard", () => {
    const auntiesSentence = classify(
      "Choose one — Target opponent reveals their hand. You choose a nonland permanent card from it. That player discards that card. Target creature gets -2/-2 until end of turn.",
      "Sorcery",
      ["discard"]
    );
    const optionalOpponentDiscard = classify(
      "Target opponent may discard a card.",
      "Sorcery",
      ["discard"]
    );
    const ownDiscardCost = classify(
      "As an additional cost to cast this spell, discard a card.",
      "Sorcery",
      ["discard"]
    );

    expect(auntiesSentence.themes.has("graveyard")).toBe(false);
    expect(optionalOpponentDiscard.themes.has("graveyard")).toBe(false);
    expect(ownDiscardCost.themes.get("graveyard")?.some((item) => item.relation === "enabler")).toBe(true);
  });

  it("does not treat opponent mill as stocking your graveyard", () => {
    const opponentMill = classify(
      "Target opponent mills three cards.",
      "Sorcery",
      ["self-mill"]
    );
    const ownMill = classify("Mill three cards.", "Sorcery", ["self-mill"]);

    expect(
      (opponentMill.themes.get("graveyard") ?? []).some((item) => item.relation === "enabler")
    ).toBe(false);
    expect(
      (ownMill.themes.get("graveyard") ?? []).some((item) => item.relation === "enabler")
    ).toBe(true);
  });

  it("does not treat a generic bounce spell as graveyard recursion", () => {
    const falseRecursion = classify(
      "Return up to one other target artifact you control to its owner's hand. Scry 1.",
      "Creature — Human",
      ["graveyard-recursion"]
    );
    const trueRecursion = classify(
      "Return target creature card from your graveyard to your hand.",
      "Sorcery",
      ["graveyard-recursion"]
    );

    expect(
      (falseRecursion.themes.get("graveyard") ?? []).some((item) => item.relation === "payoff")
    ).toBe(false);
    expect(
      (trueRecursion.themes.get("graveyard") ?? []).some((item) => item.relation === "payoff")
    ).toBe(true);
  });

  it("does not call a generic team pump a token payoff", () => {
    const features = classify(
      "Creatures you control get +1/+0 and gain indestructible until end of turn.",
      "Instant",
      ["token-payoff"]
    );
    expect(features.themes.has("tokens")).toBe(false);
  });

  it("does not mistake counter and lifegain payoffs for their own enablers", () => {
    const counterPayoff = classify(
      "Creatures you control with +1/+1 counters on them have trample.",
      "Enchantment",
      ["counters-plus-one"]
    );
    const lifegainPayoff = classify(
      "Whenever you gain life, put a +1/+1 counter on this creature.",
      "Creature — Cat",
      ["lifegain", "lifegain-payoff", "counters-plus-one"]
    );

    expect(
      (counterPayoff.themes.get("counters") ?? []).some((item) => item.relation === "enabler")
    ).toBe(false);
    expect(
      (lifegainPayoff.themes.get("lifegain") ?? []).some((item) => item.relation === "enabler")
    ).toBe(false);
    expect(
      (lifegainPayoff.themes.get("lifegain") ?? []).some((item) => item.relation === "payoff")
    ).toBe(true);
    expect(
      (lifegainPayoff.themes.get("counters") ?? []).some((item) => item.relation === "enabler")
    ).toBe(true);
  });

  it("does not call temporary dies-and-return protection a sacrifice payoff", () => {
    const features = classify(
      "Target creature gains ‘When this creature dies, return it to the battlefield tapped under its owner's control with a +1/+1 counter on it.’ until end of turn."
    );
    expect(
      (features.themes.get("sacrifice") ?? []).some((item) => item.relation === "payoff")
    ).toBe(false);
  });

  it("does not treat an opponent edict as your sacrifice outlet", () => {
    const opponentEdict = classify(
      "Target opponent sacrifices a creature.",
      "Sorcery",
      ["sacrifice"]
    );
    const ownOutlet = classify(
      "Sacrifice another creature: Draw a card.",
      "Creature — Vampire",
      ["sacrifice"]
    );

    expect(
      (opponentEdict.themes.get("sacrifice") ?? []).some((item) => item.relation === "enabler")
    ).toBe(false);
    expect(
      (ownOutlet.themes.get("sacrifice") ?? []).some((item) => item.relation === "enabler")
    ).toBe(true);
  });

  it("does not mistake sacrifice and discard payoff triggers for enablers", () => {
    const sacrificePayoff = classify(
      "Whenever you sacrifice another permanent, put a +1/+1 counter on this creature.",
      "Creature — Pirate",
      ["sacrifice"]
    );
    const discardPayoff = classify(
      "Whenever you discard a card, each opponent loses 1 life.",
      "Creature — Warlock",
      ["discard", "discard-payoff"]
    );

    expect(
      (sacrificePayoff.themes.get("sacrifice") ?? []).some((item) => item.relation === "enabler")
    ).toBe(false);
    expect(
      (sacrificePayoff.themes.get("sacrifice") ?? []).some((item) => item.relation === "payoff")
    ).toBe(true);
    expect(
      (discardPayoff.themes.get("graveyard") ?? []).some((item) => item.relation === "enabler")
    ).toBe(false);
  });

  it("distinguishes a real blink effect from an ETB-only removal permanent", () => {
    const blink = classify(
      "Exile another target creature you control, then return that card to the battlefield under its owner's control.",
      "Creature — Spirit"
    );
    const banishingLight = classify(
      "When this enchantment enters, exile target nonland permanent an opponent controls until this enchantment leaves the battlefield.",
      "Enchantment"
    );

    expect(blink.themes.get("blink-etb")?.some((item) => item.relation === "enabler")).toBe(true);
    expect(banishingLight.themes.get("blink-etb")?.some((item) => item.relation === "enabler")).not.toBe(true);
  });

  it("does not call an enters-matters payoff a reusable ETB effect", () => {
    const entersPayoff = classify(
      "Whenever another creature enters, put a +1/+1 counter on this creature.",
      "Creature — Elf",
      ["enter-the-battlefield", "counters-plus-one"]
    );

    expect(
      (entersPayoff.themes.get("blink-etb") ?? []).some((item) => item.relation === "payoff")
    ).toBe(false);
  });
});
