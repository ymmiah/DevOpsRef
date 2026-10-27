#!/usr/bin/env python3
"""Add Harvard (Cite Them Right) in-text citations to data/references.json (+ data/references.js).

For each record, the author part of the existing `harvard` reference is parsed (so the in-text
citation always matches the reference list), and two fields are written:
  inText     parenthetical form, e.g. (Forsgren, Humble and Kim, 2018)
  narrative  narrative form,     e.g. Forsgren, Humble and Kim (2018)
Rules: 1-3 authors are all named ("and" before the last); 4+ authors (reference shows "et al.")
-> first surname + "et al."; organisations use the name as given in the reference; undated
-> "no date". Surname particles and diacritics are kept exactly as in the reference
(e.g. "da Silva", "van der Aalst", "Cândido"). If two sources would share the same in-text
citation, letters a, b, ... are added to the year (ordered by title) in both `harvard` and
`yearSuffix`. Run after scripts/parse_docx.py and before scripts/build_exports.js.
"""
import json, re, collections, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
P = ROOT / "data" / "references.json"

# Author-list corrections checked against the Crossref record for the DOI (data/crossref_cache.json)
AUTHOR_FIX = {
    # Crossref: family "Ramadoni" (single name, no given name), "Utami, Ema", "Fatta, Hanif Al"
    "utami2021": ["Ramadoni", "Utami, E.", "Fatta, H.A."],
    # Crossref: Sánchez‐Cifo, Bermejo, Navarro (first author was missing from `authors`)
    "bermejo2023": ["Sánchez‐Cifo, M.Á.", "Bermejo, P.", "Navarro, E."],
}
# Surnames that cannot be split automatically (mononym first author in the reference)
SURNAME_OVERRIDE = {"utami2021": ["Ramadoni", "Utami", "Fatta"]}

HEAD = re.compile(r"^(.*?) \((\d{4})([a-z]?)\)|^(.*?) \((no date)([a-z]?)\)")


def fold(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)).lower()


def parse(h):
    m = HEAD.match(h)
    if not m:
        raise ValueError("cannot parse author/date: " + h[:80])
    a = m.group(1) if m.group(1) is not None else m.group(4)
    a = re.sub(r" \((eds|ed\.)\)$", "", a)
    etal = a.endswith(" et al.")
    if etal:
        a = a[: -len(" et al.")]
    parts = re.split(r"(?<=\.), | and ", a) if re.search(r", [A-Z]", a) else [a]
    sur = [p.split(", ")[0] if re.search(r", [A-Z]", p) else p for p in parts]
    return sur, etal


def names(sur, etal):
    if etal or len(sur) >= 4:
        return sur[0] + " et al."
    if len(sur) == 1:
        return sur[0]
    return ", ".join(sur[:-1]) + " and " + sur[-1]


def main():
    d = json.load(open(P, encoding="utf-8"))
    R = d["references"]
    for r in R:
        if r["id"] in AUTHOR_FIX:
            r["authors"] = AUTHOR_FIX[r["id"]]
        sur, etal = parse(r["harvard"])
        r["_n"] = names(SURNAME_OVERRIDE.get(r["id"], sur), etal)
        r["_y"] = str(r["year"]) if r["year"] is not None else "no date"
    # disambiguate identical author string + year
    grp = collections.defaultdict(list)
    for r in R:
        grp[(r["_n"], r["_y"])].append(r)
    for (n, y), rs in grp.items():
        if len(rs) < 2:
            continue
        rs.sort(key=lambda r: fold(r["title"]))
        for i, r in enumerate(rs):
            L = "abcdefghij"[i]
            if r.get("yearSuffix") != L:
                r["harvard"] = re.sub(r"\((%s)[a-z]?\)" % re.escape(y), "(%s%s)" % (y, L), r["harvard"], count=1)
                r["yearSuffix"] = L
    for r in R:
        y = r.pop("_y") + (r.get("yearSuffix") or "")
        n = r.pop("_n")
        r["inText"] = "(%s, %s)" % (n, y)
        r["narrative"] = "%s (%s)" % (n, y)
    dup = [k for k, v in collections.Counter(r["inText"] for r in R).items() if v > 1]
    assert not dup, dup
    json.dump(d, open(P, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    (ROOT / "data" / "references.js").write_text("window.REFERENCE_DATA = " + json.dumps(d, ensure_ascii=False) + ";\n", encoding="utf-8")
    print("in-text citations:", len(R))


if __name__ == "__main__":
    main()
