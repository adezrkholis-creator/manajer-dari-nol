// Foto profil IG "Manajer dari Nol" (logo klub Yonoha, orisinal) → out/profil/foto-profil.png
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/google-chrome'].find(p => fs.existsSync(p));
const OUT = path.join(__dirname, 'out', 'profil');
fs.mkdirSync(OUT, { recursive: true });

const html = `<!doctype html><html><body style="margin:0;background:#111"><canvas id="c" width="1080" height="1080"></canvas><script>
const c = document.getElementById('c'), g = c.getContext('2d'), F = '"Segoe UI", Arial, sans-serif';
// latar: rumput bergaris
for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#3f7a3a' : '#4a8a42'; g.fillRect(0, i * 90, 1080, 90); }
const vg = g.createRadialGradient(540, 540, 200, 540, 540, 760); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = vg; g.fillRect(0, 0, 1080, 1080);
// lencana perisai
function shield(s, col) { g.beginPath(); g.moveTo(540, 540 - 380 * s); g.lineTo(540 + 330 * s, 540 - 300 * s); g.lineTo(540 + 320 * s, 540 + 60 * s);
  g.quadraticCurveTo(540 + 280 * s, 540 + 300 * s, 540, 540 + 420 * s); g.quadraticCurveTo(540 - 280 * s, 540 + 300 * s, 540 - 320 * s, 540 + 60 * s);
  g.lineTo(540 - 330 * s, 540 - 300 * s); g.closePath(); g.fillStyle = col; g.fill(); }
g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 40; g.shadowOffsetY = 14; shield(1.0, '#111827'); g.shadowColor = 'transparent';
shield(0.94, '#eab308'); shield(0.86, '#374151');
// garis kuning diagonal
g.save(); shield(0.86, '#374151'); g.clip(); g.fillStyle = '#4b5563'; for (let x = -600; x < 1600; x += 140) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 60, 0); g.lineTo(x - 540, 1080); g.lineTo(x - 600, 1080); g.fill(); } g.restore();
// tikus
const cx = 540, cy = 560;
g.fillStyle = '#9ca3af'; g.beginPath(); g.ellipse(cx - 20, cy + 40, 175, 115, 0, 0, Math.PI * 2); g.fill();
g.beginPath(); g.arc(cx + 150, cy - 20, 90, 0, Math.PI * 2); g.fill();
g.fillStyle = '#f9a8d4'; g.beginPath(); g.arc(cx + 120, cy - 105, 42, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(cx + 205, cy - 90, 36, 0, Math.PI * 2); g.fill();
g.fillStyle = '#f472b6'; g.beginPath(); g.arc(cx + 238, cy - 5, 16, 0, Math.PI * 2); g.fill();
g.fillStyle = '#111'; g.beginPath(); g.arc(cx + 185, cy - 32, 14, 0, Math.PI * 2); g.fill();
g.fillStyle = '#fff'; g.beginPath(); g.arc(cx + 190, cy - 37, 5, 0, Math.PI * 2); g.fill();
g.strokeStyle = '#f9a8d4'; g.lineWidth = 18; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - 185, cy + 60); g.quadraticCurveTo(cx - 300, cy + 170, cx - 230, cy + 250); g.stroke();
// bola di kaki tikus
g.fillStyle = '#f8fafc'; g.beginPath(); g.arc(cx + 90, cy + 175, 62, 0, Math.PI * 2); g.fill();
g.fillStyle = '#111827'; [[0, 0], [-34, -30], [36, -26], [-30, 34], [34, 32]].forEach(([dx, dy], i) => { g.beginPath(); g.arc(cx + 90 + dx, cy + 175 + dy, i ? 12 : 18, 0, Math.PI * 2); g.fill(); });
// pita nama
g.fillStyle = '#eab308'; g.beginPath(); g.moveTo(150, 250); g.lineTo(930, 250); g.lineTo(900, 345); g.lineTo(180, 345); g.closePath(); g.fill();
g.fillStyle = '#111827'; g.font = '900 72px ' + F; g.textAlign = 'center'; g.fillText('YONOHA FC', 540, 323);
window.done = true;
</script></body></html>`;

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage();
  await p.setViewport({ width: 1080, height: 1080 });
  await p.setContent(html);
  await p.waitForFunction('window.done === true');
  const el = await p.$('#c');
  const f = path.join(OUT, 'foto-profil.png');
  await el.screenshot({ path: f });
  await b.close();
  console.log('Foto profil: ' + f);
})();
