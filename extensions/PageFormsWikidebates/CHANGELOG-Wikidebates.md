# CHANGELOG Wikidebates

## Accents and composition in token fields
- Let the browser finish dead-key accents and IME composition before searching
  or splitting tokens. Opening suggestions must not interrupt a pending accent.
- Preserve native Enter, Backspace and Tab behavior while composing, then resume
  normal token selection after composition ends.
- Add regression tests using the bundled Select2 and the actual token input class.

## Autocomplete reliability and targeted performance improvements
- Ignore stale autocomplete responses, cancel obsolete requests even on cache hits,
  and release pending requests and change handlers when rebuilding a combobox.
- Retain recently reused suggestions in the bounded request cache.
- Fix local HTML option loading and preserve option labels, choices and the selected
  value when refreshing a combobox.
- Check the category-link schema once per traversal instead of once per category.
- Preserve numeric page titles and trailing `@` characters when sorting suggestions.
- Treat invalid mapping-template names like missing templates, and skip template
  lookup entirely for empty input lists.
- Add PHP regression tests and JavaScript tests using the bundled Select2 widget.
  See [tests/README.md](tests/README.md) for commands and validation limits.

## Major changes
- Tableless form layout (`pf-formlayout`)
- Select2 combobox migration
- Lazy widget initialization
- Conditional ResourceLoader loading
- Multi-instance rendering fixes
