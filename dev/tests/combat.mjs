// Combat UI test: drive spells and targeting with the keyboard.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const log = (x) => console.log(JSON.stringify(x));
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await wait(1200);
await ev(async () => { const app = window.__app; app.playGame(app.sample, { quick: true, noSave: true }); await new Promise((r) => setTimeout(r, 1500)); });
// level the party a little so they have spells
await ev(() => { const s = window.__app.session; const { gainXp } = {}; for (const m of s.party.members) { m.level = 5; m.mp = 30; m.hp = 90; } });
await ev(() => { const s = window.__app.session; s.engage({ id: 'x', monster: 'goblin', count: '5', roaming: true }); });
await wait(2500);
const active = () => ev(() => { const b = window.__app.session.battle; return b && b.active ? { name: b.active.name, cls: b.active.member.cls } : null; });
const waitActive = async (cls) => {
  for (let i = 0; i < 60; i++) {
    const a = await active();
    if (a && (!cls || a.cls === cls)) return a;
    if (a && cls && a.cls !== cls) { await page.keyboard.press(' '); }
    await wait(250);
  }
  return null;
};
// wizard: magic missile via keyboard
log(await waitActive('wizard'));
await page.keyboard.press('c');
await wait(300);
await shot('50-spell-menu');
await page.keyboard.press('1');
await wait(300);
await shot('51-targeting');
await page.keyboard.press('Enter');
await wait(1500);
await shot('52-after-missile');
// cleric: heal someone
log(await waitActive('cleric'));
await page.keyboard.press('c');
await wait(300);
const spells = await ev(() => [...document.querySelectorAll('.choose-item .ci-label')].map((x) => x.textContent));
log({ clericSpells: spells });
await page.keyboard.press('1');
await wait(300);
await page.keyboard.press('1');
await wait(1200);
await shot('53-after-heal');
// warrior: fight targeting with F when adjacent maybe; else wait
log(await waitActive('wizard'));
await page.keyboard.press('c');
await wait(300);
// pick Sleep (2nd entry probably)
const wizSpells = await ev(() => [...document.querySelectorAll('.choose-item .ci-label')].map((x) => x.textContent));
log({ wizSpells });
const sleepIdx = wizSpells.findIndex((s) => s.startsWith('Fireball')) + 1 || wizSpells.findIndex((s) => s.startsWith('Sleep')) + 1;
await page.keyboard.press(String(sleepIdx));
await wait(300);
await page.keyboard.press('Tab');
await wait(150);
await page.keyboard.press('Enter');
await wait(2000);
await shot('54-after-area');
log(await ev(() => { const b = window.__app.session.battle; return b ? b.enemies.map((e) => ({ hp: e.hp, sleep: e.sleep, dead: !!e.dead })) : 'over'; }));
// skills from the keyboard: the wizard's Firebolt is key 1, then Enter at the chosen foe
let fails = 0;
const expect = (name, ok, info) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + ' ' + JSON.stringify(info)); if (!ok) fails++; };
// let the fireball finish, then wait for the wizard's next turn
const settle = () => ev(async () => { for (let i = 0; i < 100; i++) { const b = window.__app.session.battle; if (!b || (b.active && !b.acting)) return true; await new Promise((r) => setTimeout(r, 100)); } return false; });
await settle();
if (await ev(() => window.__app.session.battle?.active?.member.cls === 'wizard')) { await page.keyboard.press(' '); await wait(300); }
const inBattle = await ev(() => !!window.__app.session.battle);
if (inBattle && await waitActive('wizard') && await settle()) {
  const ready = await ev(() => { const b = window.__app.session.battle; const u = b.active; const ab = b.abilitiesOf(u).find((a) => a.id === 'firebolt'); return b.canUseAbility(u, ab).ok; });
  if (ready) {
    await page.keyboard.press('1');
    await wait(250);
    const targeting = await ev(() => window.__app.playUI.targeting?.label);
    await shot('55-skill-targeting');
    await page.keyboard.press('Enter');
    await wait(1800);
    const after = await ev(() => { const b = window.__app.session.battle; const u = b?.partyUnits.find((p) => p.member.cls === 'wizard'); return u ? { cd: u.cd.firebolt || 0, uses: u.uses.firebolt || 0 } : 'over'; });
    expect('key 1 aims the first skill and Enter fires it', targeting === 'Firebolt' && (after === 'over' || after.uses === 1), { targeting, after });
  }
}
// G braces the active hero
if (await ev(() => !!window.__app.session.battle) && await waitActive() && await settle()) {
  for (let i = 0; i < 3; i++) { if (!(await ev(() => !!document.querySelector('.modal-back')))) break; await page.keyboard.press('Escape'); await wait(100); }
  const g = await ev(() => { const b = window.__app.session.battle; return { name: b.active.name, ac: b.acOf(b.active) }; });
  await page.keyboard.press('g');
  await wait(600);
  // the guard lasts until the hero's next turn, which can come round within the wait on a fast machine
  const g2 = await ev((n) => {
    const b = window.__app.session.battle; const u = b?.partyUnits.find((p) => p.name === n);
    const logged = [...document.querySelectorAll('.log-line')].some((el) => el.textContent.includes(`${n} stands guard`));
    return u ? { ac: b.acOf(u), shielded: b.has(u, 'shielded'), logged } : 'over';
  }, g.name);
  expect('G guards', g2 === 'over' || (g2.shielded ? g2.ac === g.ac + 3 : g2.logged), { g, g2 });
}
// the action bar explains why an action is out of reach
const why = await ev(() => [...document.querySelectorAll('.cbt-btn.off .cb-sub')].map((x) => x.textContent));
console.log(JSON.stringify({ disabledReasons: why }));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
if (fails) { console.log(`${fails} FAILED`); await browser.close(); process.exit(1); }
await browser.close();
