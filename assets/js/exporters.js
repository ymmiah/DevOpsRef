/* Citation exporters (Harvard, BibTeX, RIS, CSV).
 * Shared by the browser UI and scripts/build_exports.js (Node), so the
 * downloadable files in the repo always match what the site generates. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Exporters = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function authorList(r) {
    // Prefer full Crossref author list when the Harvard citation abbreviates with "et al."
    if (r.authorsFull && r.authorsFull.length) return { list: r.authorsFull, truncated: false };
    return { list: r.authors || [], truncated: !!r.authorsEtAl };
  }
  function isPerson(a) { return /,\s*[A-Z]/.test(a); }

  function texEscape(s) {
    if (s == null) return "";
    return String(s)
      .replace(/\\/g, "\\textbackslash{}")
      .replace(/([&%$#_])/g, "\\$1")
      .replace(/–|—/g, "--")
      .replace(/[{}]/g, (c) => "\\" + c);
  }

  var BIB_TYPE = { journal: "article", conference: "inproceedings", chapter: "incollection",
    book: "book", report: "techreport", standard: "misc", web: "misc", preprint: "misc" };

  function toBibTeX(r) {
    var t = BIB_TYPE[r.type] || "misc";
    var a = authorList(r);
    var names = a.list.map(function (n) { return isPerson(n) ? texEscape(n) : "{" + texEscape(n) + "}"; });
    if (a.truncated) names.push("others");
    var f = [];
    function add(k, v) { if (v !== null && v !== undefined && v !== "") f.push("  " + k + " = {" + v + "}"); }
    add("author", names.join(" and "));
    add("title", "{" + texEscape(r.title) + "}");
    if (t === "article") add("journal", texEscape(r.venue));
    else if (t === "inproceedings" || t === "incollection") add("booktitle", texEscape(r.venue));
    else if (t === "techreport") add("institution", texEscape(r.publisher || r.venue));
    else if (r.type === "preprint") { add("eprinttype", "arXiv"); add("howpublished", texEscape(r.venue)); }
    else if (t === "misc") add("howpublished", texEscape(r.venue));
    if (t === "book" || t === "inproceedings" || t === "incollection") add("publisher", texEscape(r.publisher));
    if (r.edition) add("edition", texEscape(r.edition.replace(/ edn$/, "")));
    add("year", r.year != null ? String(r.year) : "n.d.");
    add("volume", texEscape(r.volume));
    add("number", texEscape(r.issue));
    add("pages", r.pages ? texEscape(r.pages) : "");
    add("doi", r.doi ? texEscape(r.doi) : "");
    add("url", r.url || "");
    if (r.accessed) add("urldate", texEscape(r.accessed));
    add("keywords", texEscape((r.tags || []).join(", ")));
    return "@" + t + "{" + r.id + ",\n" + f.join(",\n") + "\n}";
  }

  var RIS_TYPE = { journal: "JOUR", conference: "CPAPER", chapter: "CHAP", book: "BOOK",
    report: "RPRT", standard: "STAND", web: "ELEC", preprint: "UNPB" };

  function toRIS(r) {
    var L = [];
    function add(k, v) { if (v !== null && v !== undefined && v !== "") L.push(k + "  - " + v); }
    add("TY", RIS_TYPE[r.type] || "GEN");
    authorList(r).list.forEach(function (n) { add("AU", n); });
    add("PY", r.year != null ? String(r.year) : "");
    add("TI", r.title);
    if (r.type === "journal") add("JO", r.venue);
    else if (r.type === "conference" || r.type === "chapter") add("T2", r.venue);
    add("PB", r.publisher);
    add("ET", r.edition);
    add("VL", r.volume);
    add("IS", r.issue);
    if (r.pages) {
      var p = String(r.pages).split(/[–-]/);
      add("SP", p[0]); if (p[1]) add("EP", p[1]);
    }
    add("DO", r.doi);
    add("UR", r.url);
    (r.tags || []).forEach(function (k) { add("KW", k); });
    add("N1", r.relevance);
    add("ER", "");
    return L.join("\r\n").replace(/ER  - $/, "ER  - ");
  }

  function csvCell(v) {
    if (v === null || v === undefined) return "";
    var s = Array.isArray(v) ? v.join("; ") : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  var CSV_COLS = ["id", "section", "authors", "year", "title", "venue", "publisher", "volume", "issue",
    "pages", "type", "doi", "url", "citations", "peerReviewed", "foundational", "tags", "relevance", "harvard"];
  function toCSV(rows) {
    var out = [CSV_COLS.join(",")];
    rows.forEach(function (r) {
      out.push(CSV_COLS.map(function (c) {
        if (c === "section") return csvCell(r.section.number + ". " + r.section.name);
        if (c === "authors") return csvCell(authorList(r).list.concat(authorList(r).truncated ? ["et al."] : []));
        return csvCell(r[c]);
      }).join(","));
    });
    return "\uFEFF" + out.join("\r\n") + "\r\n";
  }
  function toHarvard(rows) { return rows.map(function (r) { return r.harvard; }).join("\n\n") + "\n"; }
  function toBibFile(rows) { return rows.map(toBibTeX).join("\n\n") + "\n"; }
  function toRISFile(rows) { return rows.map(toRIS).join("\r\n\r\n") + "\r\n"; }

  return { toBibTeX: toBibTeX, toRIS: toRIS, toCSV: toCSV, toHarvard: toHarvard,
    toBibFile: toBibFile, toRISFile: toRISFile, authorList: authorList };
});
