import { useEffect, useState, type FormEvent } from "react";
import { COACH_FEATURE_VERSION } from "@mtga/contracts";

import {
  ApiError,
  getCoachIdeas,
  getCoachPrototype
} from "../../api";
import type { AppStatus, DeckCard } from "../../types";
import { normalizeCoachIdea, normalizeCoachPrototype } from "./normalizeCoach";
import {
  EMPTY_COACH_BUDGET,
  type CoachCraftBudget,
  type CoachFormat,
  type CoachIdeaView,
  type CoachIdeasRequest,
  type CoachIdeasResponse,
  type CoachPrototypeRequest,
  type CoachPrototypeResponse,
  type CoachPrototypeView
} from "./types";
import {
  CoachAnchorPicker,
  type CoachAnchorSelection
} from "./CoachAnchorPicker";

type CoachSavePayload = {
  name: string;
  format: CoachFormat;
  notes: string;
  cards: DeckCard[];
};

type CoachScreenProps = {
  status: AppStatus | null;
  onOpenCollection: () => void;
  onSave: (
    payload: CoachSavePayload,
    options: { deckId: string | null; openEditor: boolean }
  ) => Promise<string>;
  loadIdeas?: (payload: CoachIdeasRequest) => Promise<CoachIdeasResponse>;
  loadPrototype?: (payload: CoachPrototypeRequest) => Promise<CoachPrototypeResponse>;
};

type PrototypeConstraints = {
  lockedCards: Array<{ cardId: string; quantity?: number }>;
  excludedCardIds: string[];
};

const COACH_PREFERENCES_KEY = "mtga.coach-beta.preferences";
const COACH_SESSION_KEY = "mtga.coach-beta.session";

type PersistedCoachSession = {
  ideasResponse: CoachIdeasResponse | null;
  selectedIdea: CoachIdeaView["source"] | null;
  prototype: CoachPrototypeResponse | null;
  deckName: string;
  constraints: PrototypeConstraints;
  constraintHistory: PrototypeConstraints[];
  savedDeckId: string | null;
};

const hasStructuredSynergy = (idea: CoachIdeaView["source"] | null | undefined) =>
  !idea ||
  (
    idea.source.featureVersion === COACH_FEATURE_VERSION &&
    Array.isArray(idea.evidence?.synergyClaims) &&
    idea.evidence.synergyClaims.length > 0
  );

const loadCoachPreferences = () => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return JSON.parse(window.localStorage.getItem(COACH_PREFERENCES_KEY) ?? "null") as {
      format?: CoachFormat;
      ownedOnly?: boolean;
      budget?: CoachCraftBudget;
      brawlAnchorMode?: "suggest" | "choose";
      anchor?: CoachAnchorSelection | null;
      excludedIdeaFingerprints?: string[];
      constraints?: PrototypeConstraints;
      constraintHistory?: PrototypeConstraints[];
    } | null;
  } catch {
    return null;
  }
};

const loadCoachSession = () => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const session = JSON.parse(
      window.localStorage.getItem(COACH_SESSION_KEY) ?? "null"
    ) as PersistedCoachSession | null;
    if (
      session &&
      (
        session.ideasResponse?.ideas.some((idea) => !hasStructuredSynergy(idea)) ||
        !hasStructuredSynergy(session.selectedIdea) ||
        !hasStructuredSynergy(session.prototype?.idea)
      )
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
};

const RARITY_FIELDS: Array<{ key: keyof CoachCraftBudget; short: string; label: string }> = [
  { key: "common", short: "C", label: "Common" },
  { key: "uncommon", short: "U", label: "Uncommon" },
  { key: "rare", short: "R", label: "Rare" },
  { key: "mythic", short: "M", label: "Mythic" }
];

const formatTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return "Not available";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
};

const budgetLabel = (budget: CoachCraftBudget) =>
  RARITY_FIELDS.map(({ key, short }) => `${short} ${budget[key]}`).join(" · ");

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const isSourceChangedError = (error: unknown) =>
  error instanceof ApiError && error.status === 409 && error.code === "SOURCE_CHANGED";

const synergyCardLine = (claim: CoachIdeaView["synergyClaims"][number]) => {
  const enablers = claim.enablers.map((card) => card.name).join(" + ");
  return `${enablers} ${claim.enablers.length === 1 ? "sets" : "set"} up ${claim.payoff.name}`;
};

function CoachSynergyList({
  claims
}: {
  claims: CoachIdeaView["synergyClaims"];
}) {
  if (claims.length === 0) {
    return null;
  }

  return (
    <ol className="coach-synergy-list">
      {claims.slice(0, 3).map((claim) => (
        <li
          className="coach-synergy-claim"
          key={`${claim.kind}:${claim.enablers.map((card) => card.cardId).join(":")}:${claim.payoff.cardId}`}
        >
          <span>{claim.kind === "commander-engine" ? "Commander synergy" : "Card synergy"}</span>
          <strong>{synergyCardLine(claim)}</strong>
          <p>{claim.explanation}</p>
        </li>
      ))}
    </ol>
  );
}

function CoachTechnicalEvidence({
  idea,
  warnings
}: {
  idea: CoachIdeaView["source"];
  warnings: string[];
}) {
  return (
    <details className="coach-technical-evidence">
      <summary>Data and assumptions</summary>
      <div className="coach-technical-evidence-body">
        <div className="coach-evidence-summary">
          <strong>Collection coverage</strong>
          <span>
            {idea.evidence.ownedThemeCards} possible theme cards · {idea.evidence.enablers}{" "}
            enablers · {idea.evidence.payoffs} payoffs
          </span>
        </div>
        {warnings.slice(0, 3).map((warning, index) => (
          <p className="coach-warning-copy" key={`${index}:${warning}`}>
            {warning}
          </p>
        ))}
        <div className="coach-source-copy">
          <span>Collection {formatTimestamp(idea.source.collectionImportedAt)}</span>
          <span>Catalog {formatTimestamp(idea.source.catalogSyncedAt)}</span>
          <span>Rules {idea.source.featureVersion}</span>
        </div>
        <small>
          These interactions come from card text and your collection, not metagame or win-rate
          data.
        </small>
      </div>
    </details>
  );
}

export function CoachScreen({
  status,
  onOpenCollection,
  onSave,
  loadIdeas = getCoachIdeas,
  loadPrototype = getCoachPrototype
}: CoachScreenProps) {
  const [initialPreferences] = useState(loadCoachPreferences);
  const [initialSession] = useState(loadCoachSession);
  const [format, setFormat] = useState<CoachFormat>(initialPreferences?.format ?? "standard");
  const [ownedOnly, setOwnedOnly] = useState(initialPreferences?.ownedOnly ?? true);
  const [budget, setBudget] = useState<CoachCraftBudget>(
    initialPreferences?.budget ?? EMPTY_COACH_BUDGET
  );
  const [brawlAnchorMode, setBrawlAnchorMode] = useState<"suggest" | "choose">(
    initialPreferences?.brawlAnchorMode ?? "suggest"
  );
  const [anchor, setAnchor] = useState<CoachAnchorSelection | null>(
    initialPreferences?.anchor ?? null
  );
  const [ideasResponse, setIdeasResponse] = useState<CoachIdeasResponse | null>(
    initialSession?.ideasResponse ?? null
  );
  const [ideas, setIdeas] = useState<CoachIdeaView[]>(() =>
    (initialSession?.ideasResponse?.ideas ?? []).slice(0, 3).map(normalizeCoachIdea)
  );
  const [excludedIdeaFingerprints, setExcludedIdeaFingerprints] = useState<string[]>(
    initialPreferences?.excludedIdeaFingerprints ?? []
  );
  const [selectedIdea, setSelectedIdea] = useState<CoachIdeaView | null>(() =>
    initialSession?.selectedIdea ? normalizeCoachIdea(initialSession.selectedIdea) : null
  );
  const [prototype, setPrototype] = useState<CoachPrototypeView | null>(() =>
    initialSession?.prototype ? normalizeCoachPrototype(initialSession.prototype) : null
  );
  const [deckName, setDeckName] = useState(initialSession?.deckName ?? "");
  const [tuning, setTuning] = useState(false);
  const [constraints, setConstraints] = useState<PrototypeConstraints>(
    initialSession?.constraints ??
      initialPreferences?.constraints ?? { lockedCards: [], excludedCardIds: [] }
  );
  const [constraintHistory, setConstraintHistory] = useState<PrototypeConstraints[]>(
    initialSession?.constraintHistory ?? initialPreferences?.constraintHistory ?? []
  );
  const [tuningLoading, setTuningLoading] = useState(false);
  const [savedDeckId, setSavedDeckId] = useState<string | null>(
    initialSession?.savedDeckId ?? null
  );
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [prototypeLoadingId, setPrototypeLoadingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");

  const effectiveBudget = ownedOnly ? EMPTY_COACH_BUDGET : budget;
  const collectionUnavailable = status !== null && status.collection.ownedCopies === 0;
  const catalogUnavailable = status !== null && status.cards.total === 0;
  const commanderMissing = format === "brawl" && brawlAnchorMode === "choose" && !anchor;
  const visibleIdeas = ideas.slice(0, 3);

  const resetGeneratedResults = () => {
    setIdeasResponse(null);
    setIdeas([]);
    setExcludedIdeaFingerprints([]);
    setSelectedIdea(null);
    setPrototype(null);
    setConstraints({ lockedCards: [], excludedCardIds: [] });
    setConstraintHistory([]);
    setSavedDeckId(null);
    setErrorMessage("");
    setNoticeMessage("");
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      COACH_PREFERENCES_KEY,
      JSON.stringify({
        format,
        ownedOnly,
        budget,
        brawlAnchorMode,
        anchor,
        excludedIdeaFingerprints,
        constraints,
        constraintHistory
      })
    );
  }, [
    anchor,
    brawlAnchorMode,
    budget,
    constraintHistory,
    constraints,
    excludedIdeaFingerprints,
    format,
    ownedOnly
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!selectedIdea || !prototype) {
      window.localStorage.removeItem(COACH_SESSION_KEY);
      return;
    }
    const session: PersistedCoachSession = {
      ideasResponse,
      selectedIdea: selectedIdea.source,
      prototype: prototype.source,
      deckName,
      constraints,
      constraintHistory,
      savedDeckId
    };
    window.localStorage.setItem(COACH_SESSION_KEY, JSON.stringify(session));
  }, [
    constraintHistory,
    constraints,
    deckName,
    ideasResponse,
    prototype,
    savedDeckId,
    selectedIdea
  ]);

  const runIdeas = async (
    nextNotice = "",
    nextExcludedIdeaFingerprints = excludedIdeaFingerprints
  ) => {
    setIdeasLoading(true);
    setErrorMessage("");
    setNoticeMessage(nextNotice);
    setSelectedIdea(null);
    setPrototype(null);
    setConstraints({ lockedCards: [], excludedCardIds: [] });
    setConstraintHistory([]);
    setSavedDeckId(null);
    try {
      const response = await loadIdeas({
        format,
        craftBudget: effectiveBudget,
        ...(format === "brawl" && brawlAnchorMode === "choose" && anchor
          ? { commanderCardId: anchor.cardId }
          : format === "standard" && anchor
            ? { anchorCardId: anchor.cardId }
            : {}),
        excludedIdeaFingerprints: nextExcludedIdeaFingerprints,
        excludedConstraintFingerprints: []
      });
      setIdeasResponse(response);
      setIdeas(response.ideas.slice(0, 3).map(normalizeCoachIdea));
      if (response.diagnostics.message) {
        setNoticeMessage(response.diagnostics.message);
      }
    } catch (error) {
      setIdeasResponse(null);
      setIdeas([]);
      setErrorMessage(getErrorMessage(error, "Coach could not generate ideas."));
    } finally {
      setIdeasLoading(false);
    }
  };

  const handleGenerate = (event: FormEvent) => {
    event.preventDefault();
    setExcludedIdeaFingerprints([]);
    void runIdeas("", []);
  };

  const handleSkipIdea = (idea: CoachIdeaView) => {
    const nextExcluded = [
      ...excludedIdeaFingerprints,
      idea.source.ideaFingerprint
    ].slice(-100);
    setExcludedIdeaFingerprints(nextExcluded);
    void runIdeas("Skipped that concept and looked for a replacement.", nextExcluded);
  };

  const handleUndoSkip = () => {
    const nextExcluded = excludedIdeaFingerprints.slice(0, -1);
    setExcludedIdeaFingerprints(nextExcluded);
    void runIdeas("Restored the last skipped concept.", nextExcluded);
  };

  const handleUseDraft = async (idea: CoachIdeaView) => {
    if (!ideasResponse) {
      return;
    }
    setPrototypeLoadingId(idea.id);
    setErrorMessage("");
    setNoticeMessage("");
    try {
      const response = await loadPrototype({
        ideaId: idea.id,
        format,
        craftBudget: effectiveBudget,
        source: ideasResponse.source,
        lockedCards: [],
        excludedCardIds: []
      });
      const nextPrototype = normalizeCoachPrototype(response);
      setSelectedIdea(idea);
      setPrototype(nextPrototype);
      setDeckName(nextPrototype.name);
      setTuning(false);
      setConstraints({ lockedCards: [], excludedCardIds: [] });
      setConstraintHistory([]);
      setSavedDeckId(null);
    } catch (error) {
      if (isSourceChangedError(error)) {
        await runIdeas(
          "Your collection or catalog changed, so Coach refreshed these ideas before you save."
        );
      } else {
        setErrorMessage(getErrorMessage(error, "Coach could not build that prototype."));
      }
    } finally {
      setPrototypeLoadingId(null);
    }
  };

  const rebuildPrototype = async (nextConstraints: PrototypeConstraints) => {
    if (!prototype || !selectedIdea) {
      return;
    }
    setTuningLoading(true);
    setErrorMessage("");
    try {
      const response = await loadPrototype({
        ideaId: selectedIdea.id,
        format,
        craftBudget: effectiveBudget,
        source: prototype.sourceFingerprint,
        lockedCards: nextConstraints.lockedCards,
        excludedCardIds: nextConstraints.excludedCardIds
      });
      setPrototype(normalizeCoachPrototype(response));
      setConstraints(nextConstraints);
      setSavedDeckId(null);
    } catch (error) {
      if (isSourceChangedError(error)) {
        await runIdeas(
          "Your collection or catalog changed, so Coach refreshed these ideas before you save."
        );
      } else {
        setErrorMessage(getErrorMessage(error, "Coach could not rebuild that prototype."));
      }
    } finally {
      setTuningLoading(false);
    }
  };

  const applyConstraints = (nextConstraints: PrototypeConstraints) => {
    setConstraintHistory((current) => [...current, constraints].slice(-20));
    void rebuildPrototype(nextConstraints);
  };

  const handleUndoConstraint = () => {
    const previous = constraintHistory.at(-1);
    if (!previous) {
      return;
    }
    setConstraintHistory((current) => current.slice(0, -1));
    void rebuildPrototype(previous);
  };

  const handleSave = async (openEditor: boolean) => {
    if (!prototype || !selectedIdea || !deckName.trim()) {
      return;
    }
    setSaving(true);
    setErrorMessage("");
    try {
      // Rebuild immediately before persistence so a restored browser session
      // cannot save against a collection or catalog that changed underneath it.
      const latestResponse = await loadPrototype({
        ideaId: selectedIdea.id,
        format,
        craftBudget: effectiveBudget,
        source: prototype.sourceFingerprint,
        lockedCards: constraints.lockedCards,
        excludedCardIds: constraints.excludedCardIds
      });
      const latestPrototype = normalizeCoachPrototype(latestResponse);
      setPrototype(latestPrototype);
      const nextDeckId = await onSave(
        {
          name: deckName.trim(),
          format: latestPrototype.format,
          notes: `Coach Beta · ${selectedIdea.description}`,
          cards: latestPrototype.cards.map(({ cardId, quantity, section }) => ({
            cardId,
            quantity,
            section
          }))
        },
        { deckId: savedDeckId, openEditor }
      );
      setSavedDeckId(nextDeckId);
      if (!openEditor) {
        setNoticeMessage(`Saved ${deckName.trim()} to Decks.`);
      }
    } catch (error) {
      if (isSourceChangedError(error)) {
        await runIdeas(
          "Your collection or catalog changed, so Coach refreshed these ideas before you save."
        );
      } else {
        setErrorMessage(getErrorMessage(error, "Coach could not save this deck."));
      }
    } finally {
      setSaving(false);
    }
  };

  if (collectionUnavailable || catalogUnavailable) {
    return (
      <section className="panel coach-empty-panel">
        <span className="coach-eyebrow">Coach Beta</span>
        <h2>{catalogUnavailable ? "Load the Arena catalog first" : "Connect your collection first"}</h2>
        <p>
          Coach uses your local collection and current card legalities to build grounded deck
          prototypes. It cannot recommend a deck until both are available.
        </p>
        <button className="primary-button" onClick={onOpenCollection} type="button">
          Open Collection
        </button>
      </section>
    );
  }

  if (selectedIdea && prototype) {
    const totalCards = prototype.cards.reduce((total, card) => total + card.quantity, 0);
    const saveBlocked =
      !prototype.isLegal || prototype.concerns.some((concern) => concern.severity === "blocking");

    return (
      <div className="coach-flow" aria-labelledby="coach-review-title">
        <section className="panel coach-review-hero">
          <button
            className="ghost-button subtle-button coach-back-button"
            onClick={() => {
              setSelectedIdea(null);
              setPrototype(null);
              setTuning(false);
            }}
            type="button"
          >
            ← Back to ideas
          </button>
          <div className="coach-review-heading">
            <div>
              <span className="coach-eyebrow">Review prototype</span>
              <h2 id="coach-review-title">{selectedIdea.name}</h2>
              <p>{selectedIdea.description}</p>
            </div>
            <div className="coach-readiness" aria-label="Prototype readiness">
              <strong>{totalCards}</strong>
              <span>{prototype.format === "brawl" ? "of 100 cards" : "of 60 cards"}</span>
              <small>{prototype.isLegal ? "Prototype is format legal" : "Needs review"}</small>
            </div>
          </div>

          {noticeMessage ? (
            <div className="coach-callout" role="status">
              {noticeMessage}
            </div>
          ) : null}

          {prototype.validationIssues.length > 0 ? (
            <div className="coach-callout warning" role="status">
              <strong>Before you play</strong>
              <ul>
                {prototype.validationIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {prototype.concerns.some((concern) => concern.severity === "blocking") ? (
            <div className="coach-callout warning" role="alert">
              <strong>Blocking concerns</strong>
              <ul>
                {prototype.concerns
                  .filter((concern) => concern.severity === "blocking")
                  .slice(0, 3)
                  .map((concern) => (
                    <li key={concern.code}>{concern.detail}</li>
                  ))}
              </ul>
            </div>
          ) : null}

          <div className="coach-review-toolbar">
            <label className="field coach-name-field">
              <span>Deck name</span>
              <input value={deckName} onChange={(event) => setDeckName(event.target.value)} />
            </label>
            <div className="coach-review-actions">
              <button
                className={tuning ? "ghost-button active" : "ghost-button"}
                onClick={() => setTuning((current) => !current)}
                type="button"
              >
                {tuning ? "Finish tuning" : "Tune this deck"}
              </button>
              <button
                className="ghost-button"
                disabled={saving || saveBlocked || !deckName.trim()}
                onClick={() => void handleSave(false)}
                type="button"
              >
                {saving ? "Saving…" : savedDeckId ? "Update saved draft" : "Use this draft"}
              </button>
              <button
                className="primary-button"
                disabled={saving || saveBlocked || !deckName.trim()}
                onClick={() => void handleSave(true)}
                type="button"
              >
                {saving ? "Saving…" : "Save and edit"}
              </button>
            </div>
          </div>
          <p className="coach-save-hint">
            Use this draft saves locally. Save and edit also opens the existing deck editor.
            {saveBlocked ? " Resolve blocking validation concerns before saving." : ""}
          </p>
        </section>

        {errorMessage ? (
          <div className="banner error" role="alert">
            {errorMessage}
          </div>
        ) : null}

        <div className="coach-review-layout">
          <section className="panel coach-prototype-panel">
            <div className="panel-header">
              <div>
                <h2>Prototype</h2>
                <span>Grouped into a few deckbuilding decisions.</span>
              </div>
            </div>
            <div className="coach-prototype-sections">
              {prototype.sections.map((section) => {
                const sectionCards = section.cards;
                if (!sectionCards.length) {
                  return null;
                }
                return (
                  <section className="coach-card-group" key={section.label}>
                    <div className="coach-group-heading">
                      <h3>{section.label}</h3>
                      <span>{sectionCards.reduce((sum, card) => sum + card.quantity, 0)} cards</span>
                    </div>
                    <div className="coach-card-list">
                      {sectionCards.map((card) => (
                        <div className="coach-card-row" key={`${card.cardId}:${card.section}`}>
                          <div>
                            <strong>{card.name}</strong>
                            <span>
                              {card.quantity} needed · {card.ownedCount} owned
                              {card.missingCount > 0
                                ? ` · ${card.missingCount} estimated ${card.rarity} wildcard${
                                    card.missingCount === 1 ? "" : "s"
                                  }`
                                : ""}
                            </span>
                          </div>
                          {tuning && card.section !== "commander" ? (
                            <div className="coach-card-tune-actions">
                              <button
                                className="ghost-button subtle-button"
                                disabled={
                                  tuningLoading ||
                                  (format === "standard" && anchor?.cardId === card.cardId) ||
                                  constraints.lockedCards.some(
                                    (locked) => locked.cardId === card.cardId
                                  )
                                }
                                onClick={() =>
                                  applyConstraints({
                                    ...constraints,
                                    lockedCards: [
                                      ...constraints.lockedCards,
                                      { cardId: card.cardId, quantity: card.quantity }
                                    ]
                                  })
                                }
                                type="button"
                              >
                                {format === "standard" && anchor?.cardId === card.cardId
                                  ? "Required anchor"
                                  : constraints.lockedCards.some(
                                  (locked) => locked.cardId === card.cardId
                                )
                                  ? "Pinned"
                                  : "Pin"}
                              </button>
                              <button
                                className="ghost-button subtle-button"
                                disabled={
                                  tuningLoading ||
                                  (format === "standard" && anchor?.cardId === card.cardId)
                                }
                                onClick={() =>
                                  applyConstraints({
                                    ...constraints,
                                    lockedCards: constraints.lockedCards.filter(
                                      (locked) => locked.cardId !== card.cardId
                                    ),
                                    excludedCardIds: [
                                      ...new Set([...constraints.excludedCardIds, card.cardId])
                                    ]
                                  })
                                }
                                type="button"
                              >
                                {format === "standard" && anchor?.cardId === card.cardId
                                  ? "Kept in draft"
                                  : format === "brawl"
                                    ? "Off theme"
                                    : "Exclude"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </section>

          <aside className="coach-review-sidebar">
            {tuning ? (
              <section className="panel coach-tune-panel">
                <div className="panel-header">
                  <div>
                    <h2>Tune safely</h2>
                    <span>Coach rebuilds the full legal prototype after each choice.</span>
                  </div>
                </div>
                {constraintHistory.length > 0 ? (
                  <button
                    className="ghost-button subtle-button"
                    disabled={tuningLoading}
                    onClick={handleUndoConstraint}
                    type="button"
                  >
                    Undo last change
                  </button>
                ) : null}
                {prototype.concerns.length > 0 ? (
                  <div className="coach-concern-list">
                    {prototype.concerns.slice(0, 3).map((concern) => (
                      <div className={`coach-concern ${concern.severity}`} key={concern.code}>
                        <strong>{concern.title}</strong>
                        <span>{concern.detail}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {prototype.replacements.length > 0 ? (
                  <div className="coach-replacement-list">
                    <strong>Up to three replacements</strong>
                    {prototype.replacements.slice(0, 3).map((replacement) => (
                      <div className="coach-replacement" key={`${replacement.forCardId}:${replacement.card.cardId}`}>
                        <div>
                          <strong>{replacement.card.name}</strong>
                          <span>{replacement.reason}</span>
                        </div>
                        <button
                          className="ghost-button subtle-button"
                          disabled={tuningLoading}
                          onClick={() =>
                            applyConstraints({
                              lockedCards: [
                                ...constraints.lockedCards.filter(
                                  (locked) =>
                                    locked.cardId !== replacement.card.cardId &&
                                    locked.cardId !== replacement.forCardId
                                ),
                                { cardId: replacement.card.cardId }
                              ],
                              excludedCardIds: replacement.forCardId
                                ? [
                                    ...new Set([
                                      ...constraints.excludedCardIds,
                                      replacement.forCardId
                                    ])
                                  ]
                                : constraints.excludedCardIds
                            })
                          }
                          type="button"
                        >
                          Use replacement
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">No grounded replacement suggestions right now.</p>
                )}
                {tuningLoading ? <span aria-live="polite">Rebuilding prototype…</span> : null}
              </section>
            ) : null}
            <details className="panel coach-why-panel">
              <summary className="coach-why-summary">Why this list?</summary>
              <div className="coach-why-body">
                <h3>How the cards work together</h3>
                {prototype.synergyClaims.length > 0 ? (
                  <CoachSynergyList claims={prototype.synergyClaims} />
                ) : (
                  <p>{prototype.reasons[0]}</p>
                )}
                <CoachTechnicalEvidence
                  idea={prototype.source.idea}
                  warnings={prototype.warnings}
                />
              </div>
            </details>
            <section className="panel coach-pulse-panel">
              <div className="panel-header">
                <h2>Deck pulse</h2>
              </div>
              <div className="coach-pulse-list">
                {prototype.themeDensity ? (
                  <div>
                    <span>Theme density</span>
                    <strong>
                      {prototype.themeDensity.count}/{prototype.themeDensity.target} · Direct support
                    </strong>
                  </div>
                ) : null}
                {prototype.roleCoverage.map((coverage) => (
                  <div key={coverage.role}>
                    <span>{coverage.role}</span>
                    <strong>
                      {coverage.current}/{coverage.target} · {coverage.status === "met" ? "Covered" : "Thin"}
                    </strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel coach-cost-panel">
              <div className="panel-header">
                <h2>Estimated wildcards</h2>
              </div>
              <div className="coach-budget-summary">
                {RARITY_FIELDS.map(({ key, label }) => (
                  <div key={key}>
                    <span>{label}</span>
                    <strong>{prototype.craftCost[key]}</strong>
                  </div>
                ))}
              </div>
              <small>
                Estimates use card rarity and your collection snapshot. Coach cannot read your
                current Arena wildcard balance.
              </small>
            </section>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="coach-flow" aria-labelledby="coach-title">
      <section className="panel coach-choose-panel">
        <div className="coach-intro">
          <div>
            <span className="coach-eyebrow">Coach Beta</span>
            <h2 id="coach-title">Find a deck hiding in your collection</h2>
            <p>
              Choose a format and a crafting limit. Coach returns up to three deterministic,
              collection-fit ideas—not an endless card list.
            </p>
          </div>
          <dl className="coach-source-freshness">
            <div>
              <dt>Collection updated</dt>
              <dd>{formatTimestamp(status?.collection.importedAt)}</dd>
            </div>
            <div>
              <dt>Catalog updated</dt>
              <dd>{formatTimestamp(status?.cardData.syncedAt ?? status?.cardData.sourceUpdatedAt)}</dd>
            </div>
          </dl>
        </div>

        <form className="coach-controls" onSubmit={handleGenerate}>
          <fieldset className="coach-choice-fieldset">
            <legend>Format</legend>
            <div className="coach-segmented-control">
              {(["standard", "brawl"] as CoachFormat[]).map((option) => (
                <label className={format === option ? "active" : ""} key={option}>
                  <input
                    checked={format === option}
                    name="coach-format"
                    onChange={() => {
                      setFormat(option);
                      setAnchor(null);
                      resetGeneratedResults();
                    }}
                    type="radio"
                    value={option}
                  />
                  <span>{option === "standard" ? "Standard BO1" : "Brawl · 100 cards"}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="coach-choice-fieldset coach-anchor-fieldset">
            <legend>{format === "brawl" ? "Commander" : "Anchor card"}</legend>
            {format === "brawl" ? (
              <div className="coach-segmented-control">
                <label className={brawlAnchorMode === "suggest" ? "active" : ""}>
                  <input
                    checked={brawlAnchorMode === "suggest"}
                    name="coach-commander-mode"
                    onChange={() => {
                      setBrawlAnchorMode("suggest");
                      setAnchor(null);
                      resetGeneratedResults();
                    }}
                    type="radio"
                  />
                  <span>Suggest one</span>
                </label>
                <label className={brawlAnchorMode === "choose" ? "active" : ""}>
                  <input
                    checked={brawlAnchorMode === "choose"}
                    name="coach-commander-mode"
                    onChange={() => {
                      setBrawlAnchorMode("choose");
                      resetGeneratedResults();
                    }}
                    type="radio"
                  />
                  <span>Build around mine</span>
                </label>
              </div>
            ) : null}
            {format === "standard" || brawlAnchorMode === "choose" ? (
              <CoachAnchorPicker
                format={format}
                hint={
                  format === "brawl"
                    ? "Choose an owned, Brawl-legal commander."
                    : "Optional. Leave blank to let Coach find a collection anchor."
                }
                label={format === "brawl" ? "Owned commander" : "Optional owned card"}
                selected={anchor}
                onChange={(nextAnchor) => {
                  setAnchor(nextAnchor);
                  resetGeneratedResults();
                }}
              />
            ) : (
              <small>Coach will choose an owned commander that supports a coherent plan.</small>
            )}
          </fieldset>

          <fieldset className="coach-choice-fieldset coach-budget-fieldset">
            <legend>Crafting</legend>
            <label className={ownedOnly ? "coach-owned-toggle active" : "coach-owned-toggle"}>
              <input
                checked={ownedOnly}
                onChange={(event) => {
                  setOwnedOnly(event.target.checked);
                  resetGeneratedResults();
                }}
                type="checkbox"
              />
              <span>
                <strong>Owned only</strong>
                <small>Use zero estimated wildcards</small>
              </span>
            </label>

            {!ownedOnly ? (
              <div className="coach-budget-controls">
                <p>
                  Set a per-brew limit. These are not your live Arena balances.
                </p>
                <div className="coach-budget-grid">
                  {RARITY_FIELDS.map(({ key, label }) => (
                    <label className="field" key={key}>
                      <span>{label}</span>
                      <input
                        aria-label={`${label} wildcard limit`}
                        inputMode="numeric"
                        max={100}
                        min={0}
                        onChange={(event) => {
                          setBudget((current) => ({
                            ...current,
                            [key]: Math.min(100, Math.max(0, Number(event.target.value) || 0))
                          }));
                          resetGeneratedResults();
                        }}
                        type="number"
                        value={budget[key]}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </fieldset>

          <button
            className="primary-button coach-find-button"
            disabled={ideasLoading || status === null || commanderMissing}
            type="submit"
          >
            {ideasLoading ? "Finding up to three ideas…" : "Find up to three ideas"}
          </button>
          {commanderMissing ? (
            <p className="coach-form-hint" role="status">
              Choose one of your owned commanders before finding ideas.
            </p>
          ) : null}
        </form>
      </section>

      {errorMessage ? (
        <div className="banner error" role="alert">
          {errorMessage}
        </div>
      ) : null}
      {noticeMessage ? (
        <div className="coach-callout" role="status">
          {noticeMessage}
        </div>
      ) : null}

      {ideasLoading ? (
        <section aria-label="Coach ideas loading" className="coach-ideas-grid">
          {[1, 2, 3].map((item) => (
            <div className="panel coach-idea-card coach-idea-skeleton" key={item} />
          ))}
        </section>
      ) : null}

      {!ideasLoading && ideasResponse ? (
        <section aria-labelledby="coach-ideas-title">
          <div className="coach-results-heading">
            <div>
              <span className="coach-eyebrow">Built from your snapshot</span>
              <h2 id="coach-ideas-title">Up to three paths worth considering</h2>
            </div>
            <span>
              {format === "standard" ? "Standard BO1" : "Brawl"} ·{" "}
              {ownedOnly ? "Owned only" : `Estimated wildcards ${budgetLabel(effectiveBudget)}`}
            </span>
            {excludedIdeaFingerprints.length > 0 ? (
              <button
                className="ghost-button subtle-button"
                disabled={ideasLoading}
                onClick={handleUndoSkip}
                type="button"
              >
                Undo last skip
              </button>
            ) : null}
          </div>

          {visibleIdeas.length > 0 ? (
            <div className="coach-ideas-grid">
              {visibleIdeas.map((idea) => (
                <article className="panel coach-idea-card" key={idea.id}>
                  <div className="coach-idea-header">
                    <div>
                      <span className="coach-color-label">
                        {idea.colors.length ? idea.colors.join(" · ") : "Colorless"}
                      </span>
                      <h3>{idea.name}</h3>
                    </div>
                    <span className="coach-ready-badge">
                      {Object.values(idea.craftCost).some((count) => count > 0)
                        ? "Within budget"
                        : "Ready now"}
                    </span>
                  </div>
                  <p>{idea.description}</p>
                  <div className="coach-ownership-line">
                    <strong>
                      {idea.ownedCopies}/{idea.totalCopies}
                    </strong>
                    <span>nonbasic copies owned</span>
                  </div>
                  <div className="coach-budget-line">
                    <span>Estimated wildcards</span>
                    <strong>{budgetLabel(idea.craftCost)}</strong>
                  </div>
                  {idea.anchors.length > 0 ? (
                    <div className="coach-anchor-list">
                      <span>Built around</span>
                      <strong>{idea.anchors.join(" · ")}</strong>
                    </div>
                  ) : null}
                  <details className="coach-why-list">
                    {idea.synergyClaims[0] ? (
                      <summary className="coach-synergy-summary">
                        <span>Why this list</span>
                        <strong>{synergyCardLine(idea.synergyClaims[0])}</strong>
                        <small>{idea.synergyClaims[0].explanation}</small>
                      </summary>
                    ) : (
                      <summary className="coach-synergy-summary">
                        <span>Why this list</span>
                        <small>{idea.reasons[0]}</small>
                      </summary>
                    )}
                    {idea.synergyClaims.length > 1 ? (
                      <>
                        <h4>More ways the cards connect</h4>
                        <CoachSynergyList claims={idea.synergyClaims.slice(1)} />
                      </>
                    ) : null}
                    <CoachTechnicalEvidence idea={idea.source} warnings={idea.warnings} />
                  </details>
                  <div className="coach-idea-actions">
                    <button
                      className="primary-button"
                      disabled={Boolean(prototypeLoadingId)}
                      onClick={() => void handleUseDraft(idea)}
                      type="button"
                    >
                      {prototypeLoadingId === idea.id ? "Building prototype…" : "Review draft"}
                    </button>
                    <button
                      className="ghost-button subtle-button"
                      disabled={Boolean(prototypeLoadingId)}
                      onClick={() => handleSkipIdea(idea)}
                      type="button"
                    >
                      Skip
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="panel coach-no-ideas">
              <h3>No coherent ideas fit yet</h3>
              <p>
                Try allowing a small estimated wildcard budget, choose the other format, or undo
                the last skipped concept.
              </p>
              {excludedIdeaFingerprints.length > 0 ? (
                <button
                  className="ghost-button"
                  onClick={handleUndoSkip}
                  type="button"
                >
                  Undo last skip
                </button>
              ) : null}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

export type { CoachSavePayload };
