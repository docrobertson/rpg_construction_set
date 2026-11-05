// Runs the test suites, by default only those a change can affect.
//
//   node tests/run.mjs             suites for what changed since origin/main
//                                  (commits and uncommitted edits), plus quick
//   node tests/run.mjs --all       every suite
//   node tests/run.mjs --quick     just the quick sanity pass
//   node tests/run.mjs combat magic   the named suites
//   options: --base <ref> (compare with another ref), -j <n> (suites at once,
//            default 2), --list (show the plan without running)
//
// Suites run against the built ../index.html (run `node build.mjs` first) in
// fast mode (tests/fast.cjs: half resolution, no shadows, quicker
// animations); set FULL_RENDER=1 for full quality.
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const DEV = path.resolve(HERE, '..');
const ALL = ['quick', 'smoke', 'deep', 'combat', 'flows', 'regressions', 'features', 'editor', 'quests', 'explore', 'progress', 'magic', 'places',
  'cs_shell', 'cs_places', 'cs_story', 'cs_checklist', 'delve', 'charms', 'containers', 'landmarks', 'skills'].filter((s) => fs.existsSync(path.join(HERE, s + '.mjs')));

// what each part of the source can break (paths relative to dev/src)
const RULES = [
  [/^(render|data)\/containers\.js$|^ui\/editor\/containerFields\.js$/, ['containers']],
  [/^render\/landmarks\.js$|^world\/countryside\.js$/, ['landmarks']],
  [/^render\/fx\.js$/, ['combat', 'features']],
  [/^render\//, ['explore', 'places']],
  [/^game\/combat\.js$|^ui\/combatHud\.js$/, ['combat', 'features', 'deep', 'regressions', 'delve', 'charms', 'skills']],
  [/^game\/rules\.js$|^data\/defaults\.js$/, ['combat', 'features', 'progress', 'magic', 'deep', 'charms', 'skills']],
  [/^game\/magic\.js$|^ui\/spellbook\.js$/, ['magic']],
  [/^game\/(quests|events|dialog)\.js$|^ui\/journal\.js$/, ['quests', 'progress']],
  [/^game\/treasure\.js$|^ui\/treasureMap\.js$/, ['progress']],
  [/^game\/(session|travel|walk|path|los)\.js$/, ['explore', 'progress', 'flows', 'regressions', 'delve']],
  [/^ui\/(explore|hoverInfo)\.js$/, ['explore']],
  [/^ui\/(play|dom|icons|levelUp|vellum)\.js$|^styles\.css$/, ['features', 'quests', 'explore']],
  [/^ui\/editor\/(places|land)\.js$|^world\/places\.js$/, ['cs_places']],
  [/^ui\/editor\/(story|quests)\.js$|^world\/storyGen\.js$/, ['cs_story']],
  [/^game\/story\.js$/, ['cs_story', 'quests', 'progress', 'cs_checklist']],
  [/^ui\/editor\/checklist\.js$|^game\/checklist\.js$|^ui\/testTools\.js$/, ['cs_checklist']],
  [/^game\/delve\.js$/, ['delve', 'quick']],
  [/^game\/charms\.js$/, ['charms', 'combat']],
  [/^ui\/editor\//, ['editor', 'cs_shell']],
  [/^ui\/(partyCreate|help|fonts)\.js$|^main\.js$|^index\.template\.html$/, ['smoke', 'flows']],
  [/^game\/looks\.js$/, ['smoke']],
  [/^data\/sample\.js$/, ['quests', 'progress', 'places', 'deep']],
  [/^world\/generate\.js$/, ['editor', 'places', 'progress', 'cs_places']],
  [/^world\//, ['explore', 'places']],
  [/^data\/(schema|terrain)\.js$|^core\//, ['flows', 'regressions', 'quests', 'explore']],
];

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const jobs = Math.max(1, parseInt(opt('-j', '2'), 10) || 2);
const named = args.filter((a, i) => !a.startsWith('-') && !['-j', '--base'].includes(args[i - 1]));

function changedFiles(base) {
  const sh = (c) => { try { return execSync(c, { cwd: DEV, stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').filter(Boolean); } catch { return null; } };
  const committed = sh(`git diff --name-only ${base}...HEAD`);
  if (committed == null) return null; // no such base: play safe
  return [...new Set([...committed, ...(sh('git diff --name-only HEAD') || []), ...(sh('git ls-files --others --exclude-standard') || [])])];
}

function plan() {
  if (flag('--all')) return { suites: ALL, why: 'all suites' };
  if (flag('--quick')) return { suites: ['quick'], why: 'quick pass' };
  if (named.length) return { suites: named, why: 'as named' };
  const base = opt('--base', 'origin/main');
  const files = changedFiles(base);
  if (!files) return { suites: ALL, why: `could not compare with ${base}: all suites` };
  const want = new Set(['quick']);
  const unmapped = [];
  for (const f of files) {
    const rel = f.replace(/^dev\//, '');
    if (rel.startsWith('src/')) {
      const p = rel.slice(4);
      const hits = RULES.filter(([re]) => re.test(p));
      if (!hits.length) unmapped.push(p);
      for (const [, s] of hits) s.forEach((x) => want.add(x));
    } else if (rel.startsWith('tests/')) {
      const name = path.basename(rel, '.mjs');
      if (ALL.includes(name)) want.add(name);
    }
  }
  // a source file no rule knows about could break anything
  if (unmapped.length) return { suites: ALL, why: `unrecognised changes (${unmapped.join(', ')}): all suites` };
  return { suites: ALL.filter((s) => want.has(s)), why: `${files.length} changed file${files.length === 1 ? '' : 's'} since ${base}` };
}

const { suites, why } = plan();
for (const s of suites) if (!fs.existsSync(path.join(HERE, s + '.mjs'))) { console.error(`No such suite: ${s}`); process.exit(2); }
console.log(`Running ${suites.length} suite${suites.length === 1 ? '' : 's'} (${why}): ${suites.join(', ')}`);
if (flag('--list')) process.exit(0);
if (!fs.existsSync(path.resolve(DEV, '../index.html'))) { console.error('Build first: node build.mjs'); process.exit(2); }

const results = [];
function runOne(name) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const out = [];
    const child = spawn(process.execPath, ['--require', path.join(HERE, 'fast.cjs'), path.join(HERE, name + '.mjs')], { cwd: DEV, env: process.env });
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => out.push(d));
    const kill = setTimeout(() => child.kill('SIGKILL'), 25 * 60 * 1000);
    child.on('close', (code) => {
      clearTimeout(kill);
      const text = Buffer.concat(out).toString();
      const failed = code !== 0 || /^FAIL/m.test(text);
      const secs = Math.round((Date.now() - t0) / 1000);
      results.push({ name, failed, secs, text });
      console.log(`${failed ? 'FAIL' : 'pass'}  ${name.padEnd(12)} ${String(secs).padStart(4)}s`);
      if (failed) console.log(text.split('\n').filter((l) => /FAIL|Error|error/.test(l)).slice(0, 8).map((l) => '      ' + l).join('\n'));
      resolve();
    });
  });
}

const t0 = Date.now();
const queue = [...suites];
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => { while (queue.length) await runOne(queue.shift()); }));
const bad = results.filter((r) => r.failed);
console.log(`\n${bad.length ? `${bad.length} of ${results.length} FAILED (${bad.map((r) => r.name).join(', ')})` : `all ${results.length} passed`} in ${Math.round((Date.now() - t0) / 1000)}s`);
process.exit(bad.length ? 1 : 0);
