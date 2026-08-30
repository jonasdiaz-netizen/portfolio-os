const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const fixturesDir = path.join(__dirname, "fixtures");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const appsScriptPath = path.join(root, "portfolio_os_google_sync_v12.gs");
const appsScript = fs.existsSync(appsScriptPath) ? fs.readFileSync(appsScriptPath, "utf8") : "";

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

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function closeTo(actual, expected, tolerance = 0.000001) {
  if (expected === null) return actual === null;
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

const sheetPositionFields = {
  fundamentalGrowth: [
    "fundamental_growth","expected_fundamental_growth","expected_fundamental_growth_3_5y",
    "expected_fundamental_growth_3-5y","Expected Fundamental Growth 3–5Y","Expected Fundamental Growth 3-5Y"
  ],
  dividendGrowth: [
    "dividend_growth","expected_dividend_growth","expected_dividend_growth_3_5y",
    "expected_dividend_growth_3-5y","Expected Dividend Growth 3–5Y","Expected Dividend Growth 3-5Y"
  ],
  fcfGrowth: [
    "fcf_share_growth","fcf_per_share_growth","fcf_share_growth_3_5y",
    "FCF/share Growth 3–5Y","FCF/share Growth 3-5Y"
  ],
  growthMetric: ["growth_metric","Growth Metric"],
  assetClass: ["asset_class","assetklasse","Assetklasse","Asset Class"],
  assetType: ["asset_type","asset_type_name","Asset Type","Typ"],
  sourceSheet: ["source_sheet","source_tab","sheet","Sheet","Tab"]
};

const sheetPortfolioKpiFields = {
  fundamentalGrowth: [
    "fundamental_growth","expected_fundamental_growth","Expected Fundamental Growth",
    "Expected Fundamental Growth 3–5Y","Expected Fundamental Growth 3-5Y"
  ],
  dividendGrowth: [
    "dividend_growth","expected_dividend_growth","Expected Dividend Growth",
    "Expected Dividend Growth 3–5Y","Expected Dividend Growth 3-5Y"
  ],
  fundamentalCoverage: [
    "fundamental_growth_coverage","expected_fundamental_growth_coverage","Fundamental Growth Coverage"
  ],
  dividendCoverage: [
    "dividend_growth_coverage","expected_dividend_growth_coverage","Dividend Growth Coverage"
  ]
};

function prop(obj, names) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(obj, name)) return obj[name];
    const match = Object.keys(obj).find(key => String(key).trim().toLowerCase() === String(name).trim().toLowerCase());
    if (match !== undefined) return obj[match];
  }
  return undefined;
}

function parseMaybePct(value, scaleFraction = true) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || /^n\/?a$/i.test(trimmed) || /^na$/i.test(trimmed) || /^-$/.test(trimmed)) return null;
    value = trimmed.replace("%", "").replace(",", ".");
  }
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return scaleFraction && Math.abs(number) > 0 && Math.abs(number) <= 1 ? number * 100 : number;
}

function defaultExpectedGrowth(name) {
  const normalized = String(name || "").toLowerCase();
  if (normalized === "microsoft") return 9;
  if (normalized === "nvidia") return 15;
  if (normalized === "alphabet") return 12;
  return 5;
}

function mapFixturePosition(position, source = "manual") {
  const fundamentalGrowth = parseMaybePct(prop(position, sheetPositionFields.fundamentalGrowth), false);
  const dividendGrowth = parseMaybePct(prop(position, sheetPositionFields.dividendGrowth), false);
  const fcfGrowth = parseMaybePct(prop(position, sheetPositionFields.fcfGrowth), false);
  const assetClass = prop(position, sheetPositionFields.assetClass) || "";
  const assetType = prop(position, sheetPositionFields.assetType) || "";
  const sourceSheet = prop(position, sheetPositionFields.sourceSheet) || "";
  const isCrypto = /\b(krypto|crypto)\b/i.test([assetClass, assetType, sourceSheet, position.broker].filter(Boolean).join(" "));
  const expectedGrowth = dividendGrowth ?? parseMaybePct(position.expected_growth, false) ?? parseMaybePct(position.growth, false) ?? (isCrypto ? 0 : defaultExpectedGrowth(position.name));
  return {
    ...position,
    source: position.source || source,
    source_key: position.source_key || "",
    growth_metric: prop(position, sheetPositionFields.growthMetric) || position.growth_metric || "",
    asset_class: assetClass || position.asset_class || "",
    asset_type: assetType || position.asset_type || "",
    source_sheet: sourceSheet || position.source_sheet || "",
    fundamental_growth: fundamentalGrowth,
    expected_dividend_growth: dividendGrowth,
    fcf_share_growth: fcfGrowth,
    expected_growth: expectedGrowth
  };
}

function normalizeFixtureGrowthKpis(raw) {
  if (!raw || typeof raw !== "object") return null;
  const fundamental = parseMaybePct(prop(raw, sheetPortfolioKpiFields.fundamentalGrowth), false);
  const dividend = parseMaybePct(prop(raw, sheetPortfolioKpiFields.dividendGrowth), false);
  const fundamentalCoverage = parseMaybePct(prop(raw, sheetPortfolioKpiFields.fundamentalCoverage), false);
  const dividendCoverage = parseMaybePct(prop(raw, sheetPortfolioKpiFields.dividendCoverage), false);
  if (fundamental === null && dividend === null && fundamentalCoverage === null && dividendCoverage === null) return null;
  return {
    fundamental_growth: fundamental,
    dividend_growth: dividend,
    fundamental_growth_coverage: fundamentalCoverage,
    dividend_growth_coverage: dividendCoverage
  };
}

function extractFixtureGrowthKpis(data) {
  const candidates = [data, data?.portfolio_kpis, data?.growth_kpis, data?.dashboard, data?.metrics, data?.portfolio_metrics];
  for (const candidate of candidates) {
    const kpis = normalizeFixtureGrowthKpis(candidate);
    if (kpis) return kpis;
  }
  return null;
}

function cryptoFixturePositions(data) {
  const groups = [data?.crypto_positions, data?.crypto, data?.krypto].filter(Array.isArray);
  return groups.flat().map(position => ({
    ...position,
    name: position.name || position.Name || position.asset || position.Asset || position.coin || position.Coin || position.token || position.Token || position.ticker || position.Ticker || position.symbol || position.Symbol,
    broker: position.broker || position.wallet || position.Wallet || position.platform || "Krypto",
    annual_div: position.annual_div ?? position.annualDividend ?? 0,
    expected_growth: position.expected_growth ?? 0,
    asset_class: prop(position, sheetPositionFields.assetClass) || "Krypto",
    asset_type: prop(position, sheetPositionFields.assetType) || "Krypto",
    source_sheet: prop(position, sheetPositionFields.sourceSheet) || "Krypto"
  }));
}

function syncFixturePositions(data) {
  return [...(data?.positions || []), ...cryptoFixturePositions(data)];
}

function weightedGrowth(positions, valueField, weightField) {
  let weighted = 0;
  let eligibleWeight = 0;
  let totalWeight = 0;
  for (const position of positions) {
    const weight = Number(position[weightField]) || 0;
    if (weight <= 0) continue;
    totalWeight += weight;
    const value = parseMaybePct(position[valueField], false);
    if (value === null) continue;
    weighted += weight * value;
    eligibleWeight += weight;
  }
  return {
    value: eligibleWeight ? weighted / eligibleWeight : null,
    coverage: totalWeight ? eligibleWeight / totalWeight * 100 : null
  };
}

function fixtureGrowthTotals(payload) {
  const positions = syncFixturePositions(payload).map(position => mapFixturePosition({ ...position, source: "sheet" }, "sheet"));
  const portfolioGrowthKpis = extractFixtureGrowthKpis(payload);
  const fromPositionsFundamental = weightedGrowth(positions, "fundamental_growth", "value");
  const fromPositionsDividend = weightedGrowth(positions, "expected_dividend_growth", "annual_div");
  const legacyDividend = weightedGrowth(positions, "expected_growth", "annual_div");
  const effectiveDividend = fromPositionsDividend.value !== null ? fromPositionsDividend : legacyDividend;
  return {
    positions,
    fundamentalGrowth: portfolioGrowthKpis?.fundamental_growth ?? fromPositionsFundamental.value,
    fundamentalCoverage: portfolioGrowthKpis?.fundamental_growth_coverage ?? fromPositionsFundamental.coverage,
    dividendGrowth: portfolioGrowthKpis?.dividend_growth ?? effectiveDividend.value,
    dividendGrowthCoverage: portfolioGrowthKpis?.dividend_growth_coverage ?? effectiveDividend.coverage
  };
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
  "extractPortfolioGrowthKpis",
  "cryptoPayloadPositions",
  "syncPayloadPositions",
  "positionClassification",
  "isCryptoPosition",
  "cryptoTotals",
  "renderDashboardOverview",
  "renderDashboardInvestment",
  "renderGrowthKpis",
  "growthRankingRow",
  "assetDetailHeroHtml",
  "assetBrokerTableHtml",
  "dataPositionRow",
  "dataRowActions",
  "goalAssumptionsText",
  "goalScenarioGridHtml",
  "fillGoalForm",
  "defaultGoalDraft",
  "renderRealEstateTotals",
  "propertyCardHtml",
  "allocationModel",
  "allocationRowHtml",
  "bindAllocationTargetInputs"
].forEach(symbol => check(`${symbol} exists`, html.includes(symbol)));

check("no inline onclick attributes", !/\sonclick=/.test(html));
check("edit/delete buttons use data actions", includesAll(html, [
  'data-action="edit-goal"',
  'data-action="delete-goal"',
  'data-action="edit-position"',
  'data-action="delete-position"',
  'data-action="edit-property"',
  'data-action="delete-property"'
]));

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
  "crypto position aliases are mapped",
  includesAll(html, [
    "asset_class",
    "source_sheet",
    "cryptoPayloadPositions",
    "mCryptoExposure"
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
if (appsScript) {
  try {
    new Function(appsScript);
  } catch (error) {
    failures.push(`portfolio_os_google_sync_v12.gs parses: ${error.message}`);
  }
}
check("service worker has scoped cache prefix", sw.includes('CACHE_PREFIX = "portfolio-os-shell-"'));
check("service worker cache version bumped", sw.includes("v17-crypto-dashboard"));
check("service worker bypasses cross-origin requests", /url\.origin\s*!==\s*self\.location\.origin/.test(sw));
check("service worker limits index fallback to navigation", sw.includes('request.mode==="navigate"'));
check("service worker deletes only own caches", sw.includes("key.startsWith(CACHE_PREFIX)"));

[
  "sync-payload-full-growth.json",
  "sync-payload-partial-na.json",
  "sync-payload-legacy-fallback.json",
  "backup-v14.json"
].forEach(name => {
  check(`fixture ${name} exists`, fs.existsSync(path.join(fixturesDir, name)));
});

const cryptoFixture = fixtureGrowthTotals({
  krypto: [
    { name: "Bitcoin", broker: "Wallet", value: 2500 },
    { name: "Ethereum", value: 1500, source_sheet: "Crypto" }
  ]
});
check("crypto payload positions merge into sync positions", cryptoFixture.positions.length === 2);
check("crypto payload defaults to zero dividend growth fallback", cryptoFixture.positions.every(position => position.expected_growth === 0));
check("crypto payload keeps asset class", cryptoFixture.positions.every(position => position.asset_class === "Krypto"));

if (appsScript) {
  check("Apps Script includes optional Krypto tab", appsScript.includes('"Krypto"') && appsScript.includes('"Crypto"'));
  check("Apps Script maps crypto aliases", includesAll(appsScript, ["Coin", "Token", "Menge", "Marktwert EUR"]));
  check("Apps Script marks crypto positions", appsScript.includes('asset_class:isCryptoTab ? "Krypto" : ""'));
}

[
  "sync-payload-full-growth.json",
  "sync-payload-partial-na.json",
  "sync-payload-legacy-fallback.json"
].forEach(name => {
  const fixture = readFixture(name);
  const totals = fixtureGrowthTotals(fixture.payload);
  const expected = fixture.expected;
  check(`${name} fundamental growth`, closeTo(totals.fundamentalGrowth, expected.fundamentalGrowth), `${totals.fundamentalGrowth} !== ${expected.fundamentalGrowth}`);
  check(`${name} fundamental coverage`, closeTo(totals.fundamentalCoverage, expected.fundamentalCoverage), `${totals.fundamentalCoverage} !== ${expected.fundamentalCoverage}`);
  check(`${name} dividend growth`, closeTo(totals.dividendGrowth, expected.dividendGrowth), `${totals.dividendGrowth} !== ${expected.dividendGrowth}`);
  check(`${name} dividend coverage`, closeTo(totals.dividendGrowthCoverage, expected.dividendGrowthCoverage), `${totals.dividendGrowthCoverage} !== ${expected.dividendGrowthCoverage}`);
});

const backup = readFixture("backup-v14.json");
check("backup fixture is schema v14", backup.schemaVersion === 14);
check("backup fixture stores growth kpis", backup.portfolioGrowthKpis && typeof backup.portfolioGrowthKpis === "object");
check("backup fixture stores goals", Array.isArray(backup.goals));
check("backup fixture stores allocation targets", backup.allocationTargets && typeof backup.allocationTargets === "object");
check("backup fixture does not store sync secret", !JSON.stringify(backup).includes("portfolio_os_v4_sync_secret"));
check("backup fixture does not store sync url", !JSON.stringify(backup).includes("portfolio_os_v4_sync_url"));

if (failures.length) {
  console.error("Smoke test failed:");
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Smoke test passed (${scripts.length} scripts, ${ids.length} ids, ${staticIdRefs.length} static id refs).`);
