#!/usr/bin/env python3
"""Parse DevOps_Enterprise_Automation_References.docx into data/references.json (+ .bib/.csv/.ris).

Only data present in the Word document is used. Where the citation uses 'et al.'
and a cached Crossref record for the same DOI exists (refs/*meta.json, fetched
from api.crossref.org during verification), the full Crossref author list is
added as `authorsFull`; otherwise it is null. Missing fields are left null.
"""
import json, re, sys, csv, os, unicodedata
from pathlib import Path
import docx

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs" / "DevOps_Enterprise_Automation_References.docx"
META_DIR = Path(sys.argv[2]) if len(sys.argv) > 2 else None

CACHE = ROOT / "data" / "crossref_cache.json"
crossref = {}
if META_DIR and META_DIR.exists():
    for f in ("meta.json", "sem_meta.json", "new_meta.json"):
        p = META_DIR / f
        if p.exists():
            for k, v in json.load(open(p)).items():
                m = v.get("meta") if isinstance(v, dict) else None
                if m:
                    crossref[k.lower()] = {"type": m.get("type"),
                        "author": [{"family": a.get("family"), "given": a.get("given", "")} for a in (m.get("author") or []) if a.get("family")]}
    CACHE.parent.mkdir(exist_ok=True)
    json.dump(dict(sorted(crossref.items())), open(CACHE, "w"), ensure_ascii=False, indent=1)
elif CACHE.exists():
    crossref = json.load(open(CACHE))

d = docx.Document(str(SRC))
paras = [p for p in d.paragraphs]

SEC_RE = re.compile(r"^(\d+)\.\s+(.*)$")
entries, sec = [], None
pending = None
for p in paras:
    t = p.text.strip()
    if p.style.name.startswith("Heading"):
        m = SEC_RE.match(t)
        sec = (int(m.group(1)), m.group(2)) if m else None
        pending = None
        continue
    if not sec or not t:
        continue
    if t.startswith("Relevance:"):
        if pending is not None:
            pending["relevanceRaw"] = t[len("Relevance:"):].strip()
            pending = None
        continue
    if re.search(r"\((\d{4}[a-z]?|no date)\)", t) and ("Available at:" in t):
        pending = {"section": sec, "harvard": t}
        entries.append(pending)

def split_authors(s):
    s = s.strip()
    etal = s.endswith("et al.")
    core = s[:-len("et al.")].strip() if etal else s
    if "," not in core:
        return [core], etal
    core = re.sub(r"\s+and\s+", ", ", core)
    pairs = re.findall(r"\s*([^,]+?),\s*((?:[A-Z][A-Za-z]?\.?-?)+\.?)(?=,|$)", core)
    names = [f"{a.strip()}, {b.strip()}" for a, b in pairs]
    return (names or [core]), etal

CONF_RE = re.compile(r"Conference|Proceedings|Symposium|Workshop|Meeting|Congress|Companion|Neural Information|ICSE|Summit|USENIX", re.I)

def classify_unquoted(title, rest, url=""):
    if "[Preprint]" in rest: return "preprint"
    if re.search(r"edn\.|Press|Addison|O'Reilly|Publishing|Pearson|Manning|Apress|Routledge", rest) or re.search(r"^[^.]*: Springer$", rest): return "book"
    if re.search(r"/reports?/|survey", url or "", re.I): return "report"
    if re.search(r"Special Publication|Specification|Principles v|Framework\b", title + " " + rest) and "edn" not in rest: return "standard"
    if re.search(r"martinfowler\.com|documentation", title + " " + rest, re.I): return "web"
    if re.search(r"Report|Survey|White Paper|State of", title + " " + rest, re.I): return "report"
    if re.search(r"edn\.|Press|Addison|O'Reilly|Publishing|Springer|Wiley|Pearson|Manning|Apress|Routledge", rest): return "book"
    return "web"

CR_TYPE = {"journal-article": "journal", "proceedings-article": "conference", "book-chapter": "chapter",
           "book": "book", "monograph": "book", "edited-book": "book", "posted-content": "preprint",
           "report": "report", "standard": "standard"}

TAG_RULES = [
    ("DevOps", r"DevOps"),
    ("CI/CD", r"\bCI/CD\b|continuous (integration|delivery|deployment|software engineering)|\bpipelines?\b|GitHub Actions|\bCI\b|deployment pipeline"),
    ("IaC", r"infrastructure[- ]as[- ]code|\bIaC\b|Terraform|Ansible|Puppet|Chef\b|configuration management"),
    ("Terraform", r"Terraform"), ("Ansible", r"Ansible"),
    ("Containers", r"container|Docker|LXC"),
    ("Docker", r"Docker"),
    ("Kubernetes", r"Kubernetes|\bK8s\b|Borg\b|orchestrat"),
    ("DevSecOps", r"DevSecOps|security|secure|vulnerab|secrets?\b|SBOM|Sigstore|SLSA|SSDF"),
    ("Supply chain", r"supply[- ]chain|SBOM|Sigstore|SLSA|provenance"),
    ("Policy as code", r"policy[- ]as[- ]code|Open Policy Agent|\bOPA\b|Rego"),
    ("SRE", r"\bSRE\b|site reliability|reliability engineering|incident|chaos engineering|resilien"),
    ("Observability", r"observability|monitoring|tracing|logging|telemetry|Dapper"),
    ("DORA", r"\bDORA\b|Accelerate|four key|delivery performance|lead time|deployment frequency"),
    ("Metrics", r"metric|measure|performance|productivity"),
    ("RPA", r"\bRPA\b|robotic process automation"),
    ("BPM", r"business process|process management|\bBPM\b|workflow automation|intelligent automation|hyperautomation"),
    ("Enterprise automation", r"enterprise|robotic process|business process|intelligent automation|hyperautomation|process automation"),
    ("GitOps", r"GitOps"),
    ("Platform engineering", r"platform engineering|platform team|internal developer platform|Team Topologies|platforms white"),
    ("MLOps", r"MLOps|machine learning|\bML\b|ML system|ML production"),
    ("AIOps", r"AIOps|anomaly detection|root[- ]cause|incident"),
    ("AI", r"\bAI\b|artificial intelligence|AI[- ]assisted|AI-driven|machine learning"),
    ("LLM", r"\bLLMs?\b|large language model|Copilot|ChatGPT|\bGPT|generative AI"),
    ("Serverless", r"serverless|FaaS|function[- ]as[- ]a[- ]service|Lambda"),
    ("FinOps", r"FinOps|cloud cost|cost management"),
    ("Microservices", r"microservice"),
    ("Cloud-native", r"cloud[- ]native|\bcloud\b|CNCF|PaaS"),
    ("Agile", r"\bagile\b"),
    ("Culture", r"culture|cultural|mindset|collaboration|team"),
    ("Education", r"education|teaching|curricul|skills|students?|course"),
    ("Testing", r"\btest(s|ing)?\b|flaky"),
    ("ITSM", r"ITIL|service management|ITSM"),
    ("Developer experience", r"developer experience|DevEx|SPACE framework|developer productivity"),
    ("Value stream", r"value stream"),
    ("Literature review", r"systematic (literature )?review|mapping study|multivocal|tertiary|literature review|survey of"),
]

# Each section's core topic is always applied as a tag
SECTION_TAGS = {1: ["DevOps", "Culture"], 2: ["CI/CD"], 3: ["IaC"], 4: ["Containers"], 5: ["DevSecOps"],
                6: ["Observability"], 7: ["Metrics"], 8: ["Enterprise automation"], 10: ["Cloud-native"],
                11: ["Education"], 12: ["DevOps"]}

def initials(given):
    parts = re.split(r"[\s]+", given.strip())
    out = []
    for p in parts:
        if not p: continue
        if "-" in p:
            out.append("-".join(x[0] + "." for x in p.split("-") if x))
        else:
            out.append(p[0] + ".")
    return "".join(out)

records = []
for e in entries:
    h = e["harvard"]
    secno, secname = e["section"]
    m = re.match(r"^(.*?)\s\((\d{4})([a-z]?)\)\s(.*)$", h) or re.match(r"^(.*?)\s\((no date)\)()\s(.*)$", h)
    if not m:
        raise SystemExit("cannot parse: " + h)
    auth_s, year_s, suffix, rest = m.groups()
    year = int(year_s) if year_s.isdigit() else None
    authors, etal = split_authors(auth_s)
    url_m = re.search(r"Available at:\s*(\S+?)\.?(?:\s+\(Accessed:\s*([^)]+)\))?\.?$", h)
    url = url_m.group(1).rstrip(".") if url_m else None
    accessed = url_m.group(2) if url_m and url_m.group(2) else None
    doi = None
    if url:
        dm = re.match(r"https?://(?:dx\.)?doi\.org/(.+)$", url)
        if dm: doi = dm.group(1)
    body = re.sub(r"\s*Available at:.*$", "", rest).strip()
    title = venue = publisher = volume = issue = pages = edition = None
    if body.startswith("'"):
        tm = re.match(r"^'(.+?)',\s*(.*)$", body)
        title, after = tm.group(1), tm.group(2)
        if after.startswith("in "):
            vm = re.match(r"^in\s+(.+?)\.\s+(?:([^:.]+):\s*)?([^,]+?)(?:,\s*pp\.\s*([^.]+))?\.?$", after)
            if vm:
                venue = vm.group(1).strip()
                publisher = vm.group(3).strip()
                pages = vm.group(4)
            else:
                venue = after[3:].rstrip(".")
            ctype = "conference" if CONF_RE.search(venue or "") else "chapter"
        else:
            jm = re.match(r"^(.+?),\s*(\d[\w]*)(?:\(([^)]+)\))?,\s*(?:pp\.\s*)?(.+?)\.?$", after)
            if jm:
                venue, volume, issue, pages = jm.group(1), jm.group(2), jm.group(3), jm.group(4)
                if pages and pages.startswith("article "): pages = pages
            else:
                venue = after.rstrip(".")
            ctype = "journal"
    else:
        # unquoted: Title. [Nth edn.] Rest
        tm = re.match(r"^(.+?)\.\s+(.*)$", body)
        title, after = (tm.group(1), tm.group(2)) if tm else (body.rstrip("."), "")
        em = re.match(r"^(\d+(?:st|nd|rd|th) edn)\.\s*(.*)$", after)
        if em: edition, after = em.group(1), em.group(2)
        pm = re.search(r"(?:^|\.\s)[A-Z][\w .'-]+(?:,\s*[A-Z]{2,})?:\s*([^:]+?)\.?$", after)
        if pm:
            publisher = pm.group(1).strip()
        elif ":" not in after and after:
            publisher = after.split(",")[0].rstrip(".").strip()
        else:
            publisher = None
        venue = after.rstrip(".") or None
        if "[Preprint]" in after:
            publisher = None
        ctype = classify_unquoted(title, after, url)
    cr = crossref.get(doi.lower()) if doi else None
    if cr and ctype not in ("preprint",):
        crt = CR_TYPE.get(cr.get("type"))
        if crt in ("journal", "conference", "chapter", "book") and not (ctype == "report" and crt == "book"):
            ctype = crt
    rel = e.get("relevanceRaw")
    cites = None
    cm = re.search(r"c\.\s*([\d,]+)\s+citations", rel or "")
    if cm: cites = int(cm.group(1).replace(",", ""))
    foundational_label = bool(re.search(r"\[Foundational", rel or ""))
    is_preprint = ctype == "preprint" or "[Preprint" in (rel or "") or "[Preprint]" in h
    if is_preprint: ctype = "preprint"
    peer = ctype in ("journal", "conference", "chapter") and venue != "Linux Journal"
    authorsFull = None
    if cr and cr.get("author"):
        authorsFull = [f"{a.get('family','').strip()}, {initials(a.get('given',''))}".strip(", ")
                       for a in cr["author"] if a.get("family")] or None
    text_for_tags = " ".join(filter(None, [title, venue, rel]))
    found = {name for name, pat in TAG_RULES if re.search(pat, text_for_tags, re.I)}
    found |= set(SECTION_TAGS.get(secno, []))
    tags = [name for name, _ in TAG_RULES if name in found]
    rec = {
        "id": None,
        "section": {"number": secno, "name": secname},
        "authors": authors,
        "authorsEtAl": etal,
        "authorsFull": authorsFull,
        "year": year,
        "yearSuffix": suffix or None,
        "title": title,
        "venue": venue,
        "publisher": publisher,
        "volume": volume, "issue": issue, "pages": pages, "edition": edition,
        "type": ctype,
        "doi": doi,
        "url": url,
        "accessed": accessed,
        "harvard": h,
        "relevance": rel,
        "citations": cites,
        "tags": tags,
        "foundational": foundational_label or secno == 13,
        "foundationalLabel": foundational_label,
        "seminal": secno == 13,
        "peerReviewed": peer,
    }
    records.append(rec)

# ids
seen = {}
for r in records:
    first = unicodedata.normalize("NFKD", r["authors"][0].split(",")[0]).encode("ascii", "ignore").decode().lower()
    first = re.sub(r"[^a-z0-9]+", "", first)[:20] or "anon"
    base = f"{first}{r['year'] or 'nd'}{r['yearSuffix'] or ''}"
    seen[base] = seen.get(base, 0) + 1
    r["id"] = base if seen[base] == 1 else f"{base}-{seen[base]}"
# second pass: make all colliding ids distinct from the first
counts = {}
for r in records:
    b = re.sub(r"-\d+$", "", r["id"]); counts[b] = counts.get(b, 0) + 1
for b, n in counts.items():
    if n > 1:
        letters = iter("abcdefghijklmnopqrstuvwxyz")
        for r in records:
            if re.sub(r"-\d+$", "", r["id"]) == b: r["id"] = b + next(letters)

out = {
    "meta": {
        "title": "DevOpsRef — DevOps & Enterprise Automation Reference Library",
        "topic": "DevOps and Enterprise Automation",
        "developer": "Yasin Mohammed Miah — Student of BCU, BSc Computing Top-Up (Hons)",
        "developerGitHub": "https://github.com/ymmiah",
        "repository": "https://github.com/ymmiah/DevOpsRef",
        "source": "DevOps_Enterprise_Automation_References.docx",
        "verified": "2026-10-26",
        "count": len(records),
    },
    "references": records,
}
(ROOT / "data").mkdir(exist_ok=True)
json.dump(out, open(ROOT / "data" / "references.json", "w"), ensure_ascii=False, indent=1)
# JS copy so the site also works from file://
with open(ROOT / "data" / "references.js", "w") as f:
    f.write("window.REFERENCE_DATA = ")
    json.dump(out, f, ensure_ascii=False)
    f.write(";\n")
print(len(records), "records")
