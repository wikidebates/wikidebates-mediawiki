# Wikidebates regression checks

From `extensions/PageFormsWikidebates`:

```sh
npm run test:node
```

The tests use Node.js 22.8+ (verified with Node.js 24) and its built-in test
runner. No npm installation is needed for this command. They load the complete
production scripts in separate VM contexts with small jQuery and MediaWiki API
adapters. They exercise local option labels, safe rendering configuration,
asynchronous uniqueness, dependent requests and their failure/race handling,
per-widget initialization, and save/preview submission coordination. These are
unit tests, not browser or live API integration tests.

`npm test` also runs the existing ESLint and translation checks and requires
`npm ci` first.

With PHP, the core Composer development dependencies, a test database, and
PageFormsWikidebates enabled in MediaWiki, run from the repository root:

```sh
php tests/phpunit/phpunit.php extensions/PageFormsWikidebates/tests/phpunit/integration/includes/PFValuesUtilsTest.php
```

The four database tests cover subcategories beyond a suggestion limit, search
and depth, cyclic/shared category membership, and display titles/default sort.
They target the selected MediaWiki 1.43 schema. The code retains the `linktarget`
branch for newer MediaWiki, but that branch requires validation on a newer wiki.

Before deploying, check on a development wiki:

- Local and remote comboboxes: labels, keyboard selection, clearing, and literal
  `<`, `>`, `&`, and quotes in values.
- Dependent fields: switching the source quickly, network failure and retry,
  repeated template instances, and preserving the canonical saved value.
- Save, AJAX preview, save-and-continue, and popup forms: uniqueness pass/failure,
  duplicate clicks, and editing a value during a pending check.
- Long forms: widgets below the fold, collapsed sections, and newly added
  instances. Calendar initialization still belongs to its existing module;
  this change does not split that module into individual calendar initializers.

## Validation API

`window.validateAll()` still returns a boolean. Remote uniqueness results must
be prepared before it can authorize a changed unique field. Code that submits
forms should use `window.validateAllAsync().then( valid => { ... } )` and proceed
only when `valid` is true. The standard save, AJAX preview, save-and-continue,
and popup handlers use this asynchronous path. The popup registers a `pfPopupSubmit` callback on the inner form; the submit
handler invokes it only after successful validation. This does not depend on
the order in which the two frames finish loading.

Network/API failures prevent saving and show a retry message, rather than
reporting a duplicate. A form changed during a check must be submitted again.
Unchanged original values keep the previous behavior of skipping remote checks.
Uniqueness checks remain client-side advisory checks, not a transactional
uniqueness guarantee against concurrent editors.

## Performance scope

The change removes synchronous XHR, deduplicates dependent requests for the same
source value, and scopes lazy initialization to each widget. Category discovery
is separate from suggestion retrieval and batches up to 50 parent categories.
Page retrieval keeps its existing per-category limit and ordering. It is not a
single batched page query, and no production speedup has been measured.
