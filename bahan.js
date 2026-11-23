// BAHAN — tarik komentar IG @ai_bareng_el, beri label dengan AI, hitung voting episode terakhir.
// Tulis cerita/bahan/day-NN.json (NN = day_terakhir + 1). Dipakai sebelum sutradara.js di pipeline harian.
// Env: META_IG_TOKEN, IG_USER_ID, OPENAI_API_KEY (flaz), OPENAI_BASE_URL, LLM_MODEL_LABEL (default gpt-4o-mini)
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const TOKEN = process.env.META_IG_TOKEN, IG = process.env.IG_USER_ID || '17841474398873049';
const KEY = process.env.OPENAI_API_KEY, BASE = (process.env.OPENAI_BASE_URL || 'https://ai.flaz.id/v1').replace(/\/+$/, '');
const MODEL = process.env.LLM_MODEL_LABEL || 'gpt-4o-mini', OWN = 'ai_bareng_el';
const G = 'https://graph.facebook.com/v21.0';
if (!TOKEN || !KEY) { console.error('Butuh META_IG_TOKEN dan OPENAI_API_KEY.'); process.exit(1); }
const STATUS = JSON.parse(fs.readFileSync(path.join(ROOT, 'cerita', 'status.json'), 'utf8'));
const DAY = STATUS.day_terakhir + 1;

async function graph(p, q) {
  const u = new URL(G + p); for (const [k, v] of Object.entries(q || {})) u.searchParams.set(k, v); u.searchParams.set('access_token', TOKEN);
  const r = await fetch(u); const j = await r.json(); if (j.error) throw new Error('Graph: ' + j.error.message); return j;
}

(async () => {
  const media = (await graph(`/${IG}/media`, { fields: 'id,caption,timestamp', limit: '12' })).data || [];
  const semua = [];
  for (const m of media) {
    const ep = ((m.caption || '').match(/DAY\s*(\d+)/i) || [])[1] || '';
    const c = await graph(`/${m.id}/comments`, { fields: 'id,text,username,timestamp,like_count', limit: '100' }).catch(() => ({ data: [] }));
    for (const k of c.data || []) if (k.username && k.username !== OWN) semua.push({ id: k.id, username: k.username, teks: k.text || '', likes: k.like_count || 0, episode: ep, media: m.id, waktu: k.timestamp });
  }
  // voting = komentar di postingan terbaru yang berisi huruf pilihan
  let hasil = null;
  if (STATUS.voting_berjalan && media[0]) {
    const opsi = (STATUS.voting_berjalan.opsi || []).map(o => String(o.huruf).toUpperCase());
    const suara = {}; opsi.forEach(h => suara[h] = 0); const sudah = new Set();
    for (const k of semua.filter(x => x.media === media[0].id)) {
      const m = String(k.teks).toUpperCase().match(/(?:^|[^A-Z])([A-C])(?:[^A-Z]|$)/);
      if (m && opsi.includes(m[1]) && !sudah.has(k.username)) { suara[m[1]]++; sudah.add(k.username); }
    }
    const total = Object.values(suara).reduce((a, b) => a + b, 0);
    const menang = total ? Object.entries(suara).sort((a, b) => b[1] - a[1])[0][0] : null;
    hasil = { pertanyaan: STATUS.voting_berjalan.pertanyaan, suara, total, pemenang: menang, catatan: total ? '' : 'belum ada suara — Sutradara boleh memilih sendiri lalu bilang "suara masih sedikit"' };
  }
  // label AI (yang sudah jadi pemain dibuang)
  const dalamSkuad = new Set(STATUS.skuad.map(p => String(p.user).toLowerCase()));
  const kandidat = semua.filter(k => !dalamSkuad.has(k.username.toLowerCase())).slice(0, 120);
  let label = [];
  if (kandidat.length) {
    const daftar = kandidat.map(k => `${k.id} | @${k.username} | ${k.teks.replace(/\s+/g, ' ').slice(0, 160)}`).join('\n');
    const r = await fetch(BASE + '/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, temperature: 0.1, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: 'Kamu memberi label komentar penonton serial sepak bola fiktif. Jawab JSON {"hasil":[...]} saja.' },
        { role: 'user', content: `Untuk tiap komentar keluarkan {"id","label":"DAFTAR|ULTRAS|VOTE|USUL|SARAN|PERTANYAAN|DUKUNGAN|SPAM|LAIN","nama","posisi":"GK|CB|LB|RB|DMF|CMF|AMF|LWF|RWF|CF|kosong","nomor","sebut_pemain_asli":true/false}. "nama" HANYA kalau ditulis di komentar (mis. "Daftar - Nadzar"), selain itu "kosong" — jangan menebak dari username. DAFTAR = ingin jadi pemain. ULTRAS = ingin jadi suporter/ultras/fans/penonton tribun Yonoha. VOTE = cuma memilih huruf A/B/C. USUL = usul desain/nama/ide. Bek kiri=LB, bek kanan=RB, bek tengah=CB, sayap kiri=LWF, sayap kanan=RWF, gelandang tengah=CMF, gelandang serang=AMF, penyerang=CF, kiper=GK.\n\n${daftar}` }] }) });
    const j = await r.json(); const txt = String(j.choices?.[0]?.message?.content || '{}');
    try { label = (JSON.parse(txt.match(/\{[\s\S]*\}/)[0]).hasil) || []; } catch (e) { label = []; }
  }
  const by = Object.fromEntries(label.map(l => [String(l.id), l]));
  const komentar = kandidat.map(k => { const l = by[k.id] || {}; return { username: k.username, teks: k.teks, episode: k.episode, likes: k.likes, label: String(l.label || 'LAIN').toUpperCase(), nama: l.nama && l.nama !== 'kosong' ? l.nama : k.username, posisi: l.posisi && l.posisi !== 'kosong' ? l.posisi : '', nomor: l.nomor && l.nomor !== 'kosong' ? String(l.nomor) : '', sebut_pemain_asli: l.sebut_pemain_asli ? 'ya' : '' }; });
  const out = path.join(ROOT, 'cerita', 'bahan', `day-${String(DAY).padStart(2, '0')}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ dibuat: new Date().toISOString(), day: DAY, hasil_voting: hasil, komentar }, null, 2));
  const n = l => komentar.filter(k => k.label === l).length;
  console.log(`Bahan DAY ${DAY}: ${komentar.length} komentar (DAFTAR ${n('DAFTAR')}, ULTRAS ${n('ULTRAS')}, VOTE ${n('VOTE')}, USUL ${n('USUL')}). Voting: ${hasil ? JSON.stringify(hasil.suara) + ' -> ' + hasil.pemenang : '-'}`);
  console.log('BAHAN=' + path.relative(ROOT, out).replace(/\\/g, '/'));
})().catch(e => { console.error('GAGAL: ' + e.message); process.exit(1); });
