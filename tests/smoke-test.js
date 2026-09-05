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
  const rawDividendGrowth = prop(position, sheetPositionFields.dividendGrowth);
  const hasDividendGrowthField = rawDividendGrowth !== undefined;
  const dividendGrowth = parseMaybePct(rawDividendGrowth, false);
  const fcfGrowth = parseMaybePct(prop(position, sheetPositionFields.fcfGrowth), false);
  const assetClass = prop(position, sheetPositionFields.assetClass) || "";
  const sourceSheet = prop(position, sheetPositionFields.sourceSheet) || "";
  const isCrypto = /\b(krypto|crypto)\b/i.test([assetClass, sourceSheet, position.broker].filter(Boolean).join(" "));
  const fallbackGrowth = parseMaybePct(position.expected_growth, false) ?? parseMaybePct(position.growth, false);
  const expectedGrowth = dividendGrowth ?? fallbackGrowth ?? (hasDividendGrowthField ? null : (isCrypto ? 0 : defaultExpectedGrowth(position.name)));
  return {
    ...position,
    source: position.source || source,
    source_key: position.source_key || "",
    growth_metric: prop(position, sheetPositionFields.growthMetric) || position.growth_metric || "",
    asset_class: assetClass || position.asset_class || "",
    source_sheet: sourceSheet || position.source_sheet || "",
    fundamental_growth: fundamentalGrowth,
    expected_dividend_growth: dividendGrowth,
    dividend_growth_explicit_na: hasDividendGrowthField && dividendGrowth === null,
    fcf_share_growth: fcfGrowth,
    expected_growth: expectedGrowth
  };
}

function normalizeFixtureGrowthKpis(raw) {
  if (Array.isArray(raw)) {
    const obj = {};
    for (const row of raw) {
      if (Array.isArray(row) && row.length >= 2) obj[String(row[0] || "").trim()] = row[1];
      else if (row && typeof row === "object") {
        const key = prop(row, ["metric", "kpi", "name", "label"]);
        const value = prop(row, ["value", "amount", "current"]);
        if (key !== undefined) obj[String(key).trim()] = value;
      }
    }
    raw = obj;
  }
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
  const merged = { fundamental_growth: null, dividend_growth: null, fundamental_growth_coverage: null, dividend_growth_coverage: null };
  let hasAny = false;
  for (const candidate of candidates) {
    const kpis = normalizeFixtureGrowthKpis(candidate);
    if (!kpis) continue;
    for (const key of Object.keys(merged)) {
      if (merged[key] === null && kpis[key] !== null && kpis[key] !== undefined) {
        merged[key] = kpis[key];
        hasAny = true;
      }
    }
  }
  return hasAny ? merged : null;
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

function dividendGrowthValue(position) {
  const sheet = parseMaybePct(position.expected_dividend_growth, false);
  if (sheet !== null) return { value: sheet, source: "Sheet" };
  const fallback = parseMaybePct(position.expected_growth, false);
  if (fallback !== null) return { value: fallback, source: "Fallback" };
  return { value: null, source: "N/A" };
}

function weightedDividendGrowth(positions) {
  let weighted = 0;
  let eligibleWeight = 0;
  let totalWeight = 0;
  for (const position of positions) {
    const weight = Number(position.annual_div) || 0;
    if (weight <= 0) continue;
    totalWeight += weight;
    const growth = dividendGrowthValue(position).value;
    if (growth === null) continue;
    weighted += weight * growth;
    eligibleWeight += weight;
  }
  return {
    value: eligibleWeight ? weighted / eligibleWeight : null,
    coverage: totalWeight ? eligibleWeight / totalWeight * 100 : null
  };
}

function fixtureGrowthTotals(payload) {
  const positions = (payload.positions || []).map(position => mapFixturePosition({ ...position, source: "sheet" }, "sheet"));
  const portfolioGrowthKpis = extractFixtureGrowthKpis(payload);
  const fromPositionsFundamental = weightedGrowth(positions, "fundamental_growth", "value");
  const effectiveDividend = weightedDividendGrowth(positions);
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
  "positionClassification",
  "isCryptoPosition",
  "isGoldPosition",
  "cryptoPortfolioValue",
  "positionProjectionRate12m",
  "projectedInvestedValue12m",
  "netWorthProjection12m",
  "getProjectionMonthlySavings",
  "saveProjectionMonthlySavings",
  "renderDividendProjection",
  "forwardDividendRunrate",
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
  "bindAllocationTargetInputs",
  "parseCurrencyExposure",
  "currencyExposureData",
  "currencyDonutHtml",
  "renderCurrencyExposure"
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
    "positionClassification",
    "mCryptoAssets",
    "mCryptoShare",
    "mix-crypto",
    "mNetWorthProjection",
    "12M-Projektion",
    "projectionSavingsInput",
    "PROJECTION_SAVINGS_KEY",
    "dividendProjection",
    "Forward-Dividende",
    "annualContrib*y",
    "projection-delta",
    "1.500 €/Monat",
    "longTermDividendGrowth=0.05",
    "5% Div.-Growth",
    "for(const year of [1,2,3,4,5,10,15,20])"
  ])
);
check("dashboard omits separate depot tile", !html.includes('id="mInvestedAssets"'));

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
check(
  "watchlist view is wired",
  includesAll(html, [
    'data-view="watchlist"',
    'id="watchlist"',
    "WATCHLIST_KEY",
    "mapWatchlistItem",
    "renderWatchlist",
    "watchlistBody"
  ])
);
check("watchlist sync payload is consumed", html.includes("data?.watchlist") && html.includes("mapped.watchlist"));
check(
  "currency exposure view is wired",
  includesAll(html, [
    'data-view="currencies"',
    'id="currencies"',
    'id="currencyWeightChart"',
    'id="currencyValueChart"',
    'id="currencyDividendChart"',
    "currency_model",
    "currency_exposure",
    "dividend_currency"
  ])
);

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
check("sheet sync timeout allows slower Apps Script responses", html.includes("jsonp(syncUrl,45000)"));
check("service worker cache version bumped", sw.includes("v31-cash-interest"));
const stylesheetHref = html.match(/<link rel="stylesheet" href="([^"]+)"/)?.[1];
check("shared stylesheet is linked", stylesheetHref === "styles.css?v=29");
check("stylesheet is precached for offline use", sw.includes(`"./${stylesheetHref}"`));
check("shared stylesheet exists", fs.existsSync(path.join(root, "styles.css")));
check("legacy inline theme removed", !html.includes("<style>"));
check("mobile safe area enabled", html.includes("viewport-fit=cover"));
check("navigation has accessible label", html.includes('aria-label="Hauptnavigation"'));
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
  positions: [
    { name: "Bitcoin", broker: "Krypto", value: 2500, asset_class: "Krypto", source_sheet: "Krypto" },
    { name: "Ethereum", broker: "Wallet", value: 1500, asset_class: "Krypto", source_sheet: "Crypto" }
  ]
});
check("crypto sheet positions stay in positions", cryptoFixture.positions.length === 2);
check("crypto sheet positions default to zero dividend growth", cryptoFixture.positions.every(position => position.expected_growth === 0));
check("crypto sheet positions keep asset class", cryptoFixture.positions.every(position => position.asset_class === "Krypto"));

const mixedDividendGrowth = fixtureGrowthTotals({
  positions: [
    { name: "Direct Growth", value: 1000, annual_div: 100, expected_dividend_growth: 10 },
    { name: "Legacy Growth", value: 9000, annual_div: 900, expected_growth: 4 }
  ]
});
check("partial direct dividend growth keeps legacy fallback", closeTo(mixedDividendGrowth.dividendGrowth, 4.6), `${mixedDividendGrowth.dividendGrowth} !== 4.6`);
check("partial direct dividend growth remains fully covered", closeTo(mixedDividendGrowth.dividendGrowthCoverage, 100), `${mixedDividendGrowth.dividendGrowthCoverage} !== 100`);

const mixedKpis = extractFixtureGrowthKpis({
  fundamental_growth: 12.7,
  growth_kpis: { dividend_growth: 6.8, dividend_growth_coverage: 80.7 }
});
check("portfolio KPI extraction merges partial sources", mixedKpis && closeTo(mixedKpis.fundamental_growth, 12.7) && closeTo(mixedKpis.dividend_growth, 6.8) && closeTo(mixedKpis.dividend_growth_coverage, 80.7));

check("sync rejects missing positions list", html.includes("Sync-Payload enthält keine positions-Liste"));
check("sync protects existing sheet positions from empty payloads", html.includes("allow_empty_positions"));
check("sync prevents concurrent requests", html.includes("let syncInFlight=false") && html.includes("Sync läuft bereits"));
check("null cash_total is ignored", html.includes("data.cash_total!==null") && html.includes("cashTotal:Number.isFinite(cashValue)?cashValue:null"));
check(
  "cash interest is included as a flat dividend component",
  includesAll(html, [
    "const CASH_INTEREST_RATE = 2.6;",
    "function cashInterestAnnual",
    "portfolioDividend+cashInterest",
    "totalForecastPositions(years,growthOverride,contribScale,reinvest)+cashInterestAnnual()"
  ])
);
check(
  "cash interest stays outside growth calculations",
  html.includes("const fromPositionsDividend=calcDividendGrowth();") &&
  html.includes("return div+t.cashInterest;")
);

if (appsScript) {
  check("Apps Script includes optional Krypto tab", appsScript.includes('"Krypto"') && appsScript.includes('"Crypto"'));
  check("Apps Script maps crypto aliases", includesAll(appsScript, ["Coin", "Token", "Menge", "Marktwert EUR"]));
  check("Apps Script marks crypto positions", appsScript.includes('asset_class:isCryptoTab ? "Krypto" : ""'));
  check("Apps Script exports watchlist payload", includesAll(appsScript, ["WATCHLIST_TAB", "readWatchlist_", "watchlist:watchlist"]));
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
check("current backup metadata is v17.1", html.includes("schemaVersion:17") && html.includes('appVersion:"17.1"') && html.includes("portfolio-os-v17.1-backup.json"));

if (failures.length) {
  console.error("Smoke test failed:");
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Smoke test passed (${scripts.length} scripts, ${ids.length} ids, ${staticIdRefs.length} static id refs).`);
