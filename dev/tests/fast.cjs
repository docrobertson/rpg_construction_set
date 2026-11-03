// Preloaded by tests/run.mjs (node --require): every page the test scripts
// open gets window.__RPG_FAST__, so the game draws at half resolution
// without shadows and plays its animations faster. The scripts themselves
// are unchanged; set FULL_RENDER=1 to test at full quality.
const path = require('node:path');
const { createRequire } = require('node:module');
const { execSync } = require('node:child_process');

if (!process.env.FULL_RENDER) {
  const req = createRequire(path.join(__dirname, 'x.js'));
  let pw;
  try { pw = req('playwright'); } catch { pw = req(execSync('npm root -g').toString().trim() + '/playwright'); }
  const fast = () => { window.__RPG_FAST__ = true; };
  const launch = pw.chromium.launch.bind(pw.chromium);
  pw.chromium.launch = async (...args) => {
    const browser = await launch(...args);
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (...a) => { const ctx = await newContext(...a); await ctx.addInitScript(fast); return ctx; };
    const newPage = browser.newPage.bind(browser);
    browser.newPage = async (...a) => { const page = await newPage(...a); await page.addInitScript(fast); return page; };
    return browser;
  };
}
