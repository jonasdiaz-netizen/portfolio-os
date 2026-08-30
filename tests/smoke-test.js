const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

const failures = [];
function check(name, condition, detail = "") {
  if (!condition) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}

function unique(values) {
  return [...new Set(values)];
}

function includesAll(haystack, values) {
  return values.every(value => haystack.includes(value));
}

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
check("index.html has inline scripts", scripts.length >= 1);
scripts.forEach((script, index) => {
  try {
    new Function(script);
  } catch (error) {
    failures.push(`script ${index + 1} parses: ${error.message}`);
  }
});

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = unique(ids.filter((id, index) => ids.indexOf(id) !== index));
check("no duplicate ids", duplicateIds.length === 0, duplicateIds.join(", "));

const staticIdRefs = [...html.matchAll(/getElementById\("([^"]+)"\)/g)].map(match => match[1]);
const missingStaticRefs = unique(staticIdRefs.filter(id => !ids.includes(id)));
check("static getElementById refs exist", missingStaticRefs.length === 0, missingStaticRefs.join(", "));

[
  "SHEET_POSITION_FIELDS",
  "SHEET_PORTFOLIO_KPI_FIELDS",
  "mapSheetPosition",
  "mapSyncPayload",
  "normalizeGrowthKpis",
  "extractPortfolioGrowthKpis"
].forEach(symbol => check(`${symbol} exists`, html.includes(symbol)));

check(
  "position growth aliases are mapped",
  includesAll(html, [
    "Expected Fundamental Growth 3–5Y",
    "Expected Dividend Growth 3–5Y",
    "FCF/share Growth 3–5Y",
    "Growth Metric"
  ])
);

check(
  "portfolio growth KPI aliases are mapped",
  includesAll(html, [
    "fundamental_growth_coverage",
    "dividend_growth_coverage",
    "Fundamental Growth Coverage",
    "Dividend Growth Coverage"
  ])
);

check("syncFromSheet uses mapped payload", /const mapped=mapSyncPayload\(data\)/.test(html));
check("sheet sync applies private defaults from mapped payload", /applyPrivateDefaults\(mapped\.privateDefaults\)/.test(html));
check("sheet sync saves mapped health", /saveHealth\(mapped\.health,mapped\.warnings\)/.test(html));
check("legacy expected growth fallback still exists", html.includes("defaultExpectedGrowth(p.name)"));
check("N/A display helper exists", html.includes("pctMaybe"));

try {
  new Function(sw);
} catch (error) {
  failures.push(`sw.js parses: ${error.message}`);
}
check("service worker has scoped cache prefix", sw.includes('CACHE_PREFIX = "portfolio-os-shell-"'));
check("service worker cache version bumped", sw.includes("v15-code-hardening"));
check("service worker bypasses cross-origin requests", /url\.origin\s*!==\s*self\.location\.origin/.test(sw));
check("service worker limits index fallback to navigation", sw.includes('request.mode==="navigate"'));
check("service worker deletes only own caches", sw.includes("key.startsWith(CACHE_PREFIX)"));

if (failures.length) {
  console.error("Smoke test failed:");
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Smoke test passed (${scripts.length} scripts, ${ids.length} ids, ${staticIdRefs.length} static id refs).`);
