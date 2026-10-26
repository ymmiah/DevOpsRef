/* DevOpsRef search engine — no dependencies.
 * Supports: AND / OR / NOT, -term, "exact phrase", ( grouping ),
 * field queries (author:, title:, year:, venue:, tag:, type:, doi:, section:, id:, cites:),
 * year ranges (year:2021..2024, year:>=2020), prefix matching and typo-tolerant fuzzy matching. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RefSearch = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function norm(s) {
    return String(s == null ? "" : s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[‐‑‒–—-]/g, " ").replace(/[’‘`]/g, "'");
  }
  function tokens(s) { return norm(s).match(/[a-z0-9][a-z0-9+#./']*[a-z0-9+#]|[a-z0-9]/g) || []; }

  var FIELD_ALIASES = {
    author: "author", authors: "author", au: "author", by: "author",
    title: "title", ti: "title",
    year: "year", yr: "year", py: "year",
    venue: "venue", journal: "venue", publisher: "venue", in: "venue", so: "venue",
    tag: "tag", tags: "tag", kw: "tag", keyword: "tag",
    type: "type", doi: "doi", section: "section", sec: "section", id: "id",
    cites: "cites", citations: "cites", note: "relevance", relevance: "relevance", abstract: "relevance"
  };
  var WEIGHTS = { title: 6, tags: 4, author: 4, venue: 2, relevance: 1.5, section: 1, other: 0.5 };

  /* ---------- Index ---------- */
  function buildIndex(refs) {
    var vocab = new Set();
    var docs = refs.map(function (r) {
      var authors = (r.authorsFull && r.authorsFull.length ? r.authorsFull : r.authors).concat(r.authors || []);
      var f = {
        title: norm(r.title), author: norm(authors.join(" ; ")), venue: norm([r.venue, r.publisher].join(" ")),
        relevance: norm(r.relevance), tags: norm((r.tags || []).join(" ; ")),
        section: norm(r.section.number + " " + r.section.name), other: norm([r.type, r.doi, r.id, r.year].join(" "))
      };
      var toks = {};
      Object.keys(f).forEach(function (k) {
        toks[k] = tokens(f[k]);
        toks[k].forEach(function (t) { vocab.add(t); });
      });
      return { ref: r, f: f, toks: toks, tagSet: (r.tags || []).map(norm) };
    });
    return { docs: docs, vocab: Array.from(vocab) };
  }

  /* ---------- Lexer / parser ---------- */
  function lex(q) {
    var out = [], i = 0, s = q;
    while (i < s.length) {
      var c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === "(" || c === ")") { out.push({ t: c }); i++; continue; }
      var neg = false;
      if ((c === "-" || c === "!") && i + 1 < s.length && /[^\s)]/.test(s[i + 1])) { neg = true; i++; c = s[i]; }
      var field = null;
      var fm = /^([A-Za-z]+):/.exec(s.slice(i));
      if (fm && FIELD_ALIASES[fm[1].toLowerCase()]) { field = FIELD_ALIASES[fm[1].toLowerCase()]; i += fm[0].length; c = s[i]; }
      var val, phrase = false;
      if (c === '"' || c === "“" || c === "”") {
        var j = i + 1; while (j < s.length && !/["“”]/.test(s[j])) j++;
        val = s.slice(i + 1, j); i = j + 1; phrase = true;
      } else {
        var k = i; while (k < s.length && !/[\s()]/.test(s[k])) k++;
        val = s.slice(i, k); i = k;
      }
      if (!field && !phrase && !neg && /^(AND|OR|NOT)$/.test(val)) { out.push({ t: val }); continue; }
      if (!field && !phrase && (val === "&&")) { out.push({ t: "AND" }); continue; }
      if (!field && !phrase && (val === "||" || val === "|")) { out.push({ t: "OR" }); continue; }
      if (val === "" && !phrase) continue;
      var term = { t: "TERM", field: field, value: val, phrase: phrase };
      out.push(neg ? { t: "NEG", term: term } : term);
    }
    return out;
  }

  function parse(q) {
    var toks = lex(q), p = 0;
    function peek() { return toks[p]; }
    function parseOr() {
      var left = parseAnd();
      while (peek() && peek().t === "OR") { p++; var right = parseAnd(); left = { op: "OR", a: left, b: right }; }
      return left;
    }
    function parseAnd() {
      var left = parseNot();
      while (peek() && peek().t !== "OR" && peek().t !== ")") {
        if (peek().t === "AND") { p++; if (!peek() || peek().t === ")" || peek().t === "OR") break; }
        var right = parseNot();
        if (!right) break;
        left = left ? { op: "AND", a: left, b: right } : right;
      }
      return left;
    }
    function parseNot() {
      var tk = peek(); if (!tk) return null;
      if (tk.t === "NOT") { p++; var x = parseNot(); return x ? { op: "NOT", a: x } : null; }
      if (tk.t === "NEG") { p++; return { op: "NOT", a: { op: "TERM", term: tk.term } }; }
      if (tk.t === "(") { p++; var e = parseOr(); if (peek() && peek().t === ")") p++; return e; }
      if (tk.t === ")") { p++; return null; }
      if (tk.t === "TERM") { p++; return { op: "TERM", term: tk }; }
      p++; return null;
    }
    var ast = null;
    while (p < toks.length) {
      var e = parseOr();
      if (e) ast = ast ? { op: "AND", a: ast, b: e } : e;
      else if (p < toks.length) p++;
    }
    return ast;
  }

  /* ---------- Matching ---------- */
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = new Array(b.length + 1), cur = new Array(b.length + 1);
    for (var j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++) {
      cur[0] = i; var best = cur[0];
      for (var k = 1; k <= b.length; k++) {
        cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
        if (cur[k] < best) best = cur[k];
      }
      if (best > max) return max + 1;
      var tmp = prev; prev = cur; cur = tmp;
    }
    return prev[b.length];
  }
  function fuzzyBudget(len) { return len >= 8 ? 2 : len >= 4 ? 1 : 0; }

  function rangeTest(spec) {
    spec = spec.trim();
    var m;
    if ((m = /^(\d+)?\s*(?:\.\.|–|-|to)\s*(\d+)?$/.exec(spec)) && (m[1] || m[2])) {
      var lo = m[1] ? +m[1] : -Infinity, hi = m[2] ? +m[2] : Infinity;
      return function (v) { return v != null && v >= lo && v <= hi; };
    }
    if ((m = /^(>=|<=|>|<|=)?\s*(\d+)$/.exec(spec))) {
      var n = +m[2], op = m[1] || "=";
      return function (v) {
        if (v == null) return false;
        return op === ">=" ? v >= n : op === "<=" ? v <= n : op === ">" ? v > n : op === "<" ? v < n : v === n;
      };
    }
    return function () { return false; };
  }

  function Engine(refs, opts) {
    this.index = buildIndex(refs);
    this.opts = opts || {};
    this._fuzzyCache = {};
  }

  // Expand a single word into the set of vocabulary words it should match
  Engine.prototype.expand = function (word, allowFuzzy) {
    var key = word + "|" + allowFuzzy;
    if (this._fuzzyCache[key]) return this._fuzzyCache[key];
    var exact = [], prefix = [], fuzzy = [];
    var V = this.index.vocab;
    for (var i = 0; i < V.length; i++) {
      var v = V[i];
      if (v === word) exact.push(v);
      else if (word.length >= 2 && v.indexOf(word) === 0) prefix.push(v);
    }
    if (allowFuzzy && !exact.length && !prefix.length) {
      var budget = fuzzyBudget(word.length);
      if (budget) for (var j = 0; j < V.length; j++) {
        var w = V[j];
        if (lev(word, w, budget) <= budget) fuzzy.push(w);
        else if (w.length > word.length && lev(word, w.slice(0, word.length), budget) <= Math.min(1, budget)) fuzzy.push(w);
      }
    }
    var res = { exact: exact, prefix: prefix, fuzzy: fuzzy };
    this._fuzzyCache[key] = res;
    return res;
  };

  var TEXT_FIELDS = { author: ["author"], title: ["title"], venue: ["venue"], relevance: ["relevance"] };
  var ALL_FIELDS = ["title", "author", "venue", "relevance", "tags", "other"];

  // returns {match:bool, score:number, hl:[strings]}
  Engine.prototype.matchTerm = function (doc, term, ctx) {
    var r = doc.ref, field = term.field, val = term.value, nv = norm(val).trim();
    var hl = [];
    if (!nv && field !== "year") return { match: true, score: 0, hl: hl };
    switch (field) {
      case "year": return { match: rangeTest(val)(r.year), score: 1, hl: hl };
      case "cites": return { match: rangeTest(/^\d+$/.test(val.trim()) ? ">=" + val : val)(r.citations), score: 1, hl: hl };
      case "type": return { match: norm(r.type).indexOf(nv) === 0 || (nv === "peer" && r.peerReviewed) ||
        (nv === "article" && r.type === "journal") || (nv === "paper" && (r.type === "journal" || r.type === "conference")), score: 1, hl: hl };
      case "doi": return { match: !!r.doi && norm(r.doi).indexOf(nv) !== -1, score: 1, hl: [val] };
      case "id": return { match: norm(r.id).indexOf(nv) === 0, score: 1, hl: hl };
      case "section": {
        if (/^\d+$/.test(nv)) return { match: r.section.number === +nv, score: 1, hl: hl };
        return { match: doc.f.section.indexOf(nv) !== -1, score: 1, hl: hl };
      }
      case "tag": {
        var hit = null;
        doc.tagSet.forEach(function (t, i) { if (!hit && (t === nv || t.indexOf(nv) === 0 || t.replace(/[^a-z0-9]/g, "") === nv.replace(/[^a-z0-9]/g, ""))) hit = doc.ref.tags[i]; });
        return { match: !!hit, score: hit ? 3 : 0, hl: hit ? [hit] : [] };
      }
    }
    var fields = field ? TEXT_FIELDS[field] : ALL_FIELDS;
    if (term.phrase || /\s/.test(nv)) {
      var score = 0;
      fields.forEach(function (fk) { if (doc.f[fk].indexOf(nv) !== -1) score += (WEIGHTS[fk] || 1) * 2; });
      return { match: score > 0, score: score, hl: score ? [val] : [] };
    }
    // word / multi-token term (e.g. "ci/cd", "o'reilly")
    var words = tokens(nv);
    if (!words.length) return { match: true, score: 0, hl: hl };
    var total = 0;
    for (var w = 0; w < words.length; w++) {
      var ex = this.expand(words[w], ctx.fuzzy && !ctx.negated);
      var sets = [[ex.exact, 1], [ex.prefix, 0.7], [ex.fuzzy, 0.5]];
      var s = 0;
      for (var fi = 0; fi < fields.length; fi++) {
        var fk = fields[fi], dtoks = doc.toks[fk];
        for (var si = 0; si < sets.length; si++) {
          var list = sets[si][0];
          if (!list.length) continue;
          for (var ti = 0; ti < dtoks.length; ti++) {
            if (list.indexOf(dtoks[ti]) !== -1) {
              s += (WEIGHTS[fk] || 1) * sets[si][1];
              if (hl.indexOf(dtoks[ti]) === -1) hl.push(dtoks[ti]);
              if (si === 2 && ctx.fuzzyUsed) ctx.fuzzyUsed[words[w]] = dtoks[ti];
            }
          }
        }
      }
      if (!s) return { match: false, score: 0, hl: [] };
      total += s;
    }
    return { match: true, score: total, hl: hl };
  };

  Engine.prototype.evalNode = function (doc, node, ctx) {
    if (!node) return { match: true, score: 0, hl: [] };
    if (node.op === "TERM") return this.matchTerm(doc, node.term, ctx);
    if (node.op === "NOT") {
      var c2 = Object.assign({}, ctx, { negated: true });
      var x = this.evalNode(doc, node.a, c2);
      return { match: !x.match, score: 0, hl: [] };
    }
    var a = this.evalNode(doc, node.a, ctx);
    if (node.op === "AND") {
      if (!a.match) return a;
      var b = this.evalNode(doc, node.b, ctx);
      return b.match ? { match: true, score: a.score + b.score, hl: a.hl.concat(b.hl) } : b;
    }
    var b2 = this.evalNode(doc, node.b, ctx);
    if (a.match || b2.match) return { match: true, score: (a.match ? a.score : 0) + (b2.match ? b2.score : 0), hl: (a.match ? a.hl : []).concat(b2.match ? b2.hl : []) };
    return { match: false, score: 0, hl: [] };
  };

  Engine.prototype.search = function (query, opts) {
    opts = opts || {};
    var ast = parse(query || "");
    var ctx = { fuzzy: opts.fuzzy !== false, fuzzyUsed: {} };
    var out = [];
    var docs = this.index.docs;
    for (var i = 0; i < docs.length; i++) {
      var res = this.evalNode(docs[i], ast, ctx);
      if (res.match) out.push({ ref: docs[i].ref, score: res.score, hl: res.hl });
    }
    return { results: out, ast: ast, fuzzyUsed: ctx.fuzzyUsed, empty: !ast };
  };

  return { Engine: Engine, parse: parse, lex: lex, norm: norm, tokens: tokens };
});
