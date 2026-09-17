# Better GitHub File Filter

A Chromium extension that upgrades the pull-request **File filter** to bucket files by
their **full compound extension** instead of just the last dot-segment.

GitHub keys the filter on the last segment only, so `Foo.tsx` and `Foo.test.tsx` collapse
into one `.tsx (N)` bucket — you can't hide tests while keeping source. This replaces that
row with disjoint buckets (`.tsx (3)`, `.test.tsx (3)`), each toggling independently, plus a
matching **Select all**.

Works on **github.com and any GitHub Enterprise** install — it keys off GitHub's page markup,
never the hostname, so self-hosted domains are covered automatically.

## Install (unpacked)

1. `chrome://extensions`
2. Enable **Developer mode** (top right).
3. **Load unpacked** → select this folder.
4. Open a PR's **Files changed** tab; the filter dropdown now shows compound buckets.

## How it works

- `manifest.json` injects `content.js` on `https://*/*/pull/*` (any host, PR pages only).
- `content.js` bails unless GitHub's markup is present (`looksLikeGitHub()`). A shared **core**
  turns each file path into its compound bucket; two **adapters** cover GitHub's two
  Files-changed experiences, detected at runtime:
  - **Legacy** — the classic server-rendered UI (still used by most Enterprise installs). Reads
    paths from `data-tagsearch-path` (diffs) and the `data-filterable-item-text` span (tree),
    replaces GitHub's native extension checkboxes with our buckets + select-all, and hides diff
    panels / tree rows / directory rows via `hidden`.
  - **Next** — the upgraded React UI (github.com's account-gated "Files changed"). Reads paths
    from each diff's `aria-label` and each tree row's `id`, injects compound buckets into the
    Primer filter popover (cloning a native row so styling matches), and collapses the
    always-mounted per-file wrappers with `display:none` so it never fights the virtualized list.
- Buckets render as a two-level tree: each base extension (`.tsx`) is a folder-style **parent** row
  that cascades to its variants (`.test.tsx`, `.stories.tsx`) nested beneath it. The parent shows
  checked / a dash (some) / unchecked over its children; toggling it flips the whole family. Base
  extensions with no variants render as a single flat row. Variants are **collapsed by default**
  behind a disclosure chevron, so the popover mirrors GitHub's native one-row-per-extension list
  until you expand a family.
- The compound bucket is everything after the filename's first dot. The final segment (the real
  extension) is always kept, so purely-numeric extensions survive (`rustc.1` → `.1` man pages,
  `sheet.123` → `.123`). Among the segments before it, purely-numeric ones are dropped so version
  noise collapses (`jquery-3.6.0.min.js` → `.min.js`, `lib.4.5.7.tar.gz` → `.tar.gz`); alphanumeric
  segments are kept, so digit-bearing extensions (`break.mp3`, `launch.ps1`) and markers
  (`app.e2e-spec.ts` → `.e2e-spec.ts`) survive. Case-insensitive (`.MD` and `.md` fold into `.md`);
  leading-dot dotfiles keep the dot as name (`.env.local` → `.local`).
- Both adapters share one selection and re-apply across Turbo/pjax navigation, React re-renders,
  and lazily-loaded diffs via a debounced `MutationObserver`.

If a future GitHub release renames things, the fix is almost always the selectors at the top of
the affected adapter (`LEGACY` / `NEXT`) in `content.js`.

## Permissions

The broad `https://*/*` host match (and its "read and change data on all sites" warning) is
deliberate: Enterprise domains can't be enumerated ahead of time, so the extension must be
allowed to run on any host and decide via page markup. It collects and transmits **nothing** —
all logic is local DOM manipulation.

## Build the store package

```sh
node make-icons.js          # regenerate icon PNGs
zip -jX better-github-file-filter.zip manifest.json content.js icon16.png icon48.png icon128.png
```

Upload the zip at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
`make-icons.js` and this README are dev-only and stay out of the package.

## Icons

`icon{16,48,128}.png` are generated placeholders (a filter glyph). Replace with real art
before a public listing; re-run `node make-icons.js` to regenerate the placeholders.
