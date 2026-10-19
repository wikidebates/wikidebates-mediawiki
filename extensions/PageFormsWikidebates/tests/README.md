# Regression checks

Run these commands from the MediaWiki checkout root with its development
dependencies installed and PageFormsWikidebates loaded in a development wiki.

```sh
node_modules/.bin/jest --config extensions/PageFormsWikidebates/tests/jest/jest.config.js --runInBand
vendor/bin/phpunit --filter 'PF(Values|Mapping)UtilsRegressionTest' extensions/PageFormsWikidebates/tests/phpunit
vendor/bin/phpunit extensions/PageFormsWikidebates/tests/phpunit
```

The JavaScript tests use MediaWiki's jQuery, its Jest/jsdom development dependencies,
and the Select2 version bundled with this extension. They exercise request races,
cancellation, cache reuse, destruction, local option preservation and dependent
field refresh. HTTP is controlled in these tests; no external service is needed.

The token tests exercise the real token input class and bundled Select2 with
synthetic native keyboard/input events: dead keys, in-progress composition,
composition completion, IME key code 229, token separators and keyboard selection.
These tests cannot emulate an operating system's keyboard layout. After deployment,
also type `^` then `e` and `¨` then `o` in a token field, both initially and after
selecting another token. Expect `ê` and `ö`, including after saving and reopening
the form. Also check normal Enter/Tab selection and token deletion. Test the
browsers and keyboard layouts used on the wiki.

After the composition fix, all 22 JavaScript checks pass: 12 combobox checks and
10 token checks. Before the fix, the new checks reproduced premature searches
and token changes during composition.

The PHP tests use MediaWiki's integration runner and test database. They cover
invalid/missing mapping templates, empty values, category cycles and duplicate
membership, numeric titles, and titles ending in `@`.

Use `MW_CONFIG_FILE` to select a dedicated development test configuration when
other installed extensions interfere. The existing suite assumes English in
several assertions. The site's normal language need not be changed.

## Validation on MediaWiki 1.43 / PHP 8.2

- New regression checks: 12 JavaScript tests and 8 PHPUnit runner checks passed
  (including the integration runner's database setup/teardown checks).
- A French development wiki with Wikidebates and PageFormsWikidebates enabled was
  exercised over HTTP: render a form, autocomplete a category title ending in `@`,
  save through `pfautoedit`, inspect the stored wikitext, and reopen the form with
  accented characters and the selected value preserved.
- Existing English PHPUnit suite before changes: 183 checks, 392 assertions,
  1 error, 11 failures and 22 skipped. After changes: 191 checks, 404 assertions,
  the same error, failures and skipped checks. No new failures were observed.
- The existing failures concern old markup expectations and category-default-form
  expectations. The error comes from a mapping-property test attempting to use
  installed but unconfigured Semantic MediaWiki (`smwgDefaultStore` is unset).

These checks do not cover the full production forms, browser rendering on actual
devices, or integrations with an active Semantic MediaWiki/Cargo installation.
The synchronous uniqueness validation requests and bundled third-party library
versions were not changed by this maintenance pass.
