# DevOpsRef — DevOps & Enterprise Automation Reference Library

[![Live site](https://img.shields.io/badge/live-ymmiah.github.io%2FDevOpsRef-4f46e5)](https://ymmiah.github.io/DevOpsRef/)
![References](https://img.shields.io/badge/references-214-0d9488)
![Peer reviewed](https://img.shields.io/badge/peer--reviewed-179-1d4ed8)
![Licence](https://img.shields.io/badge/code-MIT-informational)

A searchable library of **214 verified academic references** on **DevOps and Enterprise Automation**,
developed by **Yasin Mohammed Miah — Student of BCU, BSc Computing Top-Up (Hons)** ([@ymmiah](https://github.com/ymmiah)).

**Live site:** https://ymmiah.github.io/DevOpsRef/

It holds **214 references** in 14 topic sections, from the field's seminal works (2008 onwards) to
research published in 2026. Each one has a Harvard (Cite Them Right) citation, a DOI or URL, and a
note explaining why it is relevant to DevOps and enterprise automation.

| | |
|---|---|
| References | 214 (185 with a DOI) |
| Peer-reviewed (journal, conference, chapter) | 179 |
| Years covered | 2008–2026 (plus 2 undated web sources) |
| Sections | 14 |
| Formats | Web app · Word (.docx) · JSON · BibTeX · RIS · CSV |

## Features

- **Instant keyword search** across titles, authors, venues, relevance notes and topic tags, with matches highlighted.
- **Typo tolerance.** Fuzzy matching corrects misspellings, so `kubernetis` finds Kubernetes and `terrafrom` finds Terraform. The site tells you when it has corrected a word.
- **Advanced query language**: `AND` / `OR` / `NOT` (or `-term`), `"exact phrases"`, `( grouping )`
  and field queries (`author:`, `title:`, `year:`, `venue:`, `tag:`, `type:`, `doi:`, `section:`, `cites:`, `note:`).
- **Filters with live counts**: a year range (slider and inputs), section, publication type, topic tags,
  peer-reviewed only, foundational/seminal only, has DOI, and minimum citation count.
- **Sorting** by best match, year (newest or oldest), citations, author A–Z, title A–Z or section order.
- **Shareable searches.** The query and every filter are saved in the URL.
- **Citation tools.** Each reference has *Copy Harvard* and *Copy BibTeX* buttons. You can also select several references, or use every current result, and export them as **Harvard text, BibTeX (.bib), RIS (.ris) or CSV**.
- **Download** the original annotated bibliography as a Word document.
- Dark and light mode (follows your system setting by default), a responsive mobile layout with a slide-out filter drawer, accessible colour contrast and keyboard support.
- **No build step and no CDN.** The site is plain HTML, CSS and JavaScript with its own search engine. It works on GitHub Pages and when you open `index.html` straight from disk.

## Search syntax

| Query | Meaning |
|---|---|
| `devops pipeline` | both words (implicit AND) |
| `gitops OR argo` | either word |
| `security NOT kubernetes` · `security -kubernetes` | exclude a word |
| `"site reliability"` | exact phrase (hyphenated forms such as *infrastructure-as-code* also match) |
| `(rpa OR bpm) AND llm` | grouping |
| `kube` | prefix match (finds *Kubernetes*) |
| `author:Rahman` | author surname. Uses the full Crossref author list where the citation says *et al.* |
| `title:"technical debt"` | title only |
| `year:2024` · `year:2021..2023` · `year:>=2020` | year or range |
| `venue:"IEEE Software"` | journal, proceedings or publisher |
| `tag:DevSecOps` · `tag:MLOps OR tag:AIOps` | topic tags |
| `type:conference` | `journal`, `conference`, `chapter`, `book`, `report`, `standard`, `web`, `preprint` |
| `doi:10.1145` | DOI contains |
| `cites:>=500` · `section:13` · `note:benchmark` | citation count, section number, relevance note |

Keyboard: <kbd>/</kbd> focuses search, <kbd>Esc</kbd> clears it and <kbd>Enter</kbd> jumps to the first result.

Examples:
[`kubernetes`](https://ymmiah.github.io/DevOpsRef/?q=kubernetes) ·
[`author:Forsgren`](https://ymmiah.github.io/DevOpsRef/?q=author%3AForsgren) ·
[`year:2023..2025 devsecops`](https://ymmiah.github.io/DevOpsRef/?q=year%3A2023..2025+devsecops) ·
[`"infrastructure as code" -ansible`](https://ymmiah.github.io/DevOpsRef/?q=%22infrastructure+as+code%22+-ansible) ·
[`tag:MLOps OR tag:AIOps`](https://ymmiah.github.io/DevOpsRef/?q=tag%3AMLOps+OR+tag%3AAIOps)

## Sections

1. DevOps definitions, culture and adoption
2. CI/CD pipelines and continuous delivery/deployment
3. Infrastructure as Code (Terraform, Ansible, etc.) and configuration management
4. Containers, Docker, Kubernetes and orchestration
5. DevSecOps and security automation in pipelines
6. Monitoring, observability and site reliability engineering (SRE)
7. DevOps metrics (DORA metrics) and performance
8. Enterprise automation, RPA and business process automation
9. GitOps, platform engineering, MLOps/AIOps and AI in DevOps
10. Cloud-native architecture and microservices in DevOps
11. DevOps education and skills
12. Challenges and barriers in enterprise DevOps adoption
13. Seminal and highly cited works (any year)
14. Industry reports, surveys and practitioner/standards sources

## Repository layout

```
index.html                  the web app
assets/css/styles.css       design system (light/dark)
assets/js/search.js         search engine: boolean parser, field queries, fuzzy matching
assets/js/exporters.js      Harvard / BibTeX / RIS / CSV generators (browser + Node)
assets/js/app.js            UI: filters, facets, sorting, URL state, selection, export
data/references.json        structured dataset (214 records)
data/references.js          same data as a script, so the site also works from file://
references.bib / .ris / .csv  full library in reference-manager formats
docs/DevOps_Enterprise_Automation_References.docx   original annotated bibliography (Word)
scripts/parse_docx.py       rebuilds data/ from the Word document
scripts/build_exports.js    rebuilds references.bib / .ris / .csv from data/
```

### Data fields

`id, section{number,name}, authors, authorsEtAl, authorsFull, year, yearSuffix, title, venue, publisher,
volume, issue, pages, edition, type, doi, url, accessed, harvard, relevance, citations, tags,
foundational, foundationalLabel, seminal, peerReviewed`

- `authors` is taken exactly from the Harvard citation. `authorsFull` holds the complete author list from the
  reference's Crossref record where one exists (used for author search and BibTeX/RIS). Otherwise it is `null`.
- `citations` is the approximate OpenAlex count given in the relevance note (October 2026), or `null` if none was given.
- `foundational` is `true` for works labelled *[Foundational]* in the document and for everything in Section 13 (seminal works).
- `peerReviewed` is `true` for journal articles, conference papers and book chapters. It is `false` for books, reports,
  standards, web articles, the arXiv preprint and the *Linux Journal* magazine article.
- `tags` are topic keywords taken from the title, venue, relevance note and section. They are a navigation aid, not formal subject indexing.
- Fields that are not in the source are left `null`. No data was invented.

### Rebuilding the data

```bash
pip install python-docx
python3 scripts/parse_docx.py docs/DevOps_Enterprise_Automation_References.docx   # writes data/references.json + .js
node scripts/build_exports.js                                       # writes references.bib/.ris/.csv
```

## Running locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

(Opening `index.html` directly from disk also works.)

## Data note

Every reference was verified as of **26 October 2026**. Academic references were checked against their registered
**Crossref** metadata by DOI, citation counts come from **OpenAlex**, and books, reports, standards and web sources
were checked on the publisher's page. Every DOI resolved at doi.org and every URL loaded. Some publisher sites
(IEEE Xplore, ACM DL, Springer, Wiley, Taylor & Francis) block automated checks but open normally in a browser,
and give full text when you sign in through your university library.

Things to check before you submit work:
- Peng et al. (2023), on GitHub Copilot, is an arXiv **preprint**. Back it with a peer-reviewed source if your marker requires one.
- Two entries (FinOps Framework and the Open Policy Agent documentation) are undated web sources, cited as *(no date)*.
- Always check a citation against your institution's referencing guide (this list uses Harvard (Cite Them Right) style).

## Developer

**Yasin Mohammed Miah — Student of BCU, BSc Computing Top-Up (Hons)**

- GitHub: [github.com/ymmiah](https://github.com/ymmiah)
- Project: [github.com/ymmiah/DevOpsRef](https://github.com/ymmiah/DevOpsRef) · Live site: [ymmiah.github.io/DevOpsRef](https://ymmiah.github.io/DevOpsRef/)

## Licence

- **Code** (HTML, CSS, JavaScript, scripts): [MIT](LICENSE) © 2026 Yasin Mohammed Miah.
- **Citations** are bibliographic metadata describing published works. Copyright in the works themselves stays with their authors and publishers. The relevance annotations are by the compiler.
