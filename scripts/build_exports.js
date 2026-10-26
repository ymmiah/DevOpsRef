#!/usr/bin/env node
// Regenerate references.bib / references.csv / references.ris from data/references.json
const fs = require("fs"), path = require("path");
const root = path.resolve(__dirname, "..");
const E = require(path.join(root, "assets/js/exporters.js"));
const data = JSON.parse(fs.readFileSync(path.join(root, "data/references.json"), "utf8"));
const refs = data.references.slice().sort((a, b) => a.harvard.localeCompare(b.harvard, "en"));
fs.writeFileSync(path.join(root, "references.bib"),
  "% DevOpsRef — DevOps & Enterprise Automation Reference Library (" + refs.length + " entries)\n% Developed by Yasin Mohammed Miah — Student of BCU, BSc Computing Top-Up (Hons) — https://github.com/ymmiah/DevOpsRef\n% Generated from data/references.json\n\n" + E.toBibFile(refs));
fs.writeFileSync(path.join(root, "references.csv"), E.toCSV(refs));
fs.writeFileSync(path.join(root, "references.ris"), E.toRISFile(refs));
console.log("wrote", refs.length, "entries");
