// Bundles src/ into a single self-contained index.html (works from file://, offline).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const dev = process.argv.includes('--dev');
const watch = process.argv.includes('--watch');
const root = path.dirname(new URL(import.meta.url).pathname);

function writeHtml(js) {
  const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
  const tpl = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  const html = tpl
    .replace('/*__CSS__*/', () => css)
    .replace('/*__JS__*/', () => safeJs);
  fs.writeFileSync(path.join(root, 'index.html'), html);
  console.log(`[build] index.html written (${(html.length / 1024).toFixed(0)} KB)${dev ? ' [dev]' : ''}`);
}

const options = {
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  write: false,
  minify: !dev,
  legalComments: 'none',
  logLevel: 'warning',
  plugins: [{
    name: 'inline-html',
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length) return;
        writeHtml(result.outputFiles[0].text);
      });
    },
  }],
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('[build] watching src/ ...');
} else {
  await esbuild.build(options);
}
