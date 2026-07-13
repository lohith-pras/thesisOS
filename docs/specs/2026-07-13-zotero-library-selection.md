# Zotero Library Selection and Extraction

## Goal

Make Zotero extraction deterministic for personal libraries, group libraries, and accounts with multiple libraries, while preserving an explicit user choice whenever automatic selection would be ambiguous.

## Library discovery

ThesisOS discovers the local personal library and every accessible group library, then counts top-level bibliographic items in each library. Notes, attachments, and annotations are excluded from paper counts.

Selection follows these rules:

1. An explicit CLI selection overrides all other configuration.
2. A valid project-saved selection is reused.
3. If exactly one discovered library contains papers, it is selected automatically.
4. If multiple libraries contain papers, ThesisOS returns a catalog containing library name, type, ID, and paper count and requires the user to choose one.
5. If no library contains papers, ThesisOS reports the discovered empty libraries and does not claim a successful extraction.

The selected library is saved in project-local configuration so later commands are non-interactive and reproducible. A stale or inaccessible saved selection is rejected with the current library catalog instead of silently falling back to another library.

## User controls

- `--library <name-or-id>` selects one personal or group library. IDs are authoritative; a name is accepted only when it matches exactly one library.
- `--all-libraries` intentionally extracts from every non-empty accessible library.
- Explicit library type and ID flags remain supported for scripts and backwards compatibility.
- Selection commands expose machine-readable output so another UI can render the catalog without parsing human-readable text.

When all libraries are requested, every paper retains its source library type, library ID, library name, and Zotero item key. The stable identity is `libraryType:libraryId:itemKey`; ThesisOS never collapses distinct Zotero records merely because their titles or DOIs match. It may report likely duplicates separately.

## Extraction behavior

All item endpoints are paginated until exhausted rather than assuming Zotero's first page is complete. Only top-level bibliographic records are returned as papers. Records with missing titles or DOIs remain valid and retain their item key and available metadata.

The connector distinguishes between:

- no matching papers;
- an empty library;
- Zotero not running or unreachable;
- authentication or access failure;
- an invalid or deleted library;
- a malformed or partial API response.

Errors include a stable code, actionable message, and relevant library context. They do not silently switch libraries.

## Configuration

The project-local configuration stores the selected library type and ID. The display name is informational and can be refreshed if the Zotero group is renamed. Environment variables remain available for unattended workflows and take precedence over project configuration only when explicitly set.

## Verification

Automated tests cover:

- one empty personal library plus one non-empty group;
- one non-empty personal library;
- multiple non-empty libraries requiring selection;
- reuse and override of a saved selection;
- stale, inaccessible, renamed, and duplicate-name libraries;
- intentional all-library extraction and source namespacing;
- more than one page of results;
- mixed papers, notes, attachments, and annotations;
- papers with incomplete metadata;
- duplicates within and across libraries;
- unavailable Zotero, access errors, malformed responses, and interrupted pagination.

Live verification uses the local Zotero installation. For the current project, automatic discovery must identify group library `isac_project_thesis` (ID `6568124`) as the sole non-empty library and extract exactly 40 top-level bibliographic papers with no duplicate normalized titles or DOIs.

## Non-goals

- Mutating, deleting, or reorganizing Zotero records.
- Automatically choosing among multiple non-empty libraries using heuristics such as largest library or personal-library preference.
- Semantic search setup; this design concerns deterministic library selection and metadata extraction.
