# Dictionary downloads — design spec

**Status:** proposed
**Date:** 2026-09-20

## Problem

The import dialog on the Dictionary page offers ECDICT, CC-CEDICT, WordNet and
a custom file, but gives no indication of where any of them come from. A user
who picks ECDICT has to leave the app, work out which of several repositories
is the real one, and find the right file among the release assets.

Two further problems sit behind that:

- The dialog states the accepted formats as `.csv / .tsv / .json / .txt`.
  WordNet does not ship in any of them — it is a set of database files
  (`data.noun`, `index.sense`, …). A user who follows the instructions cannot
  import it.
- `dictionary.loadFile()` reads a file, counts rows and builds a three-row
  preview, and `confirmImport()` then discards it. Nothing is persisted. The
  dialog is a shell.

## Decision: fetch on the user's behalf, do not host

The application downloads from each project's own URL. It does not serve,
mirror, or bundle dictionary data.

|                             | Host the files ourselves                                                       | Fetch from the origin    |
| --------------------------- | ------------------------------------------------------------------------------ | ------------------------ |
| ECDICT (MIT)                | permitted                                                                      | permitted                |
| CC-CEDICT (CC BY-SA 4.0)    | redistribution — attribution required, derivatives must carry the same licence | no redistribution occurs |
| WordNet (Princeton licence) | redistribution — citation terms apply                                          | no redistribution occurs |
| Bandwidth                   | ours; ECDICT's full release is tens of MB                                      | the project's            |
| Freshness                   | goes stale, needs a release to update                                          | always current           |

Fetching loses nothing and avoids inheriting CC BY-SA's copyleft. The user
experience is identical: one button.

Licence and attribution are still displayed, because a user is entitled to know
what terms attach to data they are about to install.

## Scope

In scope:

- A catalogue of downloadable dictionaries, seeded, with real source URLs.
- Download to the same per-runtime directory the models use, under `dictionaries/`.
- Parsing ECDICT (CSV) and CC-CEDICT (its own line format) into `Words`.
- Reporting progress, and surviving an interrupted download.
- Showing licence and attribution before install.

Out of scope, with reasons:

- **WordNet import.** Its format is unlike the other two and it carries no
  Chinese glosses, so it serves a different purpose (example sentences). It
  stays in the catalogue as a listed source with a link, marked unsupported for
  import, until there is a reason to parse it.
- **Custom file import.** The existing dialog path stays as it is. This spec
  covers the three named sources.
- **Desktop-side download.** The server performs downloads for both deployments
  in this iteration; the Tauri shell calls the same endpoint. A desktop-local
  download path can come later without changing the contract.

## Existing pieces this builds on

`LocalModels` and `ModelStorage` already solve the same shape — a fixed
catalogue of large files, installed on demand, into a directory that differs per
runtime. This follows them rather than inventing a parallel mechanism.

- `ModelStorage.Root` resolves per runtime: `Models__Directory` in Docker, the
  per-OS data directory otherwise. Dictionaries live in a sibling folder under
  the same root, so one volume mount covers both.
- `LocalModelEntry` is the pattern for the catalogue row. `DictionarySource`
  mirrors it, with `SourceUrl` actually populated — the models' URLs were left
  null because their hosting was undecided; these are known.
- `ModelSeeds.Seed` is the pattern for seeding: insert missing rows, refresh
  descriptive columns, never reset runtime state.
- `CatalogueTranslationSeeds` is how catalogue copy reaches zh-TW and zh-CN.
  Dictionary names and descriptions join it.

## Data

### `DictionarySources` table

| Column           | Type             | Notes                                                                  |
| ---------------- | ---------------- | ---------------------------------------------------------------------- |
| `Id`             | int              | identity                                                               |
| `Code`           | string(64)       | `ecdict`, `cc-cedict`, `wordnet`; unique; also the on-disk folder name |
| `Name`           | string(128)      | English display name                                                   |
| `Description`    | string(512)      | English display copy                                                   |
| `SourceUrl`      | string(512)      | the file to fetch                                                      |
| `HomepageUrl`    | string(512)      | the project page, shown as attribution                                 |
| `Licence`        | string(64)       | `MIT`, `CC BY-SA 4.0`, `WordNet`                                       |
| `Format`         | string(32)       | `ecdict-csv`, `cc-cedict`, `wordnet` — selects the parser              |
| `Compression`    | string(16), null | `gzip` for CC-CEDICT, null for ECDICT                                  |
| `ApproxEntries`  | int              | for display; the real count comes from the import                      |
| `SupportsImport` | bool             | false for WordNet                                                      |
| `SortOrder`      | int              |                                                                        |
| `Installed`      | bool             | runtime state, never reset by seeding                                  |
| `InstalledAt`    | DateTime, null   | runtime state                                                          |
| `EntryCount`     | int              | rows actually imported                                                 |

Seeded rows:

| Code        | SourceUrl                                                                    | Licence      | Format       | Compression |
| ----------- | ---------------------------------------------------------------------------- | ------------ | ------------ | ----------- |
| `ecdict`    | `https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv`     | MIT          | `ecdict-csv` | null        |
| `cc-cedict` | `https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz` | CC BY-SA 4.0 | `cc-cedict`  | gzip        |
| `wordnet`   | `https://wordnetcode.princeton.edu/wn3.1.dict.tar.gz`                        | WordNet      | `wordnet`    | gzip        |

`SupportsImport` is true for the first two, false for `wordnet`.

### Where files land

`<ModelStorage.Root>/../dictionaries/<Code>/` — a sibling of `models/` under the
same configurable root, so the existing Docker volume covers it.

Rationale for a sibling rather than nesting under `models/`: a dictionary is not
a model, and `ModelStorage.UsedBytes()` reports the models' footprint on the
Models page. Nesting would silently inflate that number.

## API

### `GET /api/dictionaries?locale=`

Follows `GET /api/models`: catalogue plus the directory, localised through
`CatalogueLocalizer`.

```json
{
  "directory": "C:\\Users\\x\\AppData\\Local\\TypeLab\\dictionaries",
  "writable": true,
  "usedMb": 41.2,
  "sources": [
    {
      "code": "ecdict",
      "name": "ECDICT",
      "description": "English–Chinese, about 770k entries, with frequency tags",
      "licence": "MIT",
      "homepageUrl": "https://github.com/skywind3000/ECDICT",
      "approxEntries": 770000,
      "supportsImport": true,
      "installed": false,
      "entryCount": 0
    }
  ]
}
```

### `POST /api/dictionaries/{code}/download`

Starts a download. Returns `202 Accepted` with a job id; the work continues in
the background so the request does not hold a connection open for tens of MB.

```json
{ "jobId": "3f2a…" }
```

`409 Conflict` if a download for that code is already running.
`400 Bad Request` if `SupportsImport` is false.

### `GET /api/dictionaries/{code}/status`

```json
{
  "state": "downloading",
  "receivedMb": 12.4,
  "totalMb": 41.2,
  "percent": 30,
  "error": null
}
```

`state` is one of `idle`, `downloading`, `importing`, `installed`, `failed`.

Polling rather than a stream: the front end already polls nothing, and adding
SSE or WebSockets for a progress bar on a once-per-install action is not worth
the transport. A 1-second poll while the dialog is open is sufficient.

### `DELETE /api/dictionaries/{code}`

Removes the downloaded files and the imported `Words` rows for that source, and
clears `Installed`. Mirrors `DELETE /api/models/{code}/install`.

## Parsing

### ECDICT (`ecdict-csv`)

Header row: `word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio`.

Mapping to `Words`: `Text` ← `word`, `Phonetic` ← `phonetic`, `Zh` ←
`translation` (first line), `Pos` ← `pos`, `Freq` ← `frq`, `Topic` ← `tag`.

Constraints that matter:

- The file is ~770k rows. It must stream, not load into memory. Read line by
  line and insert in batches of 1000 through `db.Fastest<Word>().BulkCopy`.
- `translation` contains embedded newlines inside quoted fields. A hand-rolled
  `Split(',')` corrupts them — use a CSV reader that honours RFC 4180 quoting.
- `frq` is empty for many rows; treat as 0.

### CC-CEDICT (`cc-cedict`)

Line format, `#` comments skipped:

```
繁體 简体 [pin1 yin1] /gloss one/gloss two/
```

Mapping: `Text` ← traditional, `Phonetic` ← pinyin, `Zh` ← simplified, the
glosses joined with `; ` into a field the UI shows as the English side.

This is the reverse direction from ECDICT — Chinese headword, English gloss —
which is why the dialog lists it as "suitable for Chinese→English".

### Deduplication

The dialog's existing "reuse mastery for duplicate words" toggle
(`dedupe` in the store) decides what happens when an incoming word already
exists in `Words`: keep the existing row and its `UserWordMastery`, or replace
the definition while keeping mastery. Mastery is never discarded — it is the
user's own progress, not imported data.

## Failure behaviour

- **Interrupted download.** The partial file is deleted; state becomes `failed`
  with the error. Resumption is not attempted — a fresh download of an
  interrupted file is simpler than range requests, and these files are tens of
  MB, not gigabytes.
- **Origin unreachable or 404.** `failed` with the HTTP status. The URLs are
  seeded and can go stale; the error must name the URL so it is diagnosable
  without reading the source.
- **Malformed rows.** Skipped, counted, and reported in the final status. One
  bad line in 770k must not abort an import.
- **Disk full.** `ModelStorage.EnsureWritable()` is checked before the download
  starts, not after it fails.

## Front end

`DictionaryView.vue`'s import dialog gains, per source: the licence, a link to
the project homepage, and a Download button that reports progress. The custom
file path is unchanged.

The store gains `sources`, `loadSources()`, `download(code)` and
`remove(code)`, following `ai.ts`'s `localModels` / `loadModels()` /
`toggleLocalModel()`, including its optimistic update and rollback on failure.

`fixtures.ts` gains a `DICTIONARY_SOURCES` fixture so the dialog works under
`VITE_USE_MOCK=true`, where downloading is simulated rather than performed.

## Testing

Server:

- `ResolveDirectory` puts dictionaries beside models, not inside them.
- ECDICT parser: quoted field containing a comma; quoted field containing a
  newline; empty `frq`; a malformed row is skipped and counted.
- CC-CEDICT parser: a comment line is skipped; multiple glosses join; a line
  without pinyin brackets is counted as malformed.
- Seeding: inserts missing rows; refreshes `Description`; does not reset
  `Installed` or `EntryCount`.
- Dedupe: an existing word keeps its `UserWordMastery` row.

Front end:

- The store surfaces licence and homepage for each source.
- A failed download rolls the optimistic `installed` flag back.

Not covered by automated tests, and stated so rather than implied: the actual
network fetch from each origin. The URLs are verified by hand at implementation
time and can rot afterwards; a test that hits the network would be flaky and
would fail for reasons unrelated to the change under test.

## Open questions

1. **Desktop downloads bypassing the server.** The Tauri shell has a filesystem
   and could fetch directly, which matters for a desktop install with no
   backend. Deferred: the contract above does not prevent it, and the web
   deployment needs the server path regardless.
2. **Import into the mock deployment.** With `VITE_USE_MOCK=true` there is no
   server to import into. The fixture simulates success. Whether the desktop
   build should ship with a real local database is a larger question tied to the
   offline-practice roadmap item.
