# Zotero integration

Proofline uses Zotero Desktop’s local API in read-only mode. It never imports, edits, deletes, or reorganizes Zotero items.

## Desktop setup

1. Open Zotero Desktop.
2. Enable **Settings → Advanced → Allow other applications on this computer to communicate with Zotero**.
3. Start Proofline with `npm run app`.

The app discovers personal and group libraries and loads top-level bibliographic items. Notes, attachments, and annotations are excluded.

## Library selection

Proofline automatically selects a library when exactly one non-empty library is available. If multiple libraries contain papers, it shows a catalog instead of guessing.

Select one library from the CLI:

```bash
npm run zotero -- --list --library isac_project_thesis --expected-revision <current-revision>
npm run zotero -- --list --library 6568124 --expected-revision <current-revision>
```

Use explicit group selection for scripts:

```bash
npm run zotero -- --list --library-type group --library-id 6568124 --expected-revision <current-revision>
```

For an initialized workspace, the selected library type, ID, and display name are saved in `.thesisos/thesis-state.json` as a revisioned `zotero.library.selected` event. The app requires the current project revision for this change. The standalone CLI retains `.thesisos.json` only as a compatibility fallback before a canonical workspace exists.

## Multiple libraries

Intentionally include every non-empty library with:

```bash
npm run zotero -- --list --all-libraries
npm run zotero -- --input-dir ./demo-output/run --all-libraries
```

Results retain `sourceId`, `sourceLibrary`, and the original Zotero item key, so equal keys in different libraries remain distinct.

Supported environment overrides include `ZOTERO_LIBRARY_TYPE`, `ZOTERO_LIBRARY_ID`, and `ZOTERO_USER_ID` for web-mode scripts.

## Website flow

The website requires an approved literature task before search. Search results preserve title, authors, venue, abstract, tags, DOI, match score, retrieval reasons, and stable source IDs. Selecting evidence does not write to Zotero.
