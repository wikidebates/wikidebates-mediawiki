# CHANGELOG Wikidebates

## Reliability and form responsiveness
- Fix local combobox option labels and retain Select2 HTML escaping for suggestions and selections.
- Replace blocking uniqueness and dependent-field requests with asynchronous checks, including save, preview, save-and-continue, and popup submission.
- Preserve special characters in API parameters, cancel stale dependent requests, reuse identical requests, and show retry messages on failure.
- Initialize lazy widgets individually and keep template starters untouched.
- Discover subcategories independently of suggestion limits, with batched discovery and one schema check per traversal.
- Add JavaScript regression checks and category database tests; see `tests/README-Wikidebates.md` for commands and integration requirements.

## Major changes
- Tableless form layout (`pf-formlayout`)
- Select2 combobox migration
- Lazy widget initialization
- Conditional ResourceLoader loading
- Multi-instance rendering fixes
