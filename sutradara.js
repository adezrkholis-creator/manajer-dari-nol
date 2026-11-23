// SUTRADARA AI — membuat rencana episode berikutnya dari peta cerita + status + komentar penonton.
// Pakai:  node sutradara.js --bahan cerita/bahan/day-06.json            (tulis cerita/rencana/day-06.json)
//         node sutradara.js --bahan ... --terapkan                       (juga perbarui cerita/status.json)
// Env:    OPENAI_API_KEY (key flaz.id), OPENAI_BASE_URL (default https://ai.flaz.id/v1), LLM_MODEL (default gpt-4o)
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const args = process.argv.slice(2);
const arg = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const baca = f => JSON.parse(fs.readFileSync(path.resolve(ROOT, f), 'utf8'));

// .env lokal (opsional)
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const KEY = process.env.OPENAI_API_KEY;
const BASE = (process.env.OPENAI_BASE_URL || 'https://ai.flaz.id/v1').replace(/\/+$/, '');
const MODEL = process.env.LLM_MODEL || 'gpt-4o';
if (!KEY) { console.error('OPENAI_API_KEY belum ada (env / video/.env).'); process.exit(1); }

const BIBLE = baca('cerita/bible.json');
const STATUS = baca('cerita/status.json');
const BAHAN = arg('--bahan') ? baca(arg('--bahan')) : { komentar: [] };
const DAY = STATUS.day_terakhir + 1;

// nama pemain/klub asli yang sering muncul di komentar -> tidak boleh tampil (pemain lawan pun fiktif)
const LARANGAN = ['foden', 'haye', 'messi', 'ronaldo', 'mbappe', 'neymar', 'haaland', 'salah', 'bellingham', 'vinicius',
  'yamal', 'kane', 'modric', 'lewandowski', 'de bruyne', 'saka', 'witan', 'egy', 'asnawi', 'pratama arhan', 'marselino',
  'rafael struick', 'ragnar', 'jay idzes', 'maarten paes', 'calvin verdonk', 'shin tae', 'kluivert'];

const JENIS = {
  cold_open: 'Adegan pembuka dari momen paling seru/dramatis. Wajib "teks_layar" (2 baris, maks 5 kata/baris) + "narasi" atau "dialog".',
  komentar: 'Tampilkan komentar asli penonton di layar. "users": daftar username (maks 4) dari bahan.',
  seleksi: 'Tes satu pemain dari komentar. "pemain": username, "tes": lari|sundul|umpan|tembak|kiper, "stat": 3 pasang [label, angka 50-95], "cap": LOLOS|CADANGAN|UTAMA.',
  ngobrol: 'Percakapan. "lokasi": lapangan|kantor|ruang_ganti|tribun|lapangan_rival, "dialog": [{oleh: jack|waskito|darman, teks}].',
  info: 'Kartu info di layar. "judul", "isi": maks 4 pasang [label, nilai], "warna": merah|hijau|ungu.',
  papan_skuad: 'Papan skuad terbaru (otomatis dari status + pemain_lolos) dengan slot KOSONG dan "KAMU?".',
  jersey: 'Pamer 3 desain jersey. "opsi": [{huruf A/B/C, nama, utama #hex, aksen #hex, celana #hex, pola: polos|garis|setengah|selempang}]. Desain original.',
  latihan: 'Montase latihan tim. "aktivitas": pemanasan|umpan|tembak|gim.',
  pertandingan: 'Potongan laga. "lawan", "momen": [{menit, kejadian: gol|penyelamatan|kartu|peluang, tim: yonoha|lawan, pemain}], "skor_akhir" atau "menggantung": true.',
  klasemen: 'Papan klasemen divisi. "baris": [[klub, main, poin]] maks 6.',
  voting: 'Kartu voting. "pertanyaan" (maks 8 kata), "opsi": 2-3 [{huruf, teks maks 4 kata}]. Penonton komen hurufnya.',
  bersambung: 'Penutup menggantung. "teaser": kalimat cliffhanger maks 10 kata, "narasi".'
};

const system = `Kamu SUTRADARA serial video vertikal "${BIBLE.judul_serial}". Tugasmu menulis RENCANA episode DAY ${DAY} yang nyambung dengan cerita sebelumnya, bergerak menuju target babak, memakai penonton asli dari komentar sebagai pemain, dan membuat penonton penasaran sampai episode berikutnya.
Nada: ${BIBLE.nada}
Aturan dunia:
- ${BIBLE.aturan_dunia.join('\n- ')}
- ${BIBLE.aturan_seragam || ''}
Jawab HANYA JSON valid sesuai format yang diminta, bahasa Indonesia santai.`;

function prompt(err) {
  const babak = BIBLE.peta_cerita.find(b => b.babak === STATUS.babak) || BIBLE.peta_cerita[0];
  const kom = (BAHAN.komentar || []).filter(k => k.username).map(k =>
    `@${k.username} [${k.label}${k.posisi ? ' ' + k.posisi : ''}${k.nomor && k.nomor !== 'kosong' ? ' no' + k.nomor : ''}${k.sebut_pemain_asli === 'ya' ? ' SEBUT-PEMAIN-ASLI' : ''}${k.status_seleksi ? ' ' + k.status_seleksi : ''}] nama:${k.nama || '-'} | "${String(k.teks).slice(0, 120)}"`).join('\n');
  const vote = BAHAN.hasil_voting ? JSON.stringify(BAHAN.hasil_voting) : 'tidak ada';
  return `STATUS SEKARANG (setelah DAY ${STATUS.day_terakhir}):
${JSON.stringify({ babak: babak.nama, target_babak: babak.target, divisi: STATUS.divisi, kas: STATUS.kas, laga_berikutnya: STATUS.laga_berikutnya, skuad: STATUS.skuad, slot_kosong: STATUS.slot_kosong, seragam: STATUS.seragam, benang_terbuka: STATUS.benang_terbuka, rencana_dekat: STATUS.rencana_dekat, voting_berjalan: STATUS.voting_berjalan }, null, 1)}
Riwayat: ${STATUS.riwayat.join(' | ')}
Hasil voting episode lalu: ${vote}

KOMENTAR PENONTON (bahan):
${kom || '(belum ada komentar baru)'}

JENIS BEAT yang tersedia (hanya ini):
${Object.entries(JENIS).map(([k, v]) => '- ' + k + ': ' + v).join('\n')}

KELUARKAN JSON:
{
 "day": ${DAY},
 "judul": "maks 5 kata",
 "ringkas": "1 kalimat isi episode",
 "jawab_sebelumnya": "bagaimana episode ini menjawab cliffhanger/voting sebelumnya",
 "pemain_lolos": [{"nama": "...", "user": "username tanpa @", "posisi": "kode posisi dari slot_kosong", "nomor": "", "alasan": "..."}],
 "beat": [ { "jenis": "...", "narasi": "kalimat Jack (narator) maks 18 kata", ...field sesuai jenis } ],
 "voting_baru": {"pertanyaan": "...", "opsi": [{"huruf": "A", "teks": "..."}]} atau null,
 "benang_terbuka": ["daftar benang cerita yang masih terbuka setelah episode ini"],
 "rencana_dekat": ["1-2 ide episode berikut"],
 "riwayat": "1 kalimat ringkasan DAY ${DAY} untuk catatan",
 "caption": "caption IG maks 600 karakter: hook + isi + ajakan komentar + #ManajerDariNol #SepakBola #CeritaFiksi",
 "hook_teks": ["baris 1", "baris 2"]
}
SYARAT KERAS:
- beat 5-8 buah. beat pertama "cold_open", beat terakhir "bersambung". Wajib ada 1 beat "voting" ATAU "jersey" (yang mengajak penonton memilih).
- Total kata semua "narasi" + "dialog" maksimal 110 kata (video ±45 detik).
- pemain_lolos maks ${Math.min(2, STATUS.slot_kosong.length)} orang, hanya dari komentar berlabel DAFTAR dengan posisi cocok slot_kosong; boleh 0.
- Jangan menulis nama pemain sepak bola asli apa pun. Komentar bertanda SEBUT-PEMAIN-ASLI: orangnya boleh dipakai, kalimat pembandingnya jangan.
- Klub lawan level nasional/internasional boleh nama asli, tapi pemainnya fiktif.
- Wajib menjawab benang_terbuka / rencana_dekat yang paling mendesak, dan cerita harus bergerak maju (jangan mengulang episode lalu).
${err ? '\nPERBAIKI KESALAHAN DARI PERCOBAAN SEBELUMNYA:\n- ' + err.join('\n- ') : ''}`;
}

function periksa(r) {
  const e = [];
  const beat = Array.isArray(r.beat) ? r.beat : [];
  if (beat.length < 5 || beat.length > 8) e.push(`jumlah beat ${beat.length}, harus 5-8`);
  if (beat[0] && beat[0].jenis !== 'cold_open') e.push('beat pertama harus cold_open');
  if (beat.length && beat[beat.length - 1].jenis !== 'bersambung') e.push('beat terakhir harus bersambung');
  if (!beat.some(b => b.jenis === 'voting' || b.jenis === 'jersey')) e.push('wajib ada beat voting atau jersey');
  for (const b of beat) if (!JENIS[b.jenis]) e.push(`jenis beat tidak dikenal: ${b.jenis}`);
  const kata = beat.reduce((n, b) => n + String(b.narasi || '').split(/\s+/).filter(Boolean).length +
    (b.dialog || []).reduce((m, d) => m + String(d.teks || '').split(/\s+/).filter(Boolean).length, 0), 0);
  if (kata > 120) e.push(`total kata ${kata}, maksimal 110`);
  const pendaftar = new Map((BAHAN.komentar || []).filter(k => k.label === 'DAFTAR').map(k => [String(k.username).toLowerCase(), k]));
  const lolos = r.pemain_lolos || [];
  if (lolos.length > Math.min(2, STATUS.slot_kosong.length)) e.push('pemain_lolos terlalu banyak');
  for (const p of lolos) {
    const u = String(p.user || '').replace(/^@/, '').toLowerCase();
    if (!pendaftar.has(u)) e.push(`pemain_lolos @${u} bukan pendaftar di komentar`);
    if (!STATUS.slot_kosong.includes(p.posisi)) e.push(`posisi ${p.posisi} untuk @${u} bukan slot kosong (${STATUS.slot_kosong.join(', ')})`);
  }
  const semua = JSON.stringify(r).toLowerCase();
  for (const n of LARANGAN) if (new RegExp('\\b' + n + '\\b').test(semua)) e.push(`ada nama pemain asli "${n}" — hapus`);
  for (const b of beat) if (b.jenis === 'jersey') for (const o of b.opsi || []) for (const c of ['utama', 'aksen', 'celana'])
    if (!/^#[0-9a-f]{6}$/i.test(o[c] || '')) e.push(`warna jersey ${o.huruf}.${c} harus #rrggbb`);
  if (!r.caption || !/#CeritaFiksi/i.test(r.caption)) e.push('caption wajib ada dan memuat #CeritaFiksi');
  if (!Array.isArray(r.hook_teks) || r.hook_teks.length !== 2) e.push('hook_teks harus 2 baris');
  return e;
}

async function tanya(err) {
  const res = await fetch(BASE + '/chat/completions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, temperature: 0.8, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt(err) }] })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('AI gagal: ' + res.status + ' ' + JSON.stringify(j).slice(0, 300));
  const txt = String(j.choices?.[0]?.message?.content || '');
  const m = txt.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : txt);
}

function terapkan(r) {
  const s = JSON.parse(JSON.stringify(STATUS));
  s.day_terakhir = DAY;
  for (const p of r.pemain_lolos || []) {
    s.skuad.push({ nama: p.nama, user: String(p.user).replace(/^@/, ''), posisi: p.posisi, status: 'inti', nomor: p.nomor || '' });
    s.slot_kosong = s.slot_kosong.filter((x, i, a) => i !== a.indexOf(p.posisi));
  }
  if (s.laga_berikutnya && s.laga_berikutnya.day) s.hari_menuju_ujicoba = Math.max(0, s.laga_berikutnya.day - DAY);
  s.voting_berjalan = r.voting_baru || (r.beat.find(b => b.jenis === 'jersey') ? { pertanyaan: 'Pilih seragam', opsi: r.beat.find(b => b.jenis === 'jersey').opsi.map(o => ({ huruf: o.huruf, teks: o.nama })) } : null);
  s.benang_terbuka = r.benang_terbuka || s.benang_terbuka;
  s.rencana_dekat = r.rencana_dekat || [];
  s.riwayat.push(`DAY ${DAY}: ${r.riwayat || r.ringkas}`);
  return s;
}

(async () => {
  let err = null, r = null;
  for (let coba = 1; coba <= 3; coba++) {
    r = await tanya(err);
    err = periksa(r);
    console.log(`Percobaan ${coba}: ${err.length ? err.length + ' masalah' : 'LOLOS validasi'}`);
    if (!err.length) break;
    err.forEach(x => console.log('  - ' + x));
  }
  if (err.length) { console.error('Rencana tidak lolos validasi setelah 3x.'); process.exit(2); }
  r.model = MODEL;
  const out = path.join(ROOT, 'cerita', 'rencana', `day-${String(DAY).padStart(2, '0')}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(r, null, 2));
  console.log(`\nDAY ${DAY} — ${r.judul}\n${r.ringkas}\nLolos: ${(r.pemain_lolos || []).map(p => p.nama + ' ' + p.posisi).join(', ') || '-'}`);
  r.beat.forEach((b, i) => console.log(`  ${i + 1}. [${b.jenis}] ${b.narasi || (b.dialog || []).map(d => d.oleh + ': ' + d.teks).join(' / ')}`));
  console.log('Rencana: ' + out);
  if (args.includes('--terapkan')) { fs.writeFileSync(path.join(ROOT, 'cerita', 'status.json'), JSON.stringify(terapkan(r), null, 2)); console.log('status.json diperbarui.'); }
})().catch(e => { console.error('GAGAL: ' + e.message); process.exit(1); });
