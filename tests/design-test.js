// Dependency-free runtime/cache regression checks. Not a browser layout test.
// Optional argument: git ref to compare unchanged business functions against.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

function element(attributes = {}) {
  const classes = new Set((attributes.className || "").split(/\s+/));
  return {
    value: "", textContent: "", innerHTML: "", style: {}, dataset: {}, ...attributes,
    classList: { toggle(name, active) { active ? classes.add(name) : classes.delete(name); }, contains(name) { return classes.has(name); } },
    addEventListener() {}, querySelectorAll() { return []; }, focus() {}, scrollIntoView() {},
    setAttribute(name, value) { this[name] = value; }, removeAttribute(name) { delete this[name]; }
  };
}

function appContext(source, data = {}) {
  const elements = new Map();
  for (const match of source.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    elements.set(match[1], element({ id: match[1], value: match[0].match(/\bvalue="([^"]*)"/)?.[1] || "" }));
  }
  const views = [...source.matchAll(/<section id="([^"]+)" class="([^"]+)"/g)].map(match => element({ id: match[1], className: match[2] }));
  const navigation = [...source.matchAll(/<button[^>]+data-view="([^"]+)"/g)].map(match => element({ dataset: { view: match[1] } }));
  const storage = new Map(Object.entries(data));
  const context = vm.createContext({
    console, Intl, URL, URLSearchParams, Blob,
    setTimeout() {}, clearTimeout() {}, alert() {}, confirm() { return false; },
    window: { addEventListener() {}, scrollTo() {} }, navigator: {},
    localStorage: { getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, String(value)); }, removeItem(key) { storage.delete(key); } },
    document: {
      getElementById(id) { return elements.get(id) || null; },
      addEventListener() {},
      querySelectorAll(selector) { return selector === ".view" ? views : selector === ".nav button" ? navigation : []; }
    }
  });
  for (const match of source.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(match[1], context);
  return { context, elements, navigation, views };
}

const demo = {
  portfolio_os_v4_positions: JSON.stringify([
    { name: "Alpha Compounder", broker: "Demo Depot", value: 20000, shares: 100, annual_div: 600, monthly: 400, fundamental_growth: 9, expected_dividend_growth: 5 },
    { name: "Beta Growth", broker: "Demo Depot", value: 10000, shares: 20, annual_div: 100, monthly: 200, fundamental_growth: 12, expected_dividend_growth: 8 },
    { name: "Gold", value: 3000, annual_div: 0, asset_class: "Gold" },
    { name: "Bitcoin", value: 2000, annual_div: 0, asset_class: "Krypto" }
  ]),
  portfolio_os_v5_cash_total: "5000",
  portfolio_os_v10_history: JSON.stringify([{ date: "2026-08-01", financial_assets: 37000 }, { date: "2026-09-01", financial_assets: 40000 }]),
  portfolio_os_v16_watchlist: JSON.stringify([{ name: "Alpha Compounder", ticker: "DEMO", price: 200, currency: "EUR", interesting_below: 190, strong_below: 170, annual_dividend: 6, dividend_yield: 3 }])
};

const empty = appContext(html);
assert.equal(empty.elements.get("mNetWorth").textContent, "0 €");
const loaded = appContext(html, demo);
assert.equal(loaded.elements.get("mNetWorth").textContent, "40.000 €");
assert.equal(loaded.elements.get("mCryptoAssets").textContent, "2.000 €");
assert.equal(loaded.elements.get("dividendProjection").innerHTML.match(/class="projection-row/g).length, 9);
assert.match(loaded.elements.get("dividendProjection").innerHTML, /Jahr 20/);
assert.match(loaded.elements.get("watchlistBody").innerHTML, /Alpha Compounder/);
loaded.elements.get("historyChart").clientWidth = 320;
loaded.context.renderHistory();
assert.match(loaded.elements.get("historyChart").innerHTML, /viewBox="0 0 320 240"/);
assert.match(loaded.elements.get("historyChart").innerHTML, /stroke="var\(--accent\)"/);
for (const button of loaded.navigation) {
  loaded.context.switchView(button.dataset.view);
  assert.equal(loaded.views.filter(view => view.classList.contains("active")).length, 1);
  assert.equal(loaded.navigation.filter(item => item["aria-current"] === "page").length, 1);
  assert.equal(button["aria-current"], "page");
}

if (process.argv[2]) {
  const baseline = execFileSync("git", ["show", `${process.argv[2]}:index.html`], { cwd: root, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  const original = appContext(baseline, demo);
  const presentationFunctions = new Set(["switchView", "renderDividendProjection", "renderForecast", "renderHistory"]);
  let compared = 0;
  for (const [name, value] of Object.entries(original.context)) {
    if (typeof value !== "function" || presentationFunctions.has(name)) continue;
    assert.equal(loaded.context[name]?.toString(), value.toString(), `${name} must remain unchanged`);
    compared++;
  }
  for (const year of [1, 2, 3, 4, 5, 10, 15, 20]) {
    assert.equal(loaded.context.forwardDividendRunrate(year), original.context.forwardDividendRunrate(year));
  }
  assert.equal(JSON.stringify(loaded.context.netWorthProjection12m(loaded.context.totals())), JSON.stringify(original.context.netWorthProjection12m(original.context.totals())));
  console.log(`${compared} non-presentation functions and all forecast results unchanged.`);
}

async function testOfflineShell() {
  const listeners = {};
  const origin = "https://portfolio.test/portfolio-os/";
  const key = value => new URL(typeof value === "string" ? value : value.url, origin).href;
  const stores = new Map([["unrelated-app-cache", new Map()], ["portfolio-os-shell-old", new Map()]]);
  const caches = {
    keys: async () => [...stores.keys()], delete: async name => stores.delete(name),
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      return { async addAll(urls) {
        for (const url of urls) {
          const file = path.join(root, url.split("?")[0]);
          assert.ok(fs.existsSync(file), `precache file exists: ${url}`);
          stores.get(name).set(key(url), fs.readFileSync(file));
        }
      } };
    },
    async match(request) { for (const cache of stores.values()) if (cache.has(key(request))) return cache.get(key(request)); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "sw.js"), "utf8"), {
    URL, Set, caches, fetch: async () => { throw new Error("offline"); },
    self: { location: { href: `${origin}sw.js`, origin: new URL(origin).origin }, skipWaiting() {}, clients: { claim() {} }, addEventListener(name, callback) { listeners[name] = callback; } }
  });
  let completion;
  const lifecycle = { waitUntil(promise) { completion = promise; } };
  listeners.install(lifecycle); await completion;
  listeners.activate(lifecycle); await completion;
  assert.ok(stores.has("unrelated-app-cache"));
  assert.ok(!stores.has("portfolio-os-shell-old"));
  for (const [url, mode] of [[origin, "navigate"], [`${origin}styles.css?v=28`, "cors"]]) {
    let response;
    listeners.fetch({ request: { url, mode, method: "GET" }, respondWith(promise) { response = promise; } });
    assert.ok((await response)?.length > 0, `offline response: ${url}`);
  }
  let intercepted = false;
  listeners.fetch({ request: { url: "https://script.google.com/example", method: "GET" }, respondWith() { intercepted = true; } });
  assert.equal(intercepted, false, "sheet sync must not be cached");
  console.log("Runtime checks passed: empty/populated render, 12 tabs, projections, watchlist, offline HTML/CSS and cache isolation.");
}
testOfflineShell().catch(error => { console.error(error); process.exitCode = 1; });
