// Builds index.html (a single self-contained page, ready for GitHub Pages) from src/.
//   node build.js              -> index.html
//   node build.js --artifact   -> also dist/artifact.html (head/body-less fragment for the Claude Artifact tool)
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const core = read('src/core.js');
const ui = read('src/ui.js');
const template = read('src/template.html');

// template.html is a fragment: head items (title, fonts, style) followed by the page markup and one <script>.
const fragment = template.split('/*CORE*/').join(core).split('/*UI*/').join(ui);

const cut = fragment.indexOf('<div class="app">');
if (cut < 0) throw new Error('template.html: could not find <div class="app">');
const head = fragment.slice(0, cut).replace(/<meta name="claude:viewport-fit-sides"[^>]*>\n?/, '');
const body = fragment.slice(cut);

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}[hidden]{display:none!important}</style>
${head}</head>
<body>
${body}</body>
</html>
`;
fs.writeFileSync(path.join(root, 'index.html'), page);
console.log('wrote index.html', page.length, 'bytes');

if (process.argv.includes('--artifact')) {
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'artifact.html'), fragment);
  console.log('wrote dist/artifact.html');
}
