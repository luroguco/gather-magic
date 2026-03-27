# Grounded AI Assistant Plan

## Goal

Add an AI assistant that helps build searches and decks by driving the existing app's deterministic APIs instead of reasoning over the collection directly.

The assistant should:
- translate natural language into structured filters
- explain why those filters were chosen
- run only grounded queries against the local backend
- surface exact counts and deck validation from tool results

The assistant should not:
- invent counts from model memory
- bypass the existing search/deck rules
- silently choose cards without showing the query or evidence

## Product Shape

Start with a side-panel assistant inside the web app.

Primary user flows:
- "Find me blink cards in Azorius that I own"
- "Show me cheap graveyard recursion in black"
- "Refine this search to cards under 3 mana"
- "Turn these results into a starter deck shell"
- "Why did this mechanic search return nothing?"

The AI panel should always show:
- interpreted intent
- generated structured filters
- executed tool/action
- grounded result summary

## Architecture

### Principle

The model is a query planner, not the source of truth.

Existing backend remains authoritative for:
- card search
- owned counts
- mechanics availability
- deck validation
- Arena export

### Initial implementation

Add a new backend AI layer that exposes a safe, minimal tool surface over the existing services:
- `list_mechanics(ownedOnly?)`
- `search_cards(filters)`
- `get_card(cardId)`
- `list_decks()`
- `get_deck(deckId)`
- `validate_deck(deckId)`

For v1, keep tool execution server-side and map AI requests onto existing backend functions directly.

### UI

Add an `AI Assistant` panel with:
- chat input
- visible generated filters
- "Apply filters" / "Run query" actions
- result explanation panel
- optional "Save as deck" or "Use in current deck" actions later

## API and Contracts

### New backend endpoint

Add a single endpoint such as:
- `POST /api/ai/query`

Request shape:
- user message
- current search state
- optional active deck id
- optional current result context

Response shape:
- `intent`
- `filters`
- `toolCalls`
- `summary`
- `warnings`
- `resultPreview`

### AI response rules

The AI response must be structured JSON first, not prose-first.

Example:

```json
{
  "intent": "search_cards",
  "filters": {
    "ownedOnly": true,
    "colors": ["W", "U"],
    "mechanics": ["blink", "enter-the-battlefield"],
    "manaValueMax": 4
  },
  "summary": "Mapped 'blink shell' to blink plus ETB support in white-blue.",
  "warnings": []
}
```

The UI can then run those filters through the normal search flow.

## Implementation Phases

### Phase 1: Query Builder

- Add the AI endpoint and provider wrapper
- Give the model mechanic/filter metadata and the safe tool surface
- Support natural-language-to-filters only
- Show proposed filters before or alongside execution
- Return exact backend counts only

Success criteria:
- user can ask for a search in plain English
- generated filters match current UI behavior
- result counts always come from backend search

### Phase 2: Query Refinement

- Let the AI refine current filters from conversational follow-ups
- Support commands like "make it cheaper", "only creatures", "show cards I own"
- Let AI explain empty-result cases using mechanics availability and search results

Success criteria:
- follow-up prompts mutate current query state predictably
- AI can explain why a search returned zero cards without hallucinating

### Phase 3: Deck Shell Assistance

- Allow AI to assemble a starter shell from search results and owned cards
- Require the AI to use returned card ids and validation tools
- Show ownership gaps and format warnings immediately

Success criteria:
- AI-produced deck shells are traceable to tool results
- saved decks validate through existing backend checks

## Guardrails

- Never let the model fabricate owned counts
- Never let the model select mechanics not present in the current mechanic index
- Never let the model save a deck without returning the exact card ids it used
- Always surface unresolved or ambiguous interpretations as warnings
- Keep all AI actions inspectable in the UI

## Open Product Decisions For Later

- provider choice and model choice
- whether execution is automatic or confirmation-based
- whether AI can directly mutate the current deck/search state
- whether to persist AI conversations locally
- whether to support card recommendations beyond owned cards
- whether AI should support filter-count-driven deckbuilding goals such as "build me a deck with 24 lands, 10 removal spells, and 8 draw effects" using card type and mechanic count targets

## Recommended v1 Scope

Ship only:
- search query generation
- search refinement
- explanation of zero-result searches

Defer:
- autonomous deckbuilding
- count-target deck construction from card types, mechanics, or arbitrary filters
- large multi-step planning
- cloud sync
- chat history persistence
