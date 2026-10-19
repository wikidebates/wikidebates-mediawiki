# UPSTREAM NOTES

Base extension: PageForms

This fork diverges mainly in:
- PF_FormPrinter.php
- PageForms.js
- PF_ComboBoxInput.js
- PageForms.less

Merges with upstream should review these files first.

The bundled `libs/foreign/select2/select2.js` also has local patches in
`select2/selection/search` and `select2/selection/multiple`: inline token searches
ignore dead keys and intermediate IME events, and resume after `compositionend`.
Selection refreshes keep the search input attached and insert token choices before
it, so asynchronous updates do not interrupt composition by removing and
refocusing the input. Keep this behavior when updating Select2;
`tests/jest/PF_TokensInput.test.js` covers the patches and token keyboard shortcuts,
including native focus events after deletion. The bundled library version has not
been upgraded.
