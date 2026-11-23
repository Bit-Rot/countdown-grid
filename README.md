# Countdown Grid

A single-player prototype inspired by Marvel Snap. Each side has its own 3x4 grid, every card has a countdown timer, and the first side to 100 points wins. The enemy shows its plays before you answer, and a forecast shows exactly what will happen if you end the round now.

No accounts, installs or servers: it is one static page.

## Layout

- `src/core.js`: game rules, AI and forecast (pure logic, no DOM)
- `src/ui.js`: rendering and input
- `src/template.html`: page markup and styles
- `build.js`: combines the three into `index.html`
- `tools/`: simulations and checks (`node tools/sim.js`, `node tools/fctest.js`, ...)
- `art/`: card art, one 512px JPEG per card id (plus `sandling.jpg`, a crop used for the Sandling token)
- `tools/make-art.ps1`: regenerates `art/` from the 1024px source PNGs (`powershell -File tools/make-art.ps1 -SourceDir "<folder>"`)
- `index.html`: the built page, served by GitHub Pages

## Making a change

1. Edit files in `src/`.
2. `node build.js`
3. Optional: `node tools/sim.js` for balance numbers, `node tools/fctest.js` to check the forecast still matches real play.
4. Commit and push `main`. GitHub Pages republishes in about a minute.

`index.html` is committed on purpose, because Pages serves it as-is.
