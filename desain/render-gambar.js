// Render file HTML desain (canvas) jadi PNG: node desain/render-gambar.js desain/jersey-graffiti.html
const fs = require('fs'), path = require('path'), puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/google-chrome'].find(p => fs.existsSync(p));
(async () => {
  const src = path.resolve(process.argv[2]), out = src.replace(/\.html$/, '.png');
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage(); await p.setViewport({ width: 1600, height: 1100 });
  await p.goto('file:///' + src.replace(/\\/g, '/')); await p.waitForFunction('window.siap === true');
  await (await p.$('canvas')).screenshot({ path: out }); await b.close(); console.log('Gambar: ' + out);
})();
