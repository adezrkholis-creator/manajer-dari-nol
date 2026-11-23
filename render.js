// Render episode "Manajer dari Nol" → MP4 9:16
// Pakai:  node render.js episodes/episode-01.json            (penuh 1080x1920, 30 fps)
//         node render.js episodes/episode-01.json --preview  (540x960, 15 fps, cepat)
//         node render.js episodes/episode-01.json --still 2,10,30  (PNG beberapa detik saja)
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const puppeteer = require('puppeteer-core');
const FFMPEG = require('ffmpeg-static');

const ROOT = __dirname;
const args = process.argv.slice(2);
const epPath = path.resolve(ROOT, args.find(a => a.endsWith('.json')) || 'episodes/episode-01.json');
const PREVIEW = args.includes('--preview');
const stillArg = args[args.indexOf('--still') + 1];
const STILLS = args.includes('--still') ? stillArg.split(',').map(Number) : null;

const EP = JSON.parse(fs.readFileSync(epPath, 'utf8'));
const NAME = path.basename(epPath, '.json');
const OUT = path.join(ROOT, 'out', NAME);
fs.mkdirSync(path.join(OUT, 'audio'), { recursive: true });
const FPS = PREVIEW ? 15 : (EP.fps || 30);
const SIZE = PREVIEW ? [540, 960] : (EP.ukuran || [1080, 1920]);

const PIPER = path.join(ROOT, 'tools', 'piper', process.platform === 'win32' ? 'piper.exe' : 'piper');
const VOICE = path.join(ROOT, 'tools', 'voices', 'id_ID-news_tts-medium.onnx');
const CHROME = process.env.CHROME_PATH || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'
].find(p => fs.existsSync(p));

function run(cmd, a, input) {
  const r = spawnSync(cmd, a, { input, encoding: input ? 'utf8' : undefined, maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(cmd + ' gagal: ' + String(r.stderr || '').slice(-800));
  return r;
}
function wavDuration(file) {
  const b = fs.readFileSync(file);
  const byteRate = b.readUInt32LE(28);
  let i = 12;
  while (i < b.length - 8) {
    const id = b.toString('ascii', i, i + 4), size = b.readUInt32LE(i + 4);
    if (id === 'data') return size / byteRate;
    i += 8 + size;
  }
  throw new Error('WAV tanpa data: ' + file);
}

// ---------- 1. Suara: edge-tts (bila ada "voice") atau Piper ----------
const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
function makeVoices() {
  const lines = [];
  EP.adegan.forEach((sc, si) => sc.baris.forEach((b, bi) => lines.push({ si, bi, adegan: sc.id, ...b })));
  lines.forEach((l, n) => {
    const fin = path.join(OUT, 'audio', `line-${n}.wav`), meta = fin + '.json';
    const v = (EP.suara && EP.suara[l.oleh]) || { lengthScale: 1, pitch: 1 };
    const text = l.tts || l.teks, key = JSON.stringify({ v, text });
    const cached = fs.existsSync(fin) && fs.existsSync(meta) && fs.readFileSync(meta, 'utf8') === key;
    if (!cached || process.argv.includes('--suara-ulang')) {
      if (v.voice) {
        const raw = path.join(OUT, 'audio', `raw-${n}.mp3`);
        run(PYTHON, ['-m', 'edge_tts', '--voice', v.voice, `--rate=${v.rate || '+0%'}`, `--pitch=${v.pitch || '+0Hz'}`, '--text', text, '--write-media', raw]);
        run(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw, '-af', 'aresample=44100,silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,highpass=f=70,acompressor=threshold=0.12:ratio=2.5:attack=8:release=120,loudnorm=I=-15:TP=-1.5', '-ac', '1', fin]);
      } else {
        const raw = path.join(OUT, 'audio', `raw-${n}.wav`);
        run(PIPER, ['--model', VOICE, '--length_scale', String(v.lengthScale || 1), '--sentence_silence', '0.25', '--output_file', raw], text);
        const p = v.pitch || 1;
        const filt = p === 1 ? 'aresample=44100,loudnorm=I=-16:TP=-1.5' :
          `asetrate=22050*${p},aresample=44100,atempo=${(1 / p).toFixed(4)},loudnorm=I=-16:TP=-1.5`;
        run(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw, '-af', filt, '-ac', '1', fin]);
      }
      fs.writeFileSync(meta, key);
    }
    l.file = fin; l.durasi = wavDuration(fin);
  });
  return lines;
}

// ---------- 2. Timeline ----------
function buildTimeline(lines) {
  const TL = { adegan: [], baris: [], durasi: 0 };
  let t = 0;
  EP.adegan.forEach((sc, si) => {
    const mine = lines.filter(l => l.si === si);
    const lead = sc.lead != null ? sc.lead : (si === 0 ? 0.5 : 0.3), gap = 0.25, tail = 0.45;
    let c = t + lead;
    mine.forEach(l => { TL.baris.push({ adegan: sc.id, oleh: l.oleh, teks: l.teks, mulai: c, durasi: l.durasi, selesai: c + l.durasi, file: l.file }); c += l.durasi + gap; });
    const end = Math.max(t + (sc.min || 3), c - gap + tail);
    TL.adegan.push({ id: sc.id, mulai: t, selesai: end });
    t = end;
  });
  TL.durasi = t;
  return TL;
}

// ---------- 3a. Musik & efek suara (disintesis sendiri, bebas hak cipta) ----------
const SR = 44100;
function writeWav(file, buf) {
  const b = Buffer.alloc(44 + buf.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + buf.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(buf.length * 2, 40);
  for (let i = 0; i < buf.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i])) * 32767), 44 + i * 2);
  fs.writeFileSync(file, b);
}
function makeScore(TL) {
  const N = Math.ceil(TL.durasi * SR), mus = new Float32Array(N), fx = new Float32Array(N);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const sc = id => TL.adegan.find(s => s.id === id);
  const lines = id => TL.baris.filter(b => b.adegan === id);
  const add = (buf, start, dur, fn) => { const s0 = Math.max(0, Math.floor(start * SR)), n = Math.floor(dur * SR); for (let i = 0; i < n && s0 + i < N; i++) buf[s0 + i] += fn(i / SR); };
  const env = (t, a, d, r) => Math.min(1, t / a) * (t > d - r ? Math.max(0, (d - t) / r) : 1);
  // --- musik: pad akor (tegang di malam hari, hangat mulai subuh) ---
  const CH = {
    Am: [110, 220, 261.63, 329.63], F: [87.31, 174.61, 220, 261.63], Dm: [73.42, 174.61, 220, 293.66], E: [82.41, 164.81, 207.65, 246.94],
    C: [130.81, 196, 261.63, 329.63], G: [98, 196, 246.94, 293.66]
  };
  const hopeSc = sc(EP.musikHangat || 'tribun');
  const hope = EP.musikHangat === 'semua' ? 0 : (hopeSc ? hopeSc.mulai : TL.durasi);
  const prog = [];
  for (let t = 0, i = 0; t < hope; t += 4, i++) prog.push({ s: t, e: Math.min(hope, t + 4), c: ['Am', 'F', 'Dm', 'E'][i % 4], dark: true });
  for (let t = hope, i = 0; t < TL.durasi; t += 3, i++) prog.push({ s: t, e: Math.min(TL.durasi, t + 3), c: ['C', 'G', 'Am', 'F'][i % 4], dark: false });
  prog.forEach(p => {
    CH[p.c].forEach((f, j) => {
      const amp = (j === 0 ? 0.05 : 0.03) * (p.dark ? 0.9 : 1);
      add(mus, p.s, p.e - p.s + 0.9, t => {
        const e = Math.min(1, t / 0.9) * Math.max(0, Math.min(1, (p.e - p.s + 0.9 - t) / 0.9));
        const ph = 2 * Math.PI * f * (p.s + t);
        return amp * e * (Math.sin(ph) * 0.7 + Math.sin(ph * 1.004) * 0.5 + Math.sin(ph * 2) * 0.12) * (0.85 + 0.15 * Math.sin(2 * Math.PI * 0.25 * (p.s + t) + j));
      });
    });
    if (!p.dark) { // arpeggio piano lembut
      const notes = CH[p.c].slice(1).concat([CH[p.c][1] * 2]);
      for (let k = 0; k * 0.375 < p.e - p.s - 0.05; k++) {
        const f = notes[k % notes.length] * 2;
        add(mus, p.s + k * 0.375, 1.4, t => 0.045 * Math.min(1, t / 0.005) * (Math.sin(2 * Math.PI * f * t) * Math.exp(-3 * t) + 0.25 * Math.sin(4 * Math.PI * f * t) * Math.exp(-6 * t)));
      }
    }
  });
  // lowpass musik supaya hangat
  { let y = 0; for (let i = 0; i < N; i++) { y += 0.18 * (mus[i] - y); mus[i] = y * 1.6; } }
  // --- efek ---
  const noiseBurst = (buf, start, dur, amp, lp, hp, shape) => {
    let y = 0, z = 0, prev = 0;
    add(buf, start, dur, t => { const w = rnd() * 2 - 1; y += lp * (w - y); const h = y - z; z += hp * (y - z); prev = h; return amp * (shape ? shape(t) : env(t, 0.01, dur, dur * 0.6)) * h; });
  };
  const buka = sc('buka'), gerb = sc('gerbang');
  if (buka) {
    const rainEnd = gerb ? gerb.selesai : buka.selesai;
    noiseBurst(fx, 0, rainEnd, 0.16, 0.55, 0.08, t => Math.min(1, t / 1.2) * Math.min(1, (rainEnd - t) / 0.5) * (0.85 + 0.15 * Math.sin(t * 1.3)));
    noiseBurst(fx, 0.4, 3.2, 0.9, 0.012, 0.0, t => Math.min(1, t / 0.6) * Math.exp(-1.2 * t)); // guntur jauh
    add(fx, buka.mulai, 7, t => { const k = t < 2.2 ? 1 : Math.max(0, 1 - (t - 2.2) / 4.5); return 0.09 * k * (Math.sin(2 * Math.PI * 46 * t) + 0.5 * Math.sin(2 * Math.PI * 92 * t + Math.sin(t * 9))); }); // mesin bus
    noiseBurst(fx, buka.mulai + 0.9, 0.8, 0.22, 0.9, 0.5, t => Math.exp(-3 * t)); // rem angin bus
    add(fx, buka.mulai + 2.3, 1.0, t => { let s = 0; return 0.06 * Math.sin(Math.PI * t) * (rnd() * 2 - 1) * (0.3 + t); }); // whoosh judul
  }
  if (gerb) {
    add(fx, gerb.mulai + 0.5, 1.2, t => { const f = 330 + 220 * t + 20 * Math.sin(t * 110); return 0.05 * env(t, 0.05, 1.2, 0.4) * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(4 * Math.PI * f * t)); }); // derit gerbang
  }
  const kl = lines('kantor');
  if (kl[0]) for (let k = 0; k < 9; k++) { const f = 2500 + rnd() * 4000, at = kl[0].mulai + 0.8 + rnd() * 0.45; add(fx, at, 0.4, t => 0.05 * Math.sin(2 * Math.PI * f * t) * Math.exp(-22 * t)); } // gemerincing kunci
  if (kl[1]) {
    const at = kl[1].selesai - 0.4;
    add(fx, at, 2.2, t => 0.5 * Math.sin(2 * Math.PI * (55 - 10 * t) * t) * Math.exp(-2.2 * t)); // dentum
    [233.08, 246.94, 349.23].forEach(f => add(mus, at, 2.2, t => 0.03 * env(t, 0.05, 2.2, 1.2) * Math.sin(2 * Math.PI * f * t)));
  }
  const ru = sc('ruang');
  if (ru) for (let i = 0; i < 9; i++) noiseBurst(fx, ru.mulai + 0.7 + i * 0.2, 0.16, 0.18, 0.6, 0.35); // coretan spidol
  const su = sc('surat');
  if (su) {
    for (let i = 0; i < 6; i++) noiseBurst(fx, su.mulai + 0.25 + i * 0.09, 0.12, 0.14, 0.8, 0.4); // kertas
    add(fx, su.mulai + 2.4, 0.5, t => 0.45 * Math.sin(2 * Math.PI * 85 * t) * Math.exp(-14 * t)); // stempel
    noiseBurst(fx, su.mulai + 2.4, 0.06, 0.3, 0.7, 0.2);
  }
  const tr = lines('tribun');
  if (tr[0]) for (let k = 0; k < 3; k++) add(fx, tr[0].selesai - 0.2 + k * 0.13, 0.09, t => 0.07 * Math.sin(2 * Math.PI * (2800 + 9000 * t) * t) * env(t, 0.01, 0.09, 0.04)); // cicit tikus
  const tb = sc('tribun'), ca = sc('calon') || sc('rekrut');
  if (tb) { const end = ca ? ca.selesai : tb.selesai; for (let t0 = tb.mulai + 0.6; t0 < end - 0.5; t0 += 1.1 + rnd() * 1.4) { const f0 = 3400 + rnd() * 1200; add(fx, t0, 0.12, t => 0.02 * Math.sin(2 * Math.PI * (f0 + 2500 * t) * t) * env(t, 0.01, 0.12, 0.05)); } } // burung pagi
  // --- lagu latar orisinal (ceria) untuk montase ---
  if (EP.lagu && sc(EP.lagu.mulai)) {
    const S0 = sc(EP.lagu.mulai).mulai, E = sc(EP.lagu.selesai || EP.lagu.mulai).selesai;
    const beat = 60 / (EP.lagu.bpm || 124), mf = m => 440 * Math.pow(2, (m - 69) / 12);
    // matikan pad di bagian lagu (crossfade 0.3 dtk)
    for (let i = Math.floor((S0 - 0.3) * SR); i < Math.min(N, Math.ceil((E + 0.3) * SR)); i++) {
      if (i < 0) continue; const t = i / SR; const g = t < S0 ? (S0 - t) / 0.3 : t > E ? (t - E) / 0.3 : 0; mus[i] *= Math.min(1, g);
    }
    const lg = (start, dur, fn) => { if (start >= E) return; add(mus, start, Math.min(dur, E - start + 0.02), t => fn(t) * Math.min(1, t / 0.004)); };
    const BARS = [[48, [60, 64, 67]], [43, [55, 59, 62]], [45, [57, 60, 64]], [41, [53, 57, 60]]]; // C G Am F
    const MEL = [
      [[0, 76, .5], [.5, 79, .5], [1, 81, 1], [2, 79, .5], [2.5, 76, .5], [3, 74, 1], [4, 74, .5], [4.5, 76, .5], [5, 79, 1], [6, 74, .5], [6.5, 71, .5], [7, 74, 1]],
      [[0, 72, .5], [.5, 76, .5], [1, 81, .75], [1.75, 79, .25], [2, 76, 1], [3, 72, 1], [4, 69, .5], [4.5, 72, .5], [5, 77, 1], [6, 76, .5], [6.5, 74, .5], [7, 72, 1.5]]
    ];
    const nBars = Math.ceil((E - S0) / (4 * beat));
    for (let b = 0; b < nBars; b++) {
      const t0 = S0 + b * 4 * beat, [root, tri] = BARS[b % 4];
      for (let e = 0; e < 8; e++) { // bass 1/8 memantul
        const m = root + [0, 0, 12, 0, 0, 7, 12, 7][e], f = mf(m - 12), at = t0 + e * beat / 2;
        lg(at, beat * 0.48, t => 0.11 * Math.exp(-5 * t) * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t)));
        if (e % 2 === 1) tri.forEach(n => { const fq = mf(n); lg(at, 0.16, t => 0.022 * Math.exp(-16 * t) * (Math.sin(2 * Math.PI * fq * t) + 0.5 * Math.sin(4 * Math.PI * fq * t))); }); // stab chord
      }
      for (let q = 0; q < 4; q++) { // drum
        const at = t0 + q * beat;
        lg(at, 0.3, t => 0.2 * Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-35 * t)) * t) * Math.exp(-10 * t));
        if (q % 2 === 1) { let y = 0; lg(at, 0.18, t => { const w = rnd() * 2 - 1; y += 0.5 * (w - y); return 0.09 * Math.exp(-18 * t) * (w - y * 0.6); }); }
        [0, 0.5].forEach(h => lg(at + h * beat, 0.04, t => 0.025 * Math.exp(-80 * t) * (rnd() * 2 - 1)));
      }
      if (b >= 1) { // melodi mulai bar ke-2
        const ph = MEL[Math.floor((b - 1) / 2) % 2], half = (b - 1) % 2;
        ph.filter(n => Math.floor(n[0] / 4) === half).forEach(([o, m, d]) => {
          const f = mf(m), at = t0 + (o - half * 4) * beat, dur = d * beat;
          lg(at, dur + 0.08, t => { const v = 1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t); const ph2 = 2 * Math.PI * f * v * t;
            return 0.05 * Math.min(1, t / 0.012) * Math.max(0, Math.min(1, (dur + 0.08 - t) / 0.08)) * Math.exp(-1.2 * t) * (Math.sin(ph2) + Math.sin(3 * ph2) / 3 + Math.sin(5 * ph2) / 6); });
        });
      }
    }
    // goresan piringan saat lagu berhenti
    { let y = 0; add(fx, E - 0.05, 0.45, t => { const w = rnd() * 2 - 1; y += (0.05 + 0.6 * (1 - t / 0.45)) * (w - y); return 0.3 * Math.exp(-3 * t) * y + 0.08 * Math.sin(2 * Math.PI * (900 - 1600 * t) * t) * Math.exp(-6 * t); }); }
    // nada tegang setelahnya
    const after = TL.adegan.find(s => s.mulai >= E - 0.01);
    if (after) [55, 58.27, 82.41].forEach(f => add(mus, after.mulai + 0.3, after.selesai - after.mulai, t => 0.03 * Math.min(1, t / 1.2) * Math.sin(2 * Math.PI * f * t)));
  }
  // --- DAY 2+: seleksi pemain ---
  const thump = (at, amp) => { add(fx, at, 0.25, t => amp * Math.sin(2 * Math.PI * (130 - 180 * t) * t) * Math.exp(-18 * t)); noiseBurst(fx, at, 0.05, amp * 0.5, 0.7, 0.3); };
  const whistle = at => add(fx, at, 0.4, t => 0.08 * Math.sin(2 * Math.PI * (2900 + 60 * Math.sin(t * 70)) * t) * env(t, 0.01, 0.4, 0.08));
  (EP.ketukan || []).forEach(id => { const s = sc(id); if (!s) return;
    for (let t0 = s.mulai + 0.3; t0 < s.selesai - 0.2; t0 += 0.5) { add(fx, t0, 0.3, t => 0.14 * Math.sin(2 * Math.PI * (48 + 70 * Math.exp(-30 * t)) * t) * Math.exp(-9 * t)); noiseBurst(fx, t0 + 0.25, 0.05, 0.05, 0.95, 0.5); } });
  EP.adegan.filter(a => a.pemain).forEach(a => { const s = sc(a.id); if (!s) return; if (!a.sfx) whistle(s.mulai + 0.25); const l = lines(a.id); if (l[1]) thump(l[1].selesai + 0.1, 0.55); });
  EP.adegan.filter(a => a.sfx).forEach(a => { const s = sc(a.id); if (!s) return; a.sfx.forEach(([dt, jenis]) => { const at = s.mulai + dt;
    if (jenis === 'peluit') whistle(at);
    else if (jenis === 'tendang') thump(at, 0.5);
    else if (jenis === 'tangkap') { thump(at, 0.45); noiseBurst(fx, at, 0.12, 0.25, 0.5, 0.2); }
    else if (jenis === 'jaring') noiseBurst(fx, at, 0.6, 0.22, 0.6, 0.3, t => Math.exp(-5 * t));
    else if (jenis === 'gores') { let y = 0; add(fx, at - 0.05, 0.45, t => { const w = rnd() * 2 - 1; y += (0.05 + 0.6 * (1 - t / 0.45)) * (w - y); return 0.3 * Math.exp(-3 * t) * y + 0.08 * Math.sin(2 * Math.PI * (900 - 1600 * t) * t) * Math.exp(-6 * t); }); }
    else if (jenis === 'kertas') for (let i = 0; i < 5; i++) noiseBurst(fx, at + i * 0.08, 0.12, 0.14, 0.8, 0.4);
    else if (jenis === 'ding') [0, 0.12, 0.24].forEach((d, i) => add(fx, at + d, 0.5, t => 0.06 * Math.sin(2 * Math.PI * [784, 988, 1175][i] * t) * Math.exp(-6 * t)));
  }); });
  const tri = sc('tes_rizky'); if (tri) for (let t0 = tri.mulai + 0.6; t0 < tri.mulai + 5; t0 += 0.57) thump(t0, 0.1);
  const tmi = sc('tes_miftakh'); if (tmi) for (let k = 0; tmi.mulai + 1.5 + k * 2.6 < tmi.selesai; k++) thump(tmi.mulai + 1.5 + k * 2.6, 0.35);
  const tda = sc('tes_dapeng'); if (tda) for (let k = 0; tda.mulai + 1.5 + k * 3.0 < tda.selesai; k++) thump(tda.mulai + 1.5 + k * 3.0, 0.4);
  const kmn = sc('komen'); if (kmn) for (let i = 0; i < 3; i++) add(fx, kmn.mulai + 1.1 + i * 0.8, 0.4, t => 0.06 * Math.sin(2 * Math.PI * 1320 * t) * Math.exp(-12 * t) + 0.04 * Math.sin(2 * Math.PI * 1760 * t) * Math.exp(-14 * t));
  const pg = sc('pagi'); if (pg) { const end = kmn ? kmn.selesai : pg.selesai; for (let t0 = pg.mulai + 0.6; t0 < end - 0.5; t0 += 1.1 + rnd() * 1.4) { const f0 = 3400 + rnd() * 1200; add(fx, t0, 0.12, t => 0.02 * Math.sin(2 * Math.PI * (f0 + 2500 * t) * t) * env(t, 0.01, 0.12, 0.05)); } }
  const lls = sc('lolos'); if (lls) add(fx, lls.mulai + 0.6, 0.5, t => 0.05 * (Math.sin(2 * Math.PI * 523 * t) + Math.sin(2 * Math.PI * 659 * t) + Math.sin(2 * Math.PI * 784 * t)) * Math.exp(-5 * t));
  const kp = lines('kiper'); if (kp[1]) [0, 0.45].forEach((d, i) => add(fx, kp[1].mulai - 0.1 + d, 0.6, t => 0.07 * env(t, 0.02, 0.6, 0.25) * Math.sin(2 * Math.PI * ((i ? 185 : 220) - 25 * t) * t + 2 * Math.sin(2 * Math.PI * 6 * t))));
  const pe = sc('penutup') || TL.adegan[TL.adegan.length - 1];
  add(fx, pe.mulai, 0.22, t => 0.12 * Math.sin(2 * Math.PI * 2900 * t));
  add(fx, pe.mulai + 0.32, 0.5, t => 0.12 * Math.sin(2 * Math.PI * 2900 * t) * Math.min(1, (0.5 - t) / 0.1));
  const mf = path.join(OUT, 'audio', 'musik.wav'), ff = path.join(OUT, 'audio', 'efek.wav');
  writeWav(mf, mus); writeWav(ff, fx);
  return { musik: mf, efek: ff };
}

// ---------- 3b. Audio campuran ----------
function mixAudio(TL) {
  const outWav = path.join(OUT, 'audio', 'mix.wav');
  const score = makeScore(TL);
  const a = ['-y', '-loglevel', 'error'];
  TL.baris.forEach(b => a.push('-i', b.file));
  const n = TL.baris.length;
  a.push('-i', score.musik, '-i', score.efek);
  const parts = TL.baris.map((b, i) => `[${i}]adelay=${Math.round(b.mulai * 1000)}:all=1[v${i}]`);
  const vo = TL.baris.map((b, i) => `[v${i}]`).join('');
  const f = parts.join(';') +
    `;${vo}amix=inputs=${n}:normalize=0,apad=whole_dur=${TL.durasi.toFixed(2)}[vo]` +
    `;[vo]asplit=2[vo1][vo2]` +
    `;[${n}]volume=0.9[mus];[mus][vo2]sidechaincompress=threshold=0.015:ratio=6:attack=40:release=600[duck]` +
    `;[vo1][duck][${n + 1}]amix=inputs=3:normalize=0,atrim=0:${TL.durasi.toFixed(2)},afade=t=out:st=${(TL.durasi - 0.8).toFixed(2)}:d=0.8,alimiter=limit=0.95[out]`;
  run(FFMPEG, a.concat(['-filter_complex', f, '-map', '[out]', '-ac', '2', '-ar', '44100', outWav]));
  return outWav;
}

// ---------- 4. Server lokal untuk scene.html ----------
function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
  const srv = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

// ---------- 5. Rekam frame & encode ----------
(async () => {
  const t0 = Date.now();
  console.log(`Episode: ${EP.judul} | ${SIZE[0]}x${SIZE[1]} @ ${FPS} fps${PREVIEW ? ' (preview)' : ''}`);
  const lines = makeVoices();
  const TL = buildTimeline(lines);
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(TL, null, 2));
  console.log(`Suara siap: ${lines.length} baris, durasi video ${TL.durasi.toFixed(1)} dtk`);
  const audio = STILLS && !args.includes('--audio') ? null : mixAudio(TL);
  if (args.includes('--audio-saja')) { console.log('Audio: ' + audio); return; }

  const srv = await serve();
  const port = srv.address().port;
  // GPU bawaan (±15x lebih cepat); --cpu memaksa SwiftShader. Kalau GPU tidak terdeteksi, otomatis pindah ke CPU.
  const gpuArgs = ['--use-angle=' + (process.platform === 'win32' ? 'd3d11' : 'default'), '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox'];
  const cpuArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];
  let browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: args.includes('--cpu') ? cpuArgs : gpuArgs });
  const gl = await (await browser.newPage()).evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const d = c && c.getExtension('WEBGL_debug_renderer_info'); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : ''; });
  if (!args.includes('--cpu') && (!gl || /swiftshader|llvmpipe/i.test(gl))) { await browser.close(); browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: cpuArgs }); console.log('Render: CPU (GPU tidak tersedia)'); }
  else console.log('Render: ' + (gl || 'CPU'));
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('Halaman error:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('Console:', m.text()); });
  await page.setViewport({ width: SIZE[0], height: SIZE[1], deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/scene.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.ready === true', { timeout: 60000 });
  await page.evaluate((ep, tl, size) => window.setup(ep, tl, size), EP, TL, SIZE);

  if (STILLS) {
    for (const s of STILLS) {
      const data = await page.evaluate(t => window.renderAt(t, 0.92), s);
      const f = path.join(OUT, `still-${s}.jpg`);
      fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64'));
      console.log('Still:', f);
    }
  } else {
    const mp4 = path.join(OUT, `${NAME}${PREVIEW ? '-preview' : ''}.mp4`);
    const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-i', audio, '-c:v', 'libx264', '-preset', PREVIEW ? 'veryfast' : 'medium', '-crf', PREVIEW ? '26' : '19', '-pix_fmt', 'yuv420p',
      '-r', String(FPS), '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', mp4], { stdio: ['pipe', 'inherit', 'inherit'] });
    const total = Math.ceil(TL.durasi * FPS);
    for (let i = 0; i < total; i++) {
      const data = await page.evaluate(t => window.renderAt(t, 0.9), i / FPS);
      const buf = Buffer.from(data.split(',')[1], 'base64');
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (i % (FPS * 5) === 0) process.stdout.write(`\rFrame ${i}/${total}`);
    }
    ff.stdin.end();
    await new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg keluar ' + c))));
    console.log(`\nSelesai: ${mp4}`);
  }
  await browser.close(); srv.close();
  console.log(`Waktu render: ${((Date.now() - t0) / 1000).toFixed(0)} dtk`);
})().catch(e => { console.error(e); process.exit(1); });
