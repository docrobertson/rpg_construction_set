// Usage: node tests/shot.mjs "<query>" out.png [w h wait]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium } = pw;
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const [,, query = '', out = path.join(HERE, 'out/shot.png'), w = '1280', h = '800', wait = '1500'] = process.argv;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
const url = 'file://' + path.resolve(HERE, '../../index.html') + (query ? '?' + query : '');
await page.goto(url);
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
if (errors.length) console.log(errors.join('\n'));
await browser.close();
