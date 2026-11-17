import { useEffect, useState } from "react";

import { searchCards } from "../../api";
import type { CardSummary } from "../../types";
import type { CoachFormat } from "./types";

export type CoachAnchorSelection = {
  cardId: string;
  name: string;
};

type CoachAnchorPickerProps = {
  format: CoachFormat;
  label: string;
  hint: string;
  selected: CoachAnchorSelection | null;
  onChange: (selection: CoachAnchorSelection | null) => void;
};

export const isBrawlCommanderCandidate = (card: CardSummary) => {
  const typeLine = (card.typeLine.split("//", 1)[0] ?? "").toLowerCase();
  const oracleText = card.oracleText.toLowerCase();
  return (
    typeLine.includes("planeswalker") ||
    (typeLine.includes("legendary") && typeLine.includes("creature")) ||
    oracleText.includes("can be your commander")
  );
};

export function CoachAnchorPicker({
  format,
  label,
  hint,
  selected,
  onChange
}: CoachAnchorPickerProps) {
  const [query, setQuery] = useState(selected?.name ?? "");
  const [results, setResults] = useState<CardSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState("");

  useEffect(() => {
    setQuery(selected?.name ?? "");
  }, [selected]);

  useEffect(() => {
    const trimmed = query.trim();
    if (selected || trimmed.length < 2) {
      setResults([]);
      setResultMessage("");
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      const params = new URLSearchParams({
        q: trimmed,
        format,
        ownedOnly: "true",
        page: "1",
        pageSize: "12"
      });
      setLoading(true);
      setResultMessage("");
      void searchCards(params)
        .then((response) => {
          if (cancelled) {
            return;
          }
          const eligible =
            format === "brawl"
              ? response.items.filter(isBrawlCommanderCandidate)
              : response.items;
          const nextResults = eligible.slice(0, 6);
          setResults(nextResults);
          setResultMessage(nextResults.length ? "" : "No owned, format-legal matches found.");
        })
        .catch(() => {
          if (!cancelled) {
            setResults([]);
            setResultMessage("Owned-card search is unavailable right now. Try again in a moment.");
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [format, query, selected]);

  return (
    <div className="coach-anchor-picker">
      <label className="field">
        <span>{label}</span>
        <input
          autoComplete="off"
          placeholder={format === "brawl" ? "Search owned commanders" : "Search owned cards"}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (selected) {
              onChange(null);
            }
          }}
        />
      </label>
      <small>{hint}</small>
      {loading ? <span className="coach-anchor-status">Searching your collection…</span> : null}
      {resultMessage ? (
        <span className="coach-anchor-status" role="status">
          {resultMessage}
        </span>
      ) : null}
      {results.length > 0 ? (
        <ul className="coach-anchor-results" aria-label="Owned card matches">
          {results.map((card) => (
            <li key={card.id}>
              <button
                onClick={() => {
                  onChange({ cardId: card.id, name: card.name });
                  setResults([]);
                }}
                type="button"
              >
                <strong>{card.name}</strong>
                <span>{card.typeLine} · own {card.ownedCount}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {selected ? (
        <button className="ghost-button subtle-button" onClick={() => onChange(null)} type="button">
          Clear anchor
        </button>
      ) : null}
    </div>
  );
}
