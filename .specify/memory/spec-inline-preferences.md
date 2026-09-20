# Feature Specification: Inline Preference Checkboxes on Search Bar

**Feature Branch**: `feat/inline-preferences`

**Created**: 2026-09-19

**Status**: Draft

**Input**: User description: "I would like the checkboxes on the search bar itself when you generate a link, so that you can customize right away"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Customize Before Scraping (Priority: P1)

User pastes a Zillow URL and immediately sees four checkboxes on the search page (Show address, Show specs, Show year, Show type). They can toggle preferences before clicking "Snap it", ensuring the gallery opens with their preferences pre-applied.

**Why this priority**: This is the core value—users can customize immediately without needing to open the gallery, navigate to preferences, and share again. Reduces friction from 5 steps to 1.

**Independent Test**: Can be fully tested by pasting a URL, toggling a checkbox, clicking "Snap it", and verifying the gallery viewer opens with preferences applied.

**Acceptance Scenarios**:

1. **Given** the search page is loaded with an empty input, **When** user pastes a Zillow URL and presses Enter, **Then** the four preference checkboxes appear above or beside the input, all checked by default.
2. **Given** checkboxes are visible, **When** user unchecks "Show address", **Then** the checkbox state is visually updated (unchecked appearance).
3. **Given** preferences are customized, **When** user clicks "Snap it", **Then** the gallery opens with those preferences applied (address hidden, other specs shown).
4. **Given** the gallery is loaded with custom preferences from search, **When** user checks the preferences button in the gallery, **Then** the preference panel shows the exact state they selected on the search page.

---

### User Story 2 - Persistent Search Preferences (Priority: P2)

When user visits the home page multiple times, their last-used preference settings are remembered and pre-populated on the search bar checkboxes.

**Why this priority**: Convenience for power users who always hide the same fields. Reduces repetitive toggling.

**Independent Test**: Can be tested by toggling preferences, navigating away, returning to home page, and confirming checkboxes match the last state.

**Acceptance Scenarios**:

1. **Given** user has previously unchecked "Show address", **When** they return to the home page, **Then** the checkbox appears unchecked by default.
2. **Given** user toggles multiple preferences, **When** they navigate away and return, **Then** all checkbox states match what they last set.

---

### User Story 3 - Visual Clarity & Accessibility (Priority: P1)

Checkboxes are clearly labeled, accessible via keyboard (Tab/Space to toggle), and visible on all screen sizes (mobile, tablet, desktop). Labels are descriptive.

**Why this priority**: Essential for usability. Users must be able to see and interact with preferences at a glance.

**Independent Test**: Can be tested by tabbing through the form on desktop and tapping checkboxes on mobile, verifying all four are accessible and labeled correctly.

**Acceptance Scenarios**:

1. **Given** the search page is loaded, **When** user presses Tab to navigate, **Then** each checkbox receives focus in logical order.
2. **Given** a checkbox has focus, **When** user presses Space, **Then** the checkbox toggles.
3. **Given** the page is viewed on mobile, **When** user views the search bar area, **Then** all four checkboxes are visible and tappable without horizontal scrolling.

---

### Edge Cases

- What happens if user toggles a checkbox then pastes a new URL? (Reset checkboxes to defaults or preserve state? → **Clarification needed**)
- What if user disables all four options (hides everything)? (Allow it or show a warning? → **Clarification needed**)
- Do preferences set on search bar override those stored in localStorage from a previous shared link? (→ **Clarification needed**)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Search page MUST display four labeled checkboxes for address, specs, year, and home type visibility.
- **FR-002**: All checkboxes MUST be checked by default (show all information by default).
- **FR-003**: When user clicks "Snap it", the gallery viewer MUST receive the checkbox state and apply it to the display.
- **FR-004**: The gallery MUST hide/show address, specs, year, and home type based on checkbox state passed from search page.
- **FR-005**: Preference state from search page MUST take precedence over localStorage defaults when scraping a fresh listing.
- **FR-006**: Checkbox state on search page MUST be persisted to localStorage with key `searchPagePrefs`.
- **FR-007**: System MUST NOT allow users to uncheck all four options (show at least one field, or clarify this is allowed).

### Key Entities

- **Search Preferences Object**: `{ showAddress: bool, showSpecs: bool, showYear: bool, showType: bool }`
- **Stored in**: `localStorage.searchPagePrefs` (search page default state) vs. URL tokens on gallery page

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: User can customize preferences and generate a gallery in one unbroken workflow (no back-and-forth to preferences button).
- **SC-002**: 100% of users can identify and interact with checkboxes on first visit (no confusion about purpose).
- **SC-003**: Checkbox state persists across browser sessions (localStorage validated on page reload).
- **SC-004**: Gallery displays exactly match what was customized on search page (zero misalignment between search preferences and gallery display).

## Assumptions

- Users want to set preferences once per scrape session (not change them mid-gallery).
- Default state is all options shown (privacy-conscious choice; users opt-in to hiding).
- Mobile layout has room for four checkboxes without breaking the visual hierarchy (stacked vertically or two columns).
- localStorage is available in all target browsers.
- Preference customization applies only to the current scrape (shared links carry their own preferences via tokens).

## Implementation Notes

### UI Placement

**Container Structure**: Checkboxes are positioned BELOW the search input/button, but remain WITHIN the overall search container (same border, padding, and visual boundary).

- **Desktop**: Input and "Snap it" button on one line, checkboxes in a 2-column grid below them, all within the container.
- **Mobile**: Input and "Snap it" button stacked vertically, checkboxes in a single column below, all within the container.
- **Visual**: All elements (input, button, checkboxes) share the same background, border, and shadow — one unified form block.

### Data Flow

1. User toggles checkbox on search page → State saved to `searchPagePrefs` in localStorage
2. User clicks "Snap it" → Form submission includes preference state
3. Server scrapes Zillow, returns gallery data
4. Client renders gallery page with preferences from search (not from shared URL token)
5. If user then customizes in gallery and shares, a NEW token is created with those preferences

### Backward Compatibility

- Existing shared links (with `?prefs=TOKEN`) continue to work as-is (gallery page loads preferences from token).
- Only NEW scrapes initiated from search page use inline preferences.
- No database migrations required; purely client-side state.

## Clarifications Needed

1. **Behavior when all options unchecked**: Should system allow hiding all information, or enforce at least one field visible?
2. **Checkbox state on new URL paste**: When user pastes a new Zillow URL, should checkboxes reset to defaults or preserve their last state?
3. **Mobile layout**: Do checkboxes go in one vertical column or two columns? What's the max breakpoint before they stack?
4. **Preference override**: If a user has a localStorage preference AND opens a shared link with a token, which takes precedence? (Answer: token should; it's explicit intent from the sharer.)
