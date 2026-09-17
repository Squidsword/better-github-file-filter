(() => {
  "use strict";

  // Marks a filter control once we've taken it over, so we don't re-inject.
  const FLAG = "data-compound-filter-ready";

  // Heading shown above our compound buckets (replaces GitHub's "File extensions").
  const GROUP_TITLE = "Smart file filter";

  // Octicon "dash" path — the partial (indeterminate) glyph for a parent whose
  // children are only some-selected, on the NEXT UI (LEGACY uses input.indeterminate).
  const DASH_PATH = "M2 7.75A.75.75 0 0 1 2.75 7h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 7.75Z";

  // ---------------------------------------------------------------------------
  // CORE — pure path -> bucket logic, shared by every adapter.
  // ---------------------------------------------------------------------------

  // Compound extension of a path, e.g. "app/Foo.test.tsx" -> ".test.tsx".
  // Everything after the filename's first dot. The final segment (the real extension) is
  // always kept, so purely-numeric extensions survive ("rustc.1" -> ".1" man pages,
  // "sheet.123" -> ".123" Lotus). Among the segments before it, purely-numeric ones are
  // dropped so version noise collapses ("jquery-3.6.0.min.js" -> ".min.js",
  // "lib.4.5.7.tar.gz" -> ".tar.gz"); alphanumeric segments are kept, so digit-bearing
  // extensions ("break.mp3", "launch.ps1") and markers ("app.e2e-spec.ts") survive.
  // Leading-dot dotfiles keep the dot as name (".env.local" -> ".local"). Case-insensitive:
  // ".MD" and ".md" fold into one ".md" bucket, since extension case is incidental.
  function extOf(path) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    const body = name.startsWith(".") ? name.slice(1) : name;
    const dot = body.indexOf(".");
    if (dot === -1) return "";
    const segs = body.slice(dot + 1).split(".");
    const ext = segs.pop(); // the real extension — always kept
    const quals = segs.filter((s) => !/^\d+$/.test(s)); // drop only numeric qualifiers
    return ("." + [...quals, ext].join(".")).toLowerCase();
  }

  function labelFor(ext) {
    return ext === "" ? "No extension" : ext;
  }

  // The base (last-segment) extension a compound bucket belongs to: the parent it
  // nests under. ".test.tsx" -> ".tsx", ".d.ts" -> ".ts", ".tsx" -> ".tsx", "" -> "".
  function baseOf(ext) {
    if (ext === "") return "";
    return ext.slice(ext.lastIndexOf("."));
  }

  function countBuckets(paths) {
    const counts = new Map();
    for (const p of paths) {
      const ext = extOf(p);
      counts.set(ext, (counts.get(ext) || 0) + 1);
    }
    return counts;
  }

  // Groups buckets into families for the two-level UI: each family is a base extension
  // with its variant children. Families and children are sorted, plain-base child first.
  function families(counts) {
    const byBase = new Map();
    for (const [ext, n] of counts) {
      const base = baseOf(ext);
      if (!byBase.has(base)) byBase.set(base, new Map());
      byBase.get(base).set(ext, n);
    }
    return [...byBase.entries()]
      .map(([base, kids]) => ({
        base,
        total: [...kids.values()].reduce((a, b) => a + b, 0),
        children: [...kids.entries()]
          .sort((a, b) => (a[0] === base ? -1 : b[0] === base ? 1 : a[0].localeCompare(b[0])))
          .map(([ext, count]) => ({ ext, count })),
      }))
      .sort((a, b) =>
        a.base === "" ? 1 : b.base === "" ? -1 : a.base.localeCompare(b.base)
      ); // the "No extension" family sorts last, like GitHub's native list
  }

  // "all" | "some" | "none" — how many of a family's children are currently shown.
  function familyState(children) {
    const on = children.filter((c) => selected.has(c.ext)).length;
    return on === 0 ? "none" : on === children.length ? "all" : "some";
  }

  // Strips bidi isolation marks GitHub wraps path text in.
  function stripBidi(s) {
    return s.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim();
  }

  // ---------------------------------------------------------------------------
  // SHARED STATE — the selection persists across re-renders and adapters. It holds
  // leaf buckets only; parent rows are derived aggregates over their children.
  // ---------------------------------------------------------------------------

  const known = new Set(); // every bucket we've ever shown
  let selected = null; // buckets currently checked
  const expanded = new Set(); // base extensions whose variants are revealed (default collapsed)

  // If a prior load carried GitHub's native ?file-filters param, the controller cleared it
  // and reloaded (so every file re-mounts); this is the filter it stashed, to re-apply as
  // our own selection. Native keys are last-segment (".ts") plus synthetic "dotfile"/"No extension".
  let restore = null;
  try {
    const raw = sessionStorage.getItem("cff-restore");
    if (raw) {
      restore = new Set(JSON.parse(raw));
      sessionStorage.removeItem("cff-restore");
    }
  } catch (e) {}

  function ensureSelected(exts) {
    if (selected === null) selected = new Set();
    for (const ext of exts) {
      if (known.has(ext)) continue;
      known.add(ext);
      // New buckets default to shown, unless we're restoring a prior native filter — then
      // only buckets whose base was in that filter start selected.
      const shown =
        !restore ||
        restore.has(baseOf(ext)) ||
        (ext === "" && (restore.has("No extension") || restore.has("dotfile")));
      if (shown) selected.add(ext);
    }
  }

  const isShown = (ext) => selected.has(ext);

  // A disclosure chevron for parent rows; rotates 90° when its family is expanded.
  // Built with the DOM API (not innerHTML) to stay clear of any Trusted-Types policy.
  const CHEVRON_PATH =
    "M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z";
  function chevron() {
    const NS = "http://www.w3.org/2000/svg";
    const span = document.createElement("span");
    span.className = "js-compound-chevron";
    span.style.cssText =
      "display:inline-flex;align-items:center;cursor:pointer;margin-left:auto;justify-self:end;color:var(--fgColor-muted,#848d97)";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    svg.style.transition = "transform .1s";
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", CHEVRON_PATH);
    svg.append(path);
    span.append(svg);
    return span;
  }

  // ---------------------------------------------------------------------------
  // LEGACY adapter — GitHub's classic, server-rendered Files-changed UI.
  // ---------------------------------------------------------------------------

  const LEGACY = {
    form: () => document.querySelector(".js-file-filter-form"),
    diffFiles: () =>
      Array.from(document.querySelectorAll(".file.js-file[data-tagsearch-path]")),
    treeFiles: () =>
      Array.from(
        document.querySelectorAll('li.js-tree-node[data-tree-entry-type="file"]')
      ),

    detect() {
      return !!this.form();
    },
    filterReady() {
      return !!this.form();
    },
    isMine() {
      return !!document.querySelector(`.js-file-filter-form[${FLAG}]`);
    },

    listPaths() {
      return this.diffFiles().map((f) => f.getAttribute("data-tagsearch-path"));
    },

    treePath(row) {
      const span = row.querySelector("[data-filterable-item-text]");
      return span ? span.textContent.trim() : "";
    },

    applyVisibility() {
      for (const f of this.diffFiles()) {
        const container = f.closest("copilot-diff-entry") || f;
        const hide = !isShown(extOf(f.getAttribute("data-tagsearch-path")));
        if (container.hidden !== hide) container.hidden = hide;
      }
      for (const row of this.treeFiles()) {
        const path = this.treePath(row);
        if (!path) continue;
        const hide = !isShown(extOf(path));
        if (row.hidden !== hide) row.hidden = hide;
      }
      // Collapse directory rows whose files are all hidden.
      for (const dir of document.querySelectorAll(
        'li.js-tree-node[data-tree-entry-type="directory"]'
      )) {
        const files = dir.querySelectorAll(
          'li.js-tree-node[data-tree-entry-type="file"]'
        );
        const hide =
          files.length > 0 && !Array.from(files).some((f) => !f.hidden);
        if (dir.hidden !== hide) dir.hidden = hide;
      }

      const anyShown = this.diffFiles().some(
        (f) => !(f.closest("copilot-diff-entry") || f).hidden
      );
      const blank = document.querySelector(".js-file-filter-blankslate");
      if (blank && blank.hidden === anyShown) blank.hidden = !anyShown;

      const label = document.querySelector(
        '[data-target="file-filter.fileFilterActiveText"], .js-file-filter-text'
      );
      if (label) {
        label.textContent =
          selected.size === known.size ? "File filter" : "File filter (filtered)";
      }
    },

    // Two-level filter UI: each base extension is a parent row (a folder-style
    // checkbox that cascades to its children), variants indented beneath it.
    renderFilter(exts, counts) {
      const form = this.form();
      const fieldset = form && form.querySelector("fieldset");
      if (!fieldset) return;

      fieldset.querySelectorAll("label.SelectMenu-item").forEach((el) => el.remove());

      const leaf = ({ ext, count }, indent) => {
        const label = document.createElement("label");
        label.className = "SelectMenu-item";
        label.setAttribute("role", "menuitem");
        if (indent) {
          label.style.paddingLeft = "28px";
          label.dataset.childBase = baseOf(ext);
        }
        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "mr-2 js-compound-file-type-option";
        input.value = ext;
        input.dataset.base = baseOf(ext);
        input.addEventListener("change", () => {
          input.checked ? selected.add(ext) : selected.delete(ext);
          this.applyVisibility();
          this.refreshChecks();
        });
        const count_ = document.createElement("span");
        count_.className = "text-normal js-file-type-count";
        count_.textContent = ` (${count})`;
        label.append(input, document.createTextNode(labelFor(ext)), count_);
        return label;
      };

      const parent = (fam) => {
        const label = document.createElement("label");
        label.className = "SelectMenu-item";
        label.setAttribute("role", "menuitem");
        label.dataset.parentBase = fam.base;
        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "mr-2 js-compound-parent";
        input.dataset.base = fam.base;
        input.addEventListener("change", () => {
          const on = fam.children.some((c) => !selected.has(c.ext)); // any unchecked -> turn all on
          for (const c of fam.children) on ? selected.add(c.ext) : selected.delete(c.ext);
          this.applyVisibility();
          this.refreshChecks();
        });
        const chev = chevron();
        chev.addEventListener("click", (e) => {
          e.preventDefault(); // stop the label from toggling its checkbox
          e.stopPropagation();
          expanded.has(fam.base) ? expanded.delete(fam.base) : expanded.add(fam.base);
          this.applyCollapse();
        });
        const name = document.createElement("span");
        name.className = "text-bold";
        name.textContent = labelFor(fam.base);
        const count_ = document.createElement("span");
        count_.className = "text-normal js-file-type-count";
        count_.textContent = ` (${fam.total})`;
        label.append(input, name, count_, chev);
        return label;
      };

      for (const fam of families(counts)) {
        if (fam.children.length === 1) {
          fieldset.append(leaf(fam.children[0], false));
        } else {
          fieldset.append(parent(fam));
          for (const c of fam.children) fieldset.append(leaf(c, true));
        }
      }

      // Global select-all — an sr-only checkbox plus accent link text. Never
      // deselects: clicking it always means "show every bucket".
      const allLabel = document.createElement("label");
      allLabel.className = "SelectMenu-item";
      allLabel.setAttribute("role", "menuitem");
      const allInput = document.createElement("input");
      allInput.type = "checkbox";
      allInput.className = "sr-only hx_focus-input js-compound-select-all";
      allInput.addEventListener("change", () => {
        for (const ext of exts) selected.add(ext);
        this.applyVisibility();
        this.refreshChecks();
      });
      const allText = document.createElement("span");
      allText.className =
        "no-underline text-normal hx_focus-target js-compound-select-all-text";
      allLabel.append(allInput, allText);
      fieldset.append(allLabel);

      this.refreshChecks();
      this.applyCollapse();
      form.setAttribute(FLAG, "1");
    },

    // Shows/hides variant rows per the expanded set and rotates each parent chevron.
    applyCollapse() {
      for (const row of document.querySelectorAll("label[data-child-base]")) {
        const hide = !expanded.has(row.dataset.childBase);
        if (row.hidden !== hide) row.hidden = hide;
      }
      for (const row of document.querySelectorAll("label[data-parent-base]")) {
        const svg = row.querySelector(".js-compound-chevron svg");
        if (svg) {
          svg.style.transform = expanded.has(row.dataset.parentBase) ? "rotate(90deg)" : "";
        }
      }
    },

    // Mirrors every checkbox to the selection: leaves reflect membership, parents go
    // checked / indeterminate / unchecked over their children, select-all over all.
    refreshChecks() {
      const leaves = Array.from(
        document.querySelectorAll(".js-compound-file-type-option")
      );
      for (const box of leaves) box.checked = selected.has(box.value);

      for (const par of document.querySelectorAll(".js-compound-parent")) {
        const kids = leaves.filter((b) => b.dataset.base === par.dataset.base);
        const on = kids.filter((b) => b.checked).length;
        par.checked = on === kids.length;
        par.indeterminate = on > 0 && on < kids.length;
      }

      const all = document.querySelector(".js-compound-select-all");
      const text = document.querySelector(".js-compound-select-all-text");
      if (!all || !text) return;
      const total = leaves.length;
      const complete = leaves.every((b) => b.checked);
      all.checked = complete;
      all.setAttribute("aria-disabled", String(complete));
      const noun = `file type${total === 1 ? "" : "s"}`;
      text.textContent = complete
        ? `All ${total} ${noun} selected`
        : `Select all ${total} ${noun}`;
      text.classList.toggle("color-fg-accent", !complete);
      text.classList.toggle("color-fg-muted", complete);
    },
  };

  // ---------------------------------------------------------------------------
  // NEXT adapter — GitHub's upgraded, React-rendered Files-changed experience.
  // The diff list is virtualized: every file keeps an always-mounted wrapper
  // (a placeholder carrying data-estimated-height) while only the inner <table>
  // is lazily filled. Collapsing that wrapper hides a file without fighting the
  // virtualizer. The filter lives in a Primer ActionList popover we inject into.
  // ---------------------------------------------------------------------------

  const NEXT = {
    button: () => {
      const svg = document.querySelector("button svg.octicon-filter");
      return svg ? svg.closest("button") : null;
    },
    menu: () =>
      document.querySelector('[class*="prc-ActionList-ActionList"][role="menu"]'),
    wrappers: () =>
      Array.from(
        document.querySelectorAll(
          'div[id^="diff-"][class*="Diff-module__diffTargetable"]'
        )
      ),
    treeFiles: () =>
      Array.from(
        document.querySelectorAll('li[role="treeitem"]:not([aria-expanded])')
      ),
    treeDirs: () =>
      Array.from(document.querySelectorAll('li[role="treeitem"][aria-expanded]')),

    detect() {
      return !LEGACY.form() && this.wrappers().length > 0;
    },
    filterReady() {
      return !!this.menu();
    },
    isMine() {
      const m = this.menu();
      return !!(m && m.querySelector(`[${FLAG}]`));
    },

    pathOf(wrapper) {
      const table = wrapper.querySelector("table[data-diff-anchor][aria-label]");
      if (table) return table.getAttribute("aria-label").replace(/^Diff for:\s*/, "");
      const link = wrapper.querySelector('a[href^="#diff-"]');
      return link ? stripBidi(link.textContent) : "";
    },

    listPaths() {
      return this.wrappers()
        .map((w) => this.pathOf(w))
        .filter(Boolean);
    },

    applyVisibility() {
      for (const w of this.wrappers()) {
        const vis = isShown(extOf(this.pathOf(w))) ? "" : "none";
        if (w.style.display !== vis) w.style.display = vis;
      }
      const files = this.treeFiles();
      for (const row of files) {
        const hide = !isShown(extOf(row.id));
        if (row.hidden !== hide) row.hidden = hide;
      }
      // Collapse directory rows whose descendant files are all hidden.
      for (const dir of this.treeDirs()) {
        const prefix = dir.id + "/";
        const kids = files.filter((f) => f.id.startsWith(prefix));
        const hide = kids.length > 0 && !kids.some((f) => !f.hidden);
        if (dir.hidden !== hide) dir.hidden = hide;
      }
    },

    renderFilter(exts, counts) {
      const menu = this.menu();
      if (!menu) return;

      // Find GitHub's "File extensions" group and a native item to clone (so our
      // rows inherit Primer's exact styling and future-proof against class hashes).
      const groups = Array.from(
        menu.querySelectorAll('li[class*="ActionList-Group"]')
      );
      const group = groups.find((g) => {
        const h = g.querySelector('[class*="GroupHeading"]');
        return h && (h.textContent.trim() === "File extensions" || g.hasAttribute(FLAG));
      });
      const list = group && group.querySelector('ul[role="group"]');
      if (!list) return;
      const template =
        this._template || list.querySelector('li[role="menuitemcheckbox"]');
      if (!template) return;
      this._template = template.cloneNode(true); // keep a pristine copy
      const checkPath = template.querySelector("svg.octicon-check path");
      if (checkPath) this._checkPath = checkPath.getAttribute("d");

      // Already ours and consistent with the current bucket set: nothing to do.
      if (
        list.getAttribute(FLAG) &&
        list.querySelectorAll("[data-compound-ext]").length === exts.length
      ) {
        return;
      }

      const heading = group.querySelector('[class*="GroupHeading"]');
      if (heading) heading.textContent = GROUP_TITLE;

      list.setAttribute(FLAG, "1");
      list.querySelectorAll('li[role="menuitemcheckbox"]').forEach((el) => el.remove());

      const item = (labelText, countText) => {
        const li = template.cloneNode(true);
        li.removeAttribute("id");
        li.removeAttribute("aria-keyshortcuts");
        li.removeAttribute("aria-labelledby");
        const label = li.querySelector('[class*="ItemLabel"]');
        if (label) label.textContent = labelText;
        const trailing = li.querySelector('[class*="TrailingVisual"]');
        if (countText === null) {
          if (trailing) trailing.remove();
        } else if (trailing) {
          const counter = trailing.querySelector('[data-component="CounterLabel"]');
          if (counter) counter.textContent = countText;
          const hidden = trailing.querySelector('[class*="VisuallyHidden"]');
          if (hidden) hidden.textContent = ` (${countText})`;
        }
        return li;
      };
      const indent = (li) => {
        const content = li.querySelector('[class*="ActionListContent"]') || li;
        content.style.paddingLeft = "24px";
      };

      const leaf = ({ ext, count }, indented) => {
        const li = item(labelFor(ext), String(count));
        li.dataset.compoundExt = ext;
        li.dataset.base = baseOf(ext);
        if (indented) {
          indent(li);
          li.dataset.childBase = baseOf(ext);
        }
        li.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          selected.has(ext) ? selected.delete(ext) : selected.add(ext);
          this.applyVisibility();
          this.refreshChecks(list);
        });
        return li;
      };

      const parent = (fam) => {
        const li = item(labelFor(fam.base), String(fam.total));
        li.dataset.compoundParent = fam.base;
        const label = li.querySelector('[class*="ItemLabel"]');
        if (label) label.style.fontWeight = "600";
        const chev = chevron();
        chev.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          expanded.has(fam.base) ? expanded.delete(fam.base) : expanded.add(fam.base);
          this.applyCollapse(list);
        });
        // Primer's row is a CSS grid, so pin the chevron to the right edge
        // absolutely rather than relying on flow order.
        const content = li.querySelector('[class*="ActionListContent"]') || li;
        content.style.position = "relative";
        content.style.paddingRight = "28px";
        chev.style.position = "absolute";
        chev.style.right = "8px";
        chev.style.top = "0";
        chev.style.bottom = "0";
        chev.style.marginTop = "auto";
        chev.style.marginBottom = "auto";
        content.append(chev);
        li.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const on = fam.children.some((c) => !selected.has(c.ext));
          for (const c of fam.children) on ? selected.add(c.ext) : selected.delete(c.ext);
          this.applyVisibility();
          this.refreshChecks(list);
        });
        return li;
      };

      for (const fam of families(counts)) {
        if (fam.children.length === 1) {
          list.append(leaf(fam.children[0], false));
        } else {
          list.append(parent(fam));
          for (const c of fam.children) list.append(leaf(c, true));
        }
      }

      // Global select-all row — never deselects; clicking it shows every bucket.
      const allItem = item("", null);
      allItem.dataset.compoundSelectAll = "1";
      allItem.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        for (const ext of exts) selected.add(ext);
        this.applyVisibility();
        this.refreshChecks(list);
      });
      list.append(allItem);

      this.refreshChecks(list);
      this.applyCollapse(list);
      this.pinOverlay(menu);
    },

    // Freeze the popover's top-left so expanding a family grows it downward rather
    // than letting Primer's anchor re-flip it (which shifts the dropdown). Capped to
    // the viewport so a tall, fully-expanded list scrolls inside instead of overflowing.
    pinOverlay(menu) {
      const overlay = menu.closest('[class*="AnchoredOverlay"]');
      if (!overlay || overlay.dataset.compoundPinned) return;
      const r = overlay.getBoundingClientRect();
      overlay.style.top = Math.round(r.top) + "px";
      overlay.style.left = Math.round(r.left) + "px";
      overlay.style.bottom = "auto";
      overlay.style.right = "auto";
      overlay.style.maxHeight = Math.floor(window.innerHeight - r.top - 16) + "px";
      overlay.dataset.compoundPinned = "1";
    },

    // Shows/hides variant rows per the expanded set and rotates each parent chevron.
    applyCollapse(list) {
      for (const li of list.querySelectorAll("[data-child-base]")) {
        const hide = !expanded.has(li.dataset.childBase);
        if (li.hidden !== hide) li.hidden = hide;
      }
      for (const par of list.querySelectorAll("[data-compound-parent]")) {
        const svg = par.querySelector(".js-compound-chevron svg");
        if (svg) {
          svg.style.transform = expanded.has(par.dataset.compoundParent) ? "rotate(90deg)" : "";
        }
      }
    },

    // Sets a Primer row's checkmark: true (check), "mixed" (dash), false (hidden).
    setCheck(li, state) {
      li.setAttribute("aria-checked", state === true ? "true" : state === "mixed" ? "mixed" : "false");
      const svg = li.querySelector("svg.octicon-check");
      const path = svg && svg.querySelector("path");
      if (!svg) return;
      if (state === "mixed") {
        if (path) path.setAttribute("d", DASH_PATH);
        svg.style.visibility = "visible";
      } else {
        if (path && this._checkPath) path.setAttribute("d", this._checkPath);
        svg.style.visibility = ""; // Primer CSS shows it only when aria-checked=true
      }
    },

    refreshChecks(list) {
      const leaves = Array.from(list.querySelectorAll("[data-compound-ext]"));
      for (const li of leaves) this.setCheck(li, selected.has(li.dataset.compoundExt));

      for (const par of list.querySelectorAll("[data-compound-parent]")) {
        const kids = leaves.filter((li) => li.dataset.base === par.dataset.compoundParent);
        const state = familyState(kids.map((li) => ({ ext: li.dataset.compoundExt })));
        this.setCheck(par, state === "all" ? true : state === "some" ? "mixed" : false);
      }

      const all = list.querySelector("[data-compound-select-all]");
      if (!all) return;
      const total = leaves.length;
      const complete = leaves.every((li) => selected.has(li.dataset.compoundExt));
      this.setCheck(all, complete);
      const noun = `file type${total === 1 ? "" : "s"}`;
      const label = all.querySelector('[class*="ItemLabel"]');
      if (label) {
        label.textContent = complete
          ? `All ${total} ${noun} selected`
          : `Select all ${total} ${noun}`;
      }
    },
  };

  // ---------------------------------------------------------------------------
  // CONTROLLER — detect the live experience and drive the matching adapter.
  // ---------------------------------------------------------------------------

  // True on github.com and any GitHub Enterprise install — detected by GitHub's
  // own markup, never by hostname (enterprise domains are arbitrary).
  function looksLikeGitHub() {
    return !!document.querySelector(
      'meta[name="hostname"], meta[name="github-keyboard-shortcuts"], meta[name="request-id"], #js-repo-pjax-container, .application-main, .js-file-filter-form'
    );
  }

  function activeAdapter() {
    if (LEGACY.detect()) return LEGACY;
    if (NEXT.detect()) return NEXT;
    return null;
  }

  let lastKey = "";
  let lastExts = [];
  let lastCounts = new Map();
  let urlHandled = false;
  let menuWasOpen = false;

  function sync() {
    const adapter = activeAdapter();
    if (!adapter) return;

    // On the NEXT UI the popover unmounts when closed. Reset the expand state then, so it
    // always reopens compact — otherwise a lingering-open family makes Primer re-anchor the
    // taller popover to a different spot. (Expand still persists across re-renders while open.)
    if (adapter === NEXT) {
      const open = adapter.filterReady();
      if (menuWasOpen && !open) expanded.clear();
      menuWasOpen = open;
    }

    // On the NEXT UI, a pre-existing native filter in the URL leaves the non-matching
    // files unmounted — we'd never see them and couldn't bring them back. Clear it once
    // and reload so every file mounts; ensureSelected re-applies it as our own selection.
    if (adapter === NEXT && !urlHandled) {
      urlHandled = true;
      const params = new URLSearchParams(location.search);
      if (params.has("file-filters[]")) {
        sessionStorage.setItem(
          "cff-restore",
          JSON.stringify(params.getAll("file-filters[]"))
        );
        params.delete("file-filters[]");
        const qs = params.toString();
        location.replace(location.pathname + (qs ? "?" + qs : "") + location.hash);
        return;
      }
    }

    const paths = adapter.listPaths();
    const key = paths.slice().sort().join("|");
    if (key !== lastKey) {
      lastKey = key;
      lastCounts = countBuckets(paths);
      lastExts = Array.from(lastCounts.keys()).sort((a, b) => a.localeCompare(b));
      ensureSelected(lastExts);
      restore = null; // consumed once, against the first real file set
    }

    if (adapter.filterReady() && !adapter.isMine()) {
      adapter.renderFilter(lastExts, lastCounts);
    }
    adapter.applyVisibility();
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
