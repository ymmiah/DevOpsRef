/* DevOpsRef UI */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var TYPE_LABEL = { journal: "Journal article", conference: "Conference paper", chapter: "Book chapter", book: "Book",
    report: "Report / survey", standard: "Standard / framework", web: "Web article / docs", preprint: "Preprint" };
  var TYPE_ORDER = ["journal", "conference", "chapter", "book", "report", "standard", "web", "preprint"];

  var DATA, REFS, ENGINE, MINY, MAXY, SECTIONS = [], TAGS = [];
  var selected = new Set();
  var current = [];       // currently displayed records
  var lastHL = {};        // id -> highlight terms
  var state = defaults();

  function defaults() {
    return { q: "", from: null, to: null, peer: false, found: false, doi: false, fuzzy: true, minc: null,
      types: new Set(), sections: new Set(), tags: new Set(), sort: "relevance" };
  }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function highlight(text, terms) {
    text = String(text == null ? "" : text);
    if (!terms || !terms.length) return esc(text);
    var parts = terms.filter(Boolean).map(function (t) {
      return reEsc(String(t).trim()).replace(/\s+/g, "[\\s\\-‐‑–—]+");
    }).filter(Boolean).sort(function (a, b) { return b.length - a.length; });
    if (!parts.length) return esc(text);
    var re;
    try { re = new RegExp("(?<![A-Za-z0-9])(" + parts.join("|") + ")", "gi"); }
    catch (e) { re = new RegExp("(" + parts.join("|") + ")", "gi"); }
    var out = "", last = 0, m;
    while ((m = re.exec(text))) {
      if (!m[0].length) { re.lastIndex++; continue; }
      out += esc(text.slice(last, m.index)) + "<mark>" + esc(m[0]) + "</mark>";
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }
  function toast(msg) {
    var t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  function copyText(txt, msg) {
    function fallback() {
      var ta = document.createElement("textarea"); ta.value = txt; ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast(msg || "Copied"); } catch (e) { toast("Copy failed"); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(function () { toast(msg || "Copied"); }, fallback);
    else fallback();
  }
  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function fmtAuthors(r) {
    var a = Exporters.authorList(r);
    var list = a.list;
    if (list.length > 8) return list.slice(0, 7).join("; ") + "; … " + list[list.length - 1];
    return list.join("; ") + (a.truncated ? " et al." : "");
  }
  function venueLine(r) {
    var v = r.venue || "";
    var bits = [];
    if (r.type === "journal") {
      bits.push(v);
      if (r.volume) bits.push(r.volume + (r.issue ? "(" + r.issue + ")" : ""));
      if (r.pages) bits.push(/[–-]/.test(r.pages) ? "pp. " + r.pages : r.pages);
    } else if (r.type === "conference" || r.type === "chapter") {
      bits.push(v); if (r.publisher) bits.push(r.publisher); if (r.pages) bits.push("pp. " + r.pages);
    } else {
      bits.push(v);
      if (r.edition) bits.unshift(r.edition);
    }
    return bits.filter(Boolean).join(", ");
  }

  /* ---------- URL state ---------- */
  function readURL() {
    var p = new URLSearchParams(location.search);
    var s = defaults();
    s.q = p.get("q") || "";
    if (p.get("from")) s.from = +p.get("from");
    if (p.get("to")) s.to = +p.get("to");
    s.peer = p.get("peer") === "1"; s.found = p.get("found") === "1"; s.doi = p.get("doi") === "1";
    s.fuzzy = p.get("fuzzy") !== "0";
    if (p.get("minc")) s.minc = +p.get("minc");
    (p.get("type") || "").split(",").filter(Boolean).forEach(function (x) { s.types.add(x); });
    (p.get("sec") || "").split(",").filter(Boolean).forEach(function (x) { s.sections.add(+x); });
    p.getAll("tag").forEach(function (x) { if (x) s.tags.add(x); });
    if (p.get("sort")) s.sort = p.get("sort");
    return s;
  }
  function writeURL() {
    var p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.from != null && state.from !== MINY) p.set("from", state.from);
    if (state.to != null && state.to !== MAXY) p.set("to", state.to);
    if (state.peer) p.set("peer", "1"); if (state.found) p.set("found", "1"); if (state.doi) p.set("doi", "1");
    if (!state.fuzzy) p.set("fuzzy", "0");
    if (state.minc) p.set("minc", state.minc);
    if (state.types.size) p.set("type", Array.from(state.types).join(","));
    if (state.sections.size) p.set("sec", Array.from(state.sections).sort(function (a, b) { return a - b; }).join(","));
    state.tags.forEach(function (t) { p.append("tag", t); });
    if (state.sort !== "relevance") p.set("sort", state.sort);
    var qs = p.toString();
    var url = location.pathname + (qs ? "?" + qs : "") + location.hash;
    if (url !== location.pathname + location.search + location.hash) history.replaceState(null, "", url);
  }

  /* ---------- filtering ---------- */
  function yearRangeActive() { return (state.from != null && state.from > MINY) || (state.to != null && state.to < MAXY); }
  function passes(r, skip) {
    if (skip !== "year" && yearRangeActive()) {
      if (r.year == null) return false;
      if (state.from != null && r.year < state.from) return false;
      if (state.to != null && r.year > state.to) return false;
    }
    if (skip !== "peer" && state.peer && !r.peerReviewed) return false;
    if (skip !== "found" && state.found && !r.foundational) return false;
    if (skip !== "doi" && state.doi && !r.doi) return false;
    if (skip !== "minc" && state.minc && !(r.citations != null && r.citations >= state.minc)) return false;
    if (skip !== "type" && state.types.size && !state.types.has(r.type)) return false;
    if (skip !== "section" && state.sections.size && !state.sections.has(r.section.number)) return false;
    if (skip !== "tag" && state.tags.size) {
      for (var t of state.tags) if (r.tags.indexOf(t) === -1) return false;
    }
    return true;
  }

  var SORTERS = {
    "relevance": function (a, b) { return (b.score - a.score) || (a.ref.section.number - b.ref.section.number) || (a.idx - b.idx); },
    "year-desc": function (a, b) { return ((b.ref.year || 0) - (a.ref.year || 0)) || a.ref.harvard.localeCompare(b.ref.harvard); },
    "year-asc": function (a, b) { return ((a.ref.year || 9999) - (b.ref.year || 9999)) || a.ref.harvard.localeCompare(b.ref.harvard); },
    "cites-desc": function (a, b) { return ((b.ref.citations == null ? -1 : b.ref.citations) - (a.ref.citations == null ? -1 : a.ref.citations)) || ((b.ref.year || 0) - (a.ref.year || 0)); },
    "author-asc": function (a, b) { return a.ref.harvard.localeCompare(b.ref.harvard, "en", { sensitivity: "base" }); },
    "title-asc": function (a, b) { return a.ref.title.localeCompare(b.ref.title, "en", { sensitivity: "base" }); },
    "section": function (a, b) { return (a.ref.section.number - b.ref.section.number) || (a.idx - b.idx); }
  };

  /* ---------- main update ---------- */
  var lastSearch = null;
  function update(opts) {
    opts = opts || {};
    var sr = ENGINE.search(state.q, { fuzzy: state.fuzzy });
    lastSearch = sr;
    var base = sr.results.map(function (x) { return { ref: x.ref, score: x.score, hl: x.hl, idx: REFS.indexOf(x.ref) }; });
    var list = base.filter(function (x) { return passes(x.ref); });
    var sortKey = state.sort === "relevance" && sr.empty ? "section" : state.sort;
    list.sort(SORTERS[sortKey] || SORTERS.relevance);
    current = list.map(function (x) { return x.ref; });
    lastHL = {}; list.forEach(function (x) { lastHL[x.ref.id] = x.hl; });

    renderFacets(base);
    renderCards(list);
    renderQueryInfo(sr);
    renderActive();
    $("#resultCount").innerHTML = "<b>" + list.length + "</b> of " + REFS.length + " references";
    document.title = (state.q ? state.q + " — " : "") + "DevOpsRef — DevOps & Enterprise Automation Reference Library";
    updateBulk();
    if (!opts.noURL) writeURL();
  }

  function count(base, skip, pred) {
    var n = 0; for (var i = 0; i < base.length; i++) if (pred(base[i].ref) && passes(base[i].ref, skip)) n++; return n;
  }

  function renderFacets(base) {
    // types
    $("#typeFacet").innerHTML = TYPE_ORDER.filter(function (t) { return REFS.some(function (r) { return r.type === t; }); }).map(function (t) {
      var n = count(base, "type", function (r) { return r.type === t; });
      return '<label class="check' + (n ? "" : " zero") + '"><input type="checkbox" data-facet="type" value="' + t + '"' + (state.types.has(t) ? " checked" : "") +
        '><span class="lbl">' + esc(TYPE_LABEL[t] || t) + '</span><span class="count">' + n + "</span></label>";
    }).join("");
    $("#sectionFacet").innerHTML = SECTIONS.map(function (s) {
      var n = count(base, "section", function (r) { return r.section.number === s.number; });
      return '<label class="check' + (n ? "" : " zero") + '"><input type="checkbox" data-facet="section" value="' + s.number + '"' + (state.sections.has(s.number) ? " checked" : "") +
        '><span class="lbl">' + s.number + ". " + esc(s.name) + '</span><span class="count">' + n + "</span></label>";
    }).join("");
    var tagCounts = TAGS.map(function (t) { return { t: t, n: count(base, "tag", function (r) { return r.tags.indexOf(t) !== -1; }) }; });
    tagCounts.sort(function (a, b) { return (b.n - a.n) || a.t.localeCompare(b.t); });
    $("#tagFacet").innerHTML = tagCounts.map(function (x) {
      var on = state.tags.has(x.t);
      return '<button type="button" class="tag-toggle' + (x.n || on ? "" : " zero") + '" data-tag="' + esc(x.t) + '" aria-pressed="' + on + '">' + esc(x.t) + ' <span class="n">' + x.n + "</span></button>";
    }).join("");
    $("#cPeer").textContent = count(base, "peer", function (r) { return r.peerReviewed; });
    $("#cFound").textContent = count(base, "found", function (r) { return r.foundational; });
    $("#cDoi").textContent = count(base, "doi", function (r) { return !!r.doi; });
  }

  var ICON_LINK = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>';
  var ICON_COPY = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';

  function renderCards(list) {
    var html = list.map(function (x) {
      var r = x.ref, hl = x.hl;
      var link = r.url ? (r.doi ? "https://doi.org/" + r.doi : r.url) : null;
      var linkText = r.doi ? "doi:" + r.doi : (r.url || "").replace(/^https?:\/\//, "");
      var sel = selected.has(r.id);
      return '<li class="card' + (sel ? " selected" : "") + '" data-id="' + esc(r.id) + '">' +
        '<input type="checkbox" class="card-select" aria-label="Select ' + esc(r.title) + '"' + (sel ? " checked" : "") + ">" +
        '<div class="card-meta-top">' +
          '<span class="badge type-' + r.type + '">' + esc(TYPE_LABEL[r.type] || r.type) + "</span>" +
          (r.peerReviewed ? '<span class="badge peer" title="Peer-reviewed">✓ Peer-reviewed</span>' : "") +
          (r.foundationalLabel ? '<span class="badge found" title="Labelled [Foundational] in the source document">★ Foundational</span>' :
            (r.seminal ? '<span class="badge found" title="Section 13: seminal and highly cited works">★ Seminal</span>' : "")) +
          (r.citations != null ? '<span class="badge cites" title="Approximate OpenAlex citation count, Oct 2026">' + r.citations.toLocaleString("en-GB") + " citations</span>" : "") +
          '<span class="badge soft" title="Section in the reference document">§' + r.section.number + " " + esc(r.section.name) + "</span>" +
        "</div>" +
        '<h3 class="card-title">' + (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">' + highlight(r.title, hl) + "</a>" : highlight(r.title, hl)) + "</h3>" +
        '<p class="card-authors">' + highlight(fmtAuthors(r), hl) + "</p>" +
        '<p class="card-venue"><span class="card-year">' + (r.year != null ? r.year + (r.yearSuffix || "") : "n.d.") + "</span> · " + highlight(venueLine(r), hl) + "</p>" +
        (r.inText ? '<div class="cite-strip" aria-label="In-text citation (Harvard, Cite Them Right)">' +
          '<div class="cite-row"><span class="cite-label">In-text</span><code class="cite-val">' + highlight(r.inText, hl) + '</code>' +
            '<button type="button" class="btn btn-ghost btn-copy" data-act="intext" title="Copy parenthetical in-text citation" aria-label="Copy in-text citation ' + esc(r.inText) + '">' + ICON_COPY + "Copy</button></div>" +
          '<div class="cite-row"><span class="cite-label">Narrative</span><code class="cite-val">' + highlight(r.narrative, hl) + '</code>' +
            '<button type="button" class="btn btn-ghost btn-copy" data-act="narrative" title="Copy narrative citation" aria-label="Copy narrative citation ' + esc(r.narrative) + '">' + ICON_COPY + "Copy</button></div>" +
        "</div>" : "") +
        (r.relevance ? '<p class="card-rel">' + highlight(r.relevance, hl) + "</p>" : "") +
        '<div class="card-tags">' + r.tags.map(function (t) { return '<button type="button" class="card-tag" data-tag="' + esc(t) + '" title="Filter by tag">' + highlight(t, hl) + "</button>"; }).join("") + "</div>" +
        '<div class="card-foot">' +
          (link ? '<a class="card-link" href="' + esc(link) + '" target="_blank" rel="noopener">' + ICON_LINK + highlight(linkText, hl) + "</a>" : "<span></span>") +
          '<div class="card-actions">' +
            '<button type="button" class="btn btn-ghost" data-act="harvard">' + ICON_COPY + "Copy full reference</button>" +
            '<button type="button" class="btn btn-ghost" data-act="bibtex">' + ICON_COPY + "Copy BibTeX</button>" +
          "</div>" +
        "</div>" +
        '<details class="cite-block"><summary>Show full reference, in-text &amp; BibTeX</summary><pre>' + esc(r.harvard) + "</pre>" + (r.inText ? "<pre>In-text: " + esc(r.inText) + "\nNarrative: " + esc(r.narrative) + "</pre>" : "") + "<pre>" + esc(Exporters.toBibTeX(r)) + "</pre></details>" +
      "</li>";
    }).join("");
    $("#cards").innerHTML = html;
    $("#empty").hidden = list.length > 0;
  }

  function renderQueryInfo(sr) {
    var el = $("#queryInfo");
    if (!state.q.trim()) { el.innerHTML = ""; return; }
    var toks = RefSearch.lex(state.q);
    var chips = toks.map(function (t) {
      if (t.t === "AND" || t.t === "OR" || t.t === "NOT" || t.t === "(" || t.t === ")") return '<span class="qtok op">' + t.t + "</span>";
      var term = t.t === "NEG" ? t.term : t;
      var label = (term.field ? term.field + ": " : "") + (term.phrase ? "\u201C" + term.value + "\u201D" : term.value);
      return '<span class="qtok' + (t.t === "NEG" ? " neg" : "") + '">' + (t.t === "NEG" ? "NOT " : "") + esc(label) + "</span>";
    }).join("");
    var fz = Object.keys(sr.fuzzyUsed || {});
    var note = fz.length ? ' <span class="warn">· typo-tolerant match: ' + fz.map(function (k) { return esc(k) + " → " + esc(sr.fuzzyUsed[k]); }).join(", ") + "</span>" : "";
    el.innerHTML = '<span>Query:</span> ' + chips + note;
  }

  function renderActive() {
    var chips = [];
    function chip(label, key, val) { chips.push('<button type="button" class="af-chip" data-rm="' + key + '" data-val="' + esc(val == null ? "" : val) + '">' + esc(label) + ' <span aria-hidden="true">×</span><span class="visually-hidden">remove filter</span></button>'); }
    if (yearRangeActive()) chip("Years " + (state.from || MINY) + "–" + (state.to || MAXY), "year");
    if (state.peer) chip("Peer-reviewed", "peer");
    if (state.found) chip("Foundational / seminal", "found");
    if (state.doi) chip("Has DOI", "doi");
    if (state.minc) chip("≥ " + state.minc + " citations", "minc");
    state.types.forEach(function (t) { chip(TYPE_LABEL[t] || t, "type", t); });
    state.sections.forEach(function (s) { chip("§" + s, "section", s); });
    state.tags.forEach(function (t) { chip("#" + t, "tag", t); });
    $("#activeFilters").innerHTML = chips.join("");
    var n = chips.length;
    var b = $("#activeCount"); b.hidden = !n; b.textContent = n;
  }

  function updateBulk() {
    var shown = current.length;
    var shownSel = current.filter(function (r) { return selected.has(r.id); }).length;
    var all = $("#selectAll");
    all.checked = shown > 0 && shownSel === shown;
    all.indeterminate = shownSel > 0 && shownSel < shown;
    $("#selLabel").textContent = selected.size ? selected.size + " selected" : "Select all shown";
    $("#exportScope").textContent = selected.size ? "Export " + selected.size + " selected:" : "Export " + shown + " results:";
    $("#bulkbar").classList.toggle("has-sel", selected.size > 0);
  }

  function exportRows() {
    if (selected.size) return REFS.filter(function (r) { return selected.has(r.id); }).sort(function (a, b) { return a.harvard.localeCompare(b.harvard); });
    return current.slice();
  }

  /* ---------- controls sync ---------- */
  function syncControls() {
    $("#q").value = state.q;
    $("#yFrom").value = state.from != null ? state.from : MINY;
    $("#yTo").value = state.to != null ? state.to : MAXY;
    $("#yFromR").value = state.from != null ? state.from : MINY;
    $("#yToR").value = state.to != null ? state.to : MAXY;
    $("#fPeer").checked = state.peer; $("#fFound").checked = state.found; $("#fDoi").checked = state.doi;
    $("#fFuzzy").checked = state.fuzzy;
    $("#fMinC").value = state.minc || "";
    $("#sort").value = state.sort;
    paintRange();
  }
  function paintRange() {
    var lo = +$("#yFromR").value, hi = +$("#yToR").value, span = MAXY - MINY || 1;
    var f = $("#dualFill"); f.style.left = ((lo - MINY) / span * 100) + "%"; f.style.right = ((MAXY - hi) / span * 100) + "%";
  }
  function setYears(lo, hi) {
    lo = Math.max(MINY, Math.min(MAXY, lo || MINY)); hi = Math.max(MINY, Math.min(MAXY, hi || MAXY));
    if (lo > hi) { var t = lo; lo = hi; hi = t; }
    state.from = lo; state.to = hi;
    syncControls(); update();
  }

  var debounceT;
  function bind() {
    $("#q").addEventListener("input", function () {
      clearTimeout(debounceT);
      debounceT = setTimeout(function () { state.q = $("#q").value; update(); }, 90);
    });
    $("#q").addEventListener("keydown", function (e) {
      if (e.key === "Escape") { $("#q").value = ""; state.q = ""; update(); }
      if (e.key === "Enter") { clearTimeout(debounceT); state.q = $("#q").value; update(); var first = $("#cards .card-title a"); if (first) first.focus(); }
    });
    document.addEventListener("keydown", function (e) {
      var tag = (e.target.tagName || "").toLowerCase();
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && tag !== "input" && tag !== "textarea" && tag !== "select") {
        e.preventDefault(); $("#q").focus(); $("#q").select();
      }
      if (e.key === "Escape" && $("#filters").classList.contains("open")) closeFilters();
    });
    $$(".examples .chip-btn").forEach(function (b) { b.addEventListener("click", function () { state.q = b.getAttribute("data-q"); syncControls(); update(); }); });
    $("#helpBtn").addEventListener("click", function () { var p = $("#helpPanel"); p.hidden = !p.hidden; this.setAttribute("aria-expanded", String(!p.hidden)); });
    $("#emptyHelp").addEventListener("click", function () { $("#helpPanel").hidden = false; $("#helpBtn").setAttribute("aria-expanded", "true"); $("#helpPanel").scrollIntoView({ behavior: "smooth" }); });

    $("#yFromR").addEventListener("input", function () {
      if (+this.value > +$("#yToR").value) this.value = $("#yToR").value;
      $("#yFrom").value = this.value; paintRange();
    });
    $("#yToR").addEventListener("input", function () {
      if (+this.value < +$("#yFromR").value) this.value = $("#yFromR").value;
      $("#yTo").value = this.value; paintRange();
    });
    ["#yFromR", "#yToR"].forEach(function (id) { $(id).addEventListener("change", function () { setYears(+$("#yFromR").value, +$("#yToR").value); }); });
    ["#yFrom", "#yTo"].forEach(function (id) { $(id).addEventListener("change", function () { setYears(+$("#yFrom").value, +$("#yTo").value); }); });
    $$("[data-years]").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-years");
        if (v === "all") setYears(MINY, MAXY); else { var p = v.split("-"); setYears(+p[0], +p[1]); }
      });
    });
    $("#fPeer").addEventListener("change", function () { state.peer = this.checked; update(); });
    $("#fFound").addEventListener("change", function () { state.found = this.checked; update(); });
    $("#fDoi").addEventListener("change", function () { state.doi = this.checked; update(); });
    $("#fFuzzy").addEventListener("change", function () { state.fuzzy = this.checked; update(); });
    $("#fMinC").addEventListener("input", function () { clearTimeout(debounceT); var v = this.value; debounceT = setTimeout(function () { state.minc = +v > 0 ? +v : null; update(); }, 200); });
    $("#sort").addEventListener("change", function () { state.sort = this.value; update(); });

    $("#filters").addEventListener("change", function (e) {
      var t = e.target; var f = t.getAttribute("data-facet"); if (!f) return;
      var set = f === "type" ? state.types : state.sections; var v = f === "section" ? +t.value : t.value;
      if (t.checked) set.add(v); else set.delete(v);
      update();
    });
    document.addEventListener("click", function (e) {
      var tg = e.target.closest("[data-tag]");
      if (tg) {
        var t = tg.getAttribute("data-tag");
        if (state.tags.has(t)) state.tags.delete(t); else state.tags.add(t);
        update(); if (tg.classList.contains("card-tag")) toast("Filtered by #" + t);
        return;
      }
      var rm = e.target.closest("[data-rm]");
      if (rm) {
        var k = rm.getAttribute("data-rm"), v = rm.getAttribute("data-val");
        if (k === "year") { state.from = MINY; state.to = MAXY; }
        else if (k === "peer" || k === "found" || k === "doi") state[k] = false;
        else if (k === "minc") state.minc = null;
        else if (k === "type") state.types.delete(v);
        else if (k === "section") state.sections.delete(+v);
        else if (k === "tag") state.tags.delete(v);
        syncControls(); update(); return;
      }
    });
    $("#cards").addEventListener("click", function (e) {
      var card = e.target.closest(".card"); if (!card) return;
      var r = REFS.find(function (x) { return x.id === card.getAttribute("data-id"); });
      var act = e.target.closest("[data-act]");
      if (act) {
        var a = act.getAttribute("data-act");
        if (a === "harvard") copyText(r.harvard, "Harvard reference copied");
        else if (a === "intext") copyText(r.inText, "Copied");
        else if (a === "narrative") copyText(r.narrative, "Copied");
        else copyText(Exporters.toBibTeX(r), "BibTeX copied");
      }
    });
    $("#cards").addEventListener("change", function (e) {
      if (!e.target.classList.contains("card-select")) return;
      var card = e.target.closest(".card"), id = card.getAttribute("data-id");
      if (e.target.checked) selected.add(id); else selected.delete(id);
      card.classList.toggle("selected", e.target.checked);
      updateBulk();
    });
    $("#selectAll").addEventListener("change", function () {
      var on = this.checked;
      current.forEach(function (r) { if (on) selected.add(r.id); else selected.delete(r.id); });
      $$("#cards .card").forEach(function (c) { c.classList.toggle("selected", on); $(".card-select", c).checked = on; });
      updateBulk();
    });
    $$("[data-export]").forEach(function (b) {
      b.addEventListener("click", function () {
        var rows = exportRows(); if (!rows.length) { toast("Nothing to export"); return; }
        var kind = b.getAttribute("data-export"), stamp = "DevOpsRef-" + rows.length;
        if (kind === "harvard") download(stamp + "-harvard.txt", Exporters.toHarvard(rows));
        else if (kind === "bib") download(stamp + ".bib", Exporters.toBibFile(rows), "application/x-bibtex;charset=utf-8");
        else if (kind === "ris") download(stamp + ".ris", Exporters.toRISFile(rows), "application/x-research-info-systems;charset=utf-8");
        else if (kind === "csv") download(stamp + ".csv", Exporters.toCSV(rows), "text/csv;charset=utf-8");
        else if (kind === "intext") download(stamp + "-in-text-citations.txt", Exporters.toInText(rows));
        else if (kind === "copyintext") { copyText(Exporters.toInText(rows), rows.length + " in-text citations copied"); return; }
        else if (kind === "copy") { copyText(Exporters.toHarvard(rows), rows.length + " Harvard citations copied"); return; }
        toast("Exported " + rows.length + " reference" + (rows.length === 1 ? "" : "s"));
      });
    });
    function clearAll() { state = defaults(); state.from = MINY; state.to = MAXY; selected.clear(); syncControls(); update(); }
    $("#clearAll").addEventListener("click", clearAll);
    $("#emptyClear").addEventListener("click", clearAll);

    $("#themeToggle").addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", cur);
      try { localStorage.setItem("devopsref-theme", cur); } catch (e) {}
      toast(cur === "dark" ? "Dark mode" : "Light mode");
    });
    var dlg = $("#aboutDialog");
    $("#aboutBtn").addEventListener("click", function () { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    $("#openFilters").addEventListener("click", function () { $("#filters").classList.add("open"); $("#scrim").hidden = false; $("#closeFilters").focus(); });
    $("#closeFilters").addEventListener("click", closeFilters);
    $("#scrim").addEventListener("click", closeFilters);
    window.addEventListener("popstate", function () { state = readURL(); normaliseYears(); syncControls(); update({ noURL: true }); });
  }
  function closeFilters() { $("#filters").classList.remove("open"); $("#scrim").hidden = true; }
  function normaliseYears() { if (state.from == null) state.from = MINY; if (state.to == null) state.to = MAXY; }

  /* ---------- init ---------- */
  function init(data) {
    DATA = data; REFS = data.references;
    ENGINE = new RefSearch.Engine(REFS);
    var years = REFS.map(function (r) { return r.year; }).filter(function (y) { return y != null; });
    MINY = Math.min.apply(null, years); MAXY = Math.max.apply(null, years);
    var secMap = {}; REFS.forEach(function (r) { secMap[r.section.number] = r.section.name; });
    SECTIONS = Object.keys(secMap).map(Number).sort(function (a, b) { return a - b; }).map(function (n) { return { number: n, name: secMap[n] }; });
    var tagSet = {}; REFS.forEach(function (r) { r.tags.forEach(function (t) { tagSet[t] = 1; }); }); TAGS = Object.keys(tagSet);

    $("#statTotal").textContent = REFS.length;
    $("#statPeer").textContent = REFS.filter(function (r) { return r.peerReviewed; }).length;
    $("#statYears").textContent = MINY + "–" + MAXY;
    $("#statSections").textContent = SECTIONS.length;
    $("#q").placeholder = $("#q").placeholder.replace(/\d+ references/, REFS.length + " references");
    var counts = {}; years.forEach(function (y) { counts[y] = (counts[y] || 0) + 1; });
    var maxc = Math.max.apply(null, Object.keys(counts).map(function (k) { return counts[k]; }));
    var spark = "";
    for (var y = MINY; y <= MAXY; y++) {
      var c = counts[y] || 0;
      spark += '<span class="' + (c ? "" : "zero") + '" style="height:' + Math.max(6, c / maxc * 100) + '%" title="' + y + ": " + c + '"></span>';
    }
    $("#yearSpark").innerHTML = spark;
    $("#yearSpark").parentNode.setAttribute("title", "Publication years " + MINY + "–" + MAXY);
    ["#yFrom", "#yTo", "#yFromR", "#yToR"].forEach(function (id) { $(id).min = MINY; $(id).max = MAXY; });

    state = readURL(); normaliseYears();
    syncControls(); bind(); update({ noURL: true });
    document.documentElement.classList.add("ready");
  }

  if (window.REFERENCE_DATA) init(window.REFERENCE_DATA);
  else fetch("data/references.json").then(function (r) { return r.json(); }).then(init);
})();
