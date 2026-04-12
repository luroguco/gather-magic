import { jsx as _jsx } from "react/jsx-runtime";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SharedFilters } from "./SharedFilters";
import { defaultSearch } from "./filterState";
const sampleMechanic = {
    slug: "flying",
    label: "Flying",
    definition: "Can only be blocked by creatures with flying or reach.",
    usageCount: 12,
    ownedUsageCount: 8,
    type: "keyword"
};
describe("SharedFilters", () => {
    it("applies text and owned-only updates through the shared updater", () => {
        let state = {
            ...defaultSearch,
            mechanics: ["flying"],
            ownedOnly: true
        };
        const updateState = vi.fn((updater) => {
            state = updater(state);
        });
        const onClear = vi.fn();
        const onToggleMechanic = vi.fn();
        const onOpenGlossary = vi.fn();
        render(_jsx(SharedFilters, { state: state, updateState: updateState, ownedLabel: "Owned cards only", ownedHintOn: "Showing your collection", ownedHintOff: "Showing full catalog", onClear: onClear, selectedMechanics: [sampleMechanic], sidebarFavorites: [sampleMechanic], sidebarDerivedGroups: [], sidebarMechanicSelection: state.mechanics, onToggleMechanic: onToggleMechanic, onOpenGlossary: onOpenGlossary }));
        fireEvent.change(screen.getByPlaceholderText("Search name or oracle text"), {
            target: { value: "angel" }
        });
        fireEvent.click(screen.getByRole("checkbox"));
        fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
        const flyingButtons = screen.getAllByRole("button", { name: "Flying" });
        expect(flyingButtons.length).toBeGreaterThan(0);
        fireEvent.click(flyingButtons[0]);
        fireEvent.click(screen.getByRole("button", { name: "Glossary" }));
        expect(updateState).toHaveBeenCalledTimes(2);
        expect(state.q).toBe("angel");
        expect(state.ownedOnly).toBe(false);
        expect(onClear).toHaveBeenCalledTimes(1);
        expect(onToggleMechanic).toHaveBeenCalledWith("flying");
        expect(onOpenGlossary).toHaveBeenCalledTimes(1);
    });
});
