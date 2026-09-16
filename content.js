(() => {
  "use strict";

  // Marks the filter form once we've taken it over, so we don't re-inject.
  const FLAG = "data-compound-filter-ready";

  // True on github.com and any GitHub Enterprise install — detected by GitHub's
  // own server-rendered markup, never by hostname (enterprise domains are
  // arbitrary). Lets us skip attaching an observer on unrelated /pull/ pages.
  function looksLikeGitHub() {
    return !!document.querySelector(
      'meta[name="hostname"], meta[name="github-keyboard-shortcuts"], meta[name="request-id"], #js-repo-pjax-container, .application-main, .js-file-filter-form'
    );
  }

  // The full dotted extension of a path, e.g. "app/Foo.test.tsx" -> ".test.tsx".
  // Everything after the first dot of the filename; leading-dot dotfiles
  // (".eslintrc.js") keep the leading dot as part of the name -> ".js".
  function extOf(path) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    const body = name.startsWith(".") ? name.slice(1) : name;
    const dot = body.indexOf(".");
    return dot === -1 ? "" : body.slice(dot);
  }

  function labelFor(ext) {
    return ext === "" ? "(no extension)" : ext;
  }

  // Diff panels on the page, each paired with its file path. We hide the
  // copilot-diff-entry wrapper when present, otherwise the .file element.
  function diffEntries() {
    return Array.from(
      document.querySelectorAll(".file.js-file[data-tagsearch-path]")
    ).map((file) => ({
      path: file.getAttribute("data-tagsearch-path"),
      container: file.closest("copilot-diff-entry") || file,
    }));
  }

  // Sidebar tree file rows, each paired with its file path.
  function treeFiles() {
    return Array.from(
      document.querySelectorAll('li.js-tree-node[data-tree-entry-type="file"]')
    )
      .map((row) => {
        const span = row.querySelector("[data-filterable-item-text]");
        return { path: span ? span.textContent.trim() : "", row };
      })
      .filter((f) => f.path);
  }

  function buckets() {
    const counts = new Map();
    for (const { path } of diffEntries()) {
      const ext = extOf(path);
      counts.set(ext, (counts.get(ext) || 0) + 1);
    }
    return counts;
  }

  const known = new Set(); // every bucket we've ever shown
  let selected = null; // buckets currently checked

  function apply() {
    for (const { path, container } of diffEntries()) {
      container.hidden = !selected.has(extOf(path));
    }
    for (const { path, row } of treeFiles()) {
      row.hidden = !selected.has(extOf(path));
    }
    // Collapse directory rows whose files are all hidden.
    for (const dir of document.querySelectorAll(
      'li.js-tree-node[data-tree-entry-type="directory"]'
    )) {
      const files = dir.querySelectorAll(
        'li.js-tree-node[data-tree-entry-type="file"]'
      );
      dir.hidden = files.length > 0 && !Array.from(files).some((f) => !f.hidden);
    }

    const anyShown = diffEntries().some((e) => !e.container.hidden);
    const blank = document.querySelector(".js-file-filter-blankslate");
    if (blank) blank.hidden = anyShown;

    const label = document.querySelector(
      '[data-target="file-filter.fileFilterActiveText"], .js-file-filter-text'
    );
    if (label) {
      label.textContent =
        selected.size === buckets().size ? "File filter" : "File filter (filtered)";
    }
  }

  // Keeps our select-all row in sync with the per-extension boxes. Never
  // deselects: clicking it always means "show every bucket", so it can't be
  // used to empty the view.
  function syncSelectAll() {
    const boxes = Array.from(
      document.querySelectorAll(".js-compound-file-type-option")
    );
    const all = document.querySelector(".js-compound-select-all");
    const text = document.querySelector(".js-compound-select-all-text");
    if (!all || !text) return;
    const total = boxes.length;
    const complete = boxes.every((b) => b.checked);
    all.checked = complete;
    all.setAttribute("aria-disabled", String(complete));
    const noun = `file type${total === 1 ? "" : "s"}`;
    text.textContent = complete
      ? `All ${total} ${noun} selected`
      : `Select all ${total} ${noun}`;
    text.classList.toggle("color-fg-accent", !complete);
    text.classList.toggle("color-fg-muted", complete);
  }

  function render() {
    const form = document.querySelector(".js-file-filter-form");
    const fieldset = form && form.querySelector("fieldset");
    if (!fieldset) return;

    const counts = buckets();
    const exts = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b));

    if (selected === null) selected = new Set();
    for (const ext of exts) {
      if (!known.has(ext)) {
        known.add(ext);
        selected.add(ext); // new buckets default to shown
      }
    }

    // Swap GitHub's extension rows (and its select-all) for ours.
    fieldset.querySelectorAll("label.SelectMenu-item").forEach((el) => el.remove());

    for (const ext of exts) {
      const label = document.createElement("label");
      label.className = "SelectMenu-item";
      label.setAttribute("role", "menuitem");

      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "mr-2 js-compound-file-type-option";
      input.value = ext;
      input.checked = selected.has(ext);
      input.addEventListener("change", () => {
        input.checked ? selected.add(ext) : selected.delete(ext);
        apply();
        syncSelectAll();
      });

      const count = document.createElement("span");
      count.className = "text-normal js-file-type-count";
      count.textContent = ` (${counts.get(ext)})`;

      label.append(input, document.createTextNode(labelFor(ext)), count);
      fieldset.append(label);
    }

    // Our own select-all, mirroring GitHub's: an sr-only checkbox plus accent
    // link text (syncSelectAll swaps accent<->muted and the wording).
    const allLabel = document.createElement("label");
    allLabel.className = "SelectMenu-item";
    allLabel.setAttribute("role", "menuitem");

    const allInput = document.createElement("input");
    allInput.type = "checkbox";
    allInput.className = "sr-only hx_focus-input js-compound-select-all";
    allInput.addEventListener("change", () => {
      for (const ext of exts) selected.add(ext);
      fieldset
        .querySelectorAll(".js-compound-file-type-option")
        .forEach((box) => (box.checked = true));
      apply();
      syncSelectAll();
    });

    const allText = document.createElement("span");
    allText.className = "no-underline text-normal hx_focus-target js-compound-select-all-text";

    allLabel.append(allInput, allText);
    fieldset.append(allLabel);
    syncSelectAll();

    form.setAttribute(FLAG, "1");
  }

  let lastPaths = "";
  function sync() {
    if (!document.querySelector(".js-file-filter-form")) return;
    const paths = diffEntries()
      .map((e) => e.path)
      .sort()
      .join("|");
    // Nothing new since last run and we already own the form: no-op (this also
    // absorbs the mutations our own apply()/render() trigger).
    if (paths === lastPaths && document.querySelector(`.js-file-filter-form[${FLAG}]`)) {
      return;
    }
    lastPaths = paths;
    render();
    apply();
  }

  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(sync, 150);
  }

  if (!looksLikeGitHub()) return;

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  document.addEventListener("turbo:load", schedule);
  document.addEventListener("turbo:render", schedule);
  document.addEventListener("pjax:end", schedule);
  schedule();
})();
