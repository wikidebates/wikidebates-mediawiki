# UPSTREAM NOTES

Base extension: PageForms

This fork diverges mainly in:
- PF_FormPrinter.php
- PageForms.js
- PF_ComboBoxInput.js
- PageForms.less

Merges with upstream should review these files first.

The bundled `libs/foreign/select2/select2.js` also has a local patch in
`select2/selection/search`: inline token searches ignore dead keys and intermediate
IME events, and resume after `compositionend`. Keep this behavior when updating
Select2; `tests/jest/PF_TokensInput.test.js` covers the patch and token keyboard
shortcuts. The bundled library version has not been upgraded.
