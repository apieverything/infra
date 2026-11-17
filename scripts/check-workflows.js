#!/usr/bin/env node
/**
 * Lint every `run:` shell block of the GitHub Actions workflows.
 *
 * A `run: |` block is a bash script written inside YAML; a typo there is not
 * caught by `bash -n ci.yml` and only fails later, on GitHub, with an opaque
 * "Process completed with exit code 2". This extracts each block and syntax
 * checks it locally. No dependencies, no network.
 *
 *   node scripts/check-workflows.js
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const WORKFLOWS = [
  { rel: ".github/workflows/ci.yml", repo: "." },
  { rel: ".profile/.github/workflows/ci.yml", repo: ".profile" },
  { rel: "connectors/.github/workflows/ci.yml", repo: "connectors" },
  { rel: "core/.github/workflows/ci.yml", repo: "core" },
  { rel: "web/.github/workflows/ci.yml", repo: "web" },
];

const errors = [];
let checked = 0;

// GitHub substitutes ${{ ... }} before running the script. Replace those
// expressions with a harmless token so `bash -n` sees valid syntax.
const sanitize = (s) => s.replace(/\$\{\{[^}]*\}\}/g, "GH_EXPR");

const lint = (rel, lineNo, script) => {
  checked++;
  const r = cp.spawnSync("bash", ["-n"], { input: sanitize(script), encoding: "utf8" });
  if (r.status !== 0) {
    errors.push(`${rel}:${lineNo}: bash syntax error\n${String(r.stderr).trim()}`);
  }
};

for (const wf of WORKFLOWS) {
  const rel = wf.rel;
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    // A component repo that simply isn't cloned locally is fine; a workflow
    // missing from a repo that IS present is a regression.
    if (!fs.existsSync(path.join(ROOT, wf.repo))) {
      console.log(`  - ${rel} (repo not cloned, skipped)`);
      continue;
    }
    errors.push(`${rel}: workflow file missing`);
    continue;
  }
  const lines = fs.readFileSync(full, "utf8").split("\n");

  for (let i = 0; i < lines.length; i++) {
    // Inline form: `run: npm test`
    const inline = lines[i].match(/^(\s*)(?:-\s+)?run:\s*(\S.*)$/);
    if (inline && inline[2] !== "|" && !inline[2].startsWith("|-") && !inline[2].startsWith("|+")) {
      lint(rel, i + 1, inline[2]);
      continue;
    }

    // Literal block form: `run: |`
    const block = lines[i].match(/^(\s*)(?:-\s+)?run:\s*\|\-?\+?\s*$/);
    if (!block) continue;
    const indent = block[1].length;
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === "") { body.push(""); continue; }
      if (line.match(/^\s*/)[0].length <= indent) break;
      body.push(line);
    }
    const nonEmpty = body.filter((l) => l.trim() !== "");
    const cut = nonEmpty.length ? Math.min(...nonEmpty.map((l) => l.match(/^\s*/)[0].length)) : 0;
    lint(rel, i + 1, body.map((l) => l.slice(cut)).join("\n"));
    i = j - 1;
  }

  console.log(`  OK ${rel}`);
}

if (errors.length) {
  console.error("\n  FAILED:\n" + errors.map((e) => "    " + e.replace(/\n/g, "\n    ")).join("\n"));
  process.exit(1);
}
console.log(`\n  ${checked} shell blocks checked. All workflows valid.`);
