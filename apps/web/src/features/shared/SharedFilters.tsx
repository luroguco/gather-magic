import type { Deck, Mechanic } from "../../types";
import {
  CARD_TYPES,
  COLORS,
  FORMATS,
  RARITIES,
  type FilterState,
  type FilterStateUpdater,
  type MechanicSection
} from "./filterState";

type SharedFiltersProps = {
  state: FilterState;
  updateState: FilterStateUpdater;
  ownedLabel: string;
  ownedHintOn: string;
  ownedHintOff: string;
  onClear: () => void;
  selectedMechanics: Mechanic[];
  sidebarFavorites: Mechanic[];
  sidebarDerivedGroups: MechanicSection[];
  sidebarMechanicSelection: string[];
  onToggleMechanic: (slug: string) => void;
  onOpenGlossary: () => void;
};

export function SharedFilters({
  state,
  updateState,
  ownedLabel,
  ownedHintOn,
  ownedHintOff,
  onClear,
  selectedMechanics,
  sidebarFavorites,
  sidebarDerivedGroups,
  sidebarMechanicSelection,
  onToggleMechanic,
  onOpenGlossary
}: SharedFiltersProps) {
  return (
    <>
      <label className="field">
        <span>Text</span>
        <input
          value={state.q}
          onChange={(event) => updateState((current) => ({ ...current, q: event.target.value }))}
          placeholder="Search name or oracle text"
        />
      </label>

      <label className="field">
        <span>Format</span>
        <select
          value={state.format}
          onChange={(event) => updateState((current) => ({ ...current, format: event.target.value as Deck["format"] }))}
        >
          {FORMATS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className={state.ownedOnly ? "inline-toggle toggle-switch active" : "inline-toggle toggle-switch"}>
        <input
          className="toggle-switch-input"
          checked={state.ownedOnly}
          onChange={(event) => updateState((current) => ({ ...current, ownedOnly: event.target.checked }))}
          type="checkbox"
        />
        <span className="toggle-switch-track" aria-hidden="true">
          <span className="toggle-switch-thumb" />
        </span>
        <span className="toggle-switch-copy">
          <strong>{ownedLabel}</strong>
          <small>{state.ownedOnly ? ownedHintOn : ownedHintOff}</small>
        </span>
      </label>

      <div className="filter-group">
        <span>Colors</span>
        <div className="chip-grid">
          {COLORS.map((color) => (
            <button
              key={color}
              className={state.colors.includes(color) ? "chip active" : "chip"}
              onClick={() =>
                updateState((current) => ({
                  ...current,
                  colors: current.colors.includes(color)
                    ? current.colors.filter((entry) => entry !== color)
                    : [...current.colors, color]
                }))
              }
              type="button"
            >
              {color}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <span>Types</span>
        <div className="chip-grid">
          {CARD_TYPES.map((type) => (
            <button
              key={type}
              className={state.types.includes(type) ? "chip active" : "chip"}
              onClick={() =>
                updateState((current) => ({
                  ...current,
                  types: current.types.includes(type)
                    ? current.types.filter((entry) => entry !== type)
                    : [...current.types, type]
                }))
              }
              type="button"
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>Subtype / tribe</span>
        <input
          placeholder="Kithkin, Shrine, Angel"
          value={state.subtypes}
          onChange={(event) => updateState((current) => ({ ...current, subtypes: event.target.value }))}
        />
      </label>

      <div className="filter-group">
        <span>Rarity</span>
        <div className="chip-grid">
          {RARITIES.map((rarity) => (
            <button
              key={rarity}
              className={state.rarity.includes(rarity) ? "chip active" : "chip"}
              onClick={() =>
                updateState((current) => ({
                  ...current,
                  rarity: current.rarity.includes(rarity)
                    ? current.rarity.filter((entry) => entry !== rarity)
                    : [...current.rarity, rarity]
                }))
              }
              type="button"
            >
              {rarity}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <div className="filter-heading">
          <span>Mechanics</span>
          <button className="ghost-button subtle-button" onClick={onOpenGlossary} type="button">
            Glossary
          </button>
        </div>

        {selectedMechanics.length ? (
          <div className="mechanic-section">
            <span className="mechanic-section-title">Selected</span>
            <div className="chip-grid">
              {selectedMechanics.map((mechanic) => (
                <button
                  key={`selected-${mechanic.slug}`}
                  className="chip active"
                  title={mechanic.definition}
                  onClick={() => onToggleMechanic(mechanic.slug)}
                  type="button"
                >
                  {mechanic.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {sidebarFavorites.length ? (
          <div className="mechanic-section">
            <span className="mechanic-section-title">Pinned</span>
            <div className="chip-grid">
              {sidebarFavorites.map((mechanic) => (
                <button
                  key={`favorite-${mechanic.slug}`}
                  className={sidebarMechanicSelection.includes(mechanic.slug) ? "chip active" : "chip"}
                  title={mechanic.definition}
                  onClick={() => onToggleMechanic(mechanic.slug)}
                  type="button"
                >
                  {mechanic.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {sidebarDerivedGroups.map((section) => (
          <div className="mechanic-section" key={`sidebar-${section.id}`}>
            <span className="mechanic-section-title">{section.label}</span>
            <div className="chip-grid mechanic-grid compact-grid">
              {section.items.map((mechanic) => (
                <button
                  key={mechanic.slug}
                  className={sidebarMechanicSelection.includes(mechanic.slug) ? "chip active" : "chip"}
                  title={mechanic.definition}
                  onClick={() => onToggleMechanic(mechanic.slug)}
                  type="button"
                >
                  {mechanic.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mana-range">
        <label className="field">
          <span>Playable count min</span>
          <input
            inputMode="numeric"
            value={state.playableCountMin}
            onChange={(event) => updateState((current) => ({ ...current, playableCountMin: event.target.value }))}
          />
        </label>
        <label className="field">
          <span>Playable count max</span>
          <input
            inputMode="numeric"
            value={state.playableCountMax}
            onChange={(event) => updateState((current) => ({ ...current, playableCountMax: event.target.value }))}
          />
        </label>
        <label className="field">
          <span>Mana value min</span>
          <input
            inputMode="numeric"
            value={state.manaValueMin}
            onChange={(event) => updateState((current) => ({ ...current, manaValueMin: event.target.value }))}
          />
        </label>
        <label className="field">
          <span>Mana value max</span>
          <input
            inputMode="numeric"
            value={state.manaValueMax}
            onChange={(event) => updateState((current) => ({ ...current, manaValueMax: event.target.value }))}
          />
        </label>
      </div>

      <button className="ghost-button subtle-button filters-clear" onClick={onClear} type="button">
        Clear filters
      </button>
    </>
  );
}
