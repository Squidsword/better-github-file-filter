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
- `content.js` bails unless GitHub's markup is present (`looksLikeGitHub()`), then:
  - reads each file's full path from `data-tagsearch-path` (diffs) and the hidden
    `data-filterable-item-text` span (tree) — the path GitHub's own `data-file-type` discards;
  - computes each file's compound extension (everything after the filename's first dot);
  - removes GitHub's native extension checkboxes (so its controller can't fight ours) and
    renders our own buckets + select-all, running its own show/hide over diff panels, tree
    file rows, and directory rows;
  - re-applies across Turbo/pjax navigation and lazily-loaded diffs via a debounced
    `MutationObserver`.

If a future GitHub release renames things, the fix is almost always the four selectors at the
top of `content.js`.

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
