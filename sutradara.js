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
const GEMINI = /^AIza/.test(KEY || ''); // key Google AI Studio (gratis) dikenali otomatis
const BASE = GEMINI ? 'https://generativelanguage.googleapis.com/v1beta/openai' : (process.env.OPENAI_BASE_URL || 'https://ai.flaz.id/v1').replace(/\/+$/, '');
const MODEL = GEMINI ? (process.env.GEMINI_MODEL || 'gemini-3.8-flash') : (process.env.LLM_MODEL || 'gpt-4o');
if (!KEY && !args.includes('--terapkan-dari')) { console.error('OPENAI_API_KEY belum ada (env / video/.env).'); process.exit(1); }

const BIBLE = baca('cerita/bible.json');
const STATUS = baca('cerita/status.json');
const BAHAN = arg('--bahan') ? baca(arg('--bahan')) : { komentar: [] };
const DAY = STATUS.day_terakhir + 1;
// semua komentar DAFTAR per username digabung (orang bisa menulis nama & posisi di komentar berbeda)
const PENDAFTAR = new Map();
for (const k of (BAHAN.komentar || []).filter(k => k.label === 'DAFTAR')) {
  const u = String(k.username).toLowerCase(), lama = PENDAFTAR.get(u);
  PENDAFTAR.set(u, lama ? { ...lama, teks: lama.teks + ' | ' + k.teks, posisi: lama.posisi || k.posisi } : { ...k });
}
const SKUAD_MAKS = STATUS.skuad_maks || 30;            // skuad boleh tumbuh sampai 30 (11 inti + cadangan)
const MAKS_LOLOS = Math.max(0, Math.min(10, SKUAD_MAKS - STATUS.skuad.length)); // pemain baru per episode (keputusan user: 10)
const JELAS = /daftar|kiper|keeper|\bgk\b|bek|back|gelandang|sayap|winger|striker|penyerang|\b(cb|lb|rb|cmf|amf|dmf|lwf|rwf|lw|rw|cf|st)\b|posisi|main di|no\s*\d+/i;
const POS_SAH =['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'AMF', 'LWF', 'RWF', 'CF'];
if (!STATUS.ultras) STATUS.ultras = { nama: null, anggota: [] };

// nama pemain/klub asli yang sering muncul di komentar -> tidak boleh tampil (pemain lawan pun fiktif)
const LARANGAN = ['foden', 'haye', 'messi', 'ronaldo', 'mbappe', 'neymar', 'haaland', 'mohamed salah', 'mo salah', 'bellingham', 'vinicius',
  'yamal', 'kane', 'modric', 'lewandowski', 'de bruyne', 'saka', 'witan', 'egy', 'asnawi', 'pratama arhan', 'marselino',
  'rafael struick', 'ragnar', 'jay idzes', 'maarten paes', 'calvin verdonk', 'shin tae', 'kluivert'];

// ---------- PEMILIHAN PEMAIN OLEH KODE (AI hanya menulis cerita) ----------
const KATA_UMUM = new Set(('daftar bang bg kak min admin saya aku gua gue gw nama posisi bek kiri kanan tengah sayap gelandang kiper penyerang striker ' +
  'udah sudah follow join no nomor main di dan yang mau ikut bisa kapten capt serang bertahan winger back keeper siap jadi pemain ' +
  'cf cb lb rb cmf amf dmf lwf rwf lw rw gk st ss om dm cm am').split(/\s+/));
const kapital = s => String(s).toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
function namaDari(u, teks) {
  const t = String(teks || '').replace(/@\S+/g, ' ');
  const m = t.match(/(?:nama|daftar)\s*(?:bang\s*)?(?:nama\s*)?[-–—:,]?\s*([A-Z][a-zA-Z]{1,12}(?:\s[A-Z][a-zA-Z]{0,12}){0,2})(?=\s*(?:[-–—,|]|$|\s(?:kiper|bek|sayap|gelandang|penyerang|striker|no|cf|cb|lb|rb|cmf|amf|lwf|rwf|gk)\b))/);
  if (m && !KATA_UMUM.has(m[1].toLowerCase())) return m[1].trim();
  const kata = t.toLowerCase().match(/[a-z]{3,}/g) || [];
  const diUser = kata.find(w => !KATA_UMUM.has(w) && u.includes(w));
  if (diUser) return kapital(diUser);
  const sisa = kata.find(w => !KATA_UMUM.has(w) && w.length >= 3 && w.length <= 10);
  if (sisa) return kapital(sisa);
  const seg = String(u).split(/[._\d]+/).filter(s => s.length >= 3)[0] || u;
  return kapital(seg.slice(0, 12));
}
function posisiDari(k) {
  if (POS_SAH.includes(k.posisi)) return k.posisi;
  const t = String(k.teks || '').toLowerCase();
  const peta = [[/kiper|keeper|\bgk\b/, 'GK'], [/bek kiri|\blb\b/, 'LB'], [/bek kanan|\brb\b/, 'RB'], [/bek|\bcb\b/, 'CB'], [/sayap kiri|\blwf?\b/, 'LWF'],
    [/sayap kanan|\brwf?\b/, 'RWF'], [/sayap|winger/, 'LWF'], [/gelandang serang|\bamf\b|\bom\b/, 'AMF'], [/bertahan|\bdmf\b/, 'DMF'], [/gelandang|\bcmf?\b/, 'CMF'], [/penyerang|striker|\bcf\b|\bst\b/, 'CF']];
  for (const [re, p] of peta) if (re.test(t)) return p;
  return 'CMF';
}
const PILIHAN = (() => {
  const dalam = new Set(STATUS.skuad.map(p => String(p.user).toLowerCase()));
  const calon = [...PENDAFTAR.entries()].filter(([u, k]) => !dalam.has(u) && JELAS.test(k.teks) && u !== 'ai_bareng_el')
    .map(([u, k]) => ({ user: k.username, nama: namaDari(u, k.teks), posisi: posisiDari(k), nomor: k.nomor || '', likes: k.likes || 0 }));
  const slot = STATUS.slot_kosong.slice(), dulu = [], nanti = [], namaAda = new Set(STATUS.skuad.map(p => String(p.nama).toLowerCase()));
  for (const c of calon) {
    if (namaAda.has(c.nama.toLowerCase())) continue; // nama kembar (mis. 2 akun daftar "Adel") -> ambil yang pertama
    namaAda.add(c.nama.toLowerCase()); const i = slot.indexOf(c.posisi); if (i >= 0) { slot.splice(i, 1); dulu.push(c); } else nanti.push(c); }
  nanti.sort((a, b) => b.likes - a.likes);
  return dulu.concat(nanti).slice(0, MAKS_LOLOS).map(({ likes, ...c }) => c);
})();

const JENIS = {
  cold_open: 'Adegan pembuka dari momen paling seru/dramatis. Wajib "teks_layar" (2 baris, maks 5 kata/baris) + "narasi" atau "dialog".',
  komentar: 'Tampilkan komentar asli penonton di layar. "users": daftar username (maks 4) dari bahan.',
  seleksi: 'Tes satu pemain dari komentar. "pemain": username, "tes": lari|sundul|umpan|tembak|kiper, "stat": 3 pasang [label, angka 50-95], "cap": LOLOS|CADANGAN|UTAMA.',
  ngobrol: 'Percakapan. "lokasi": lapangan|kantor|ruang_ganti|tribun|lapangan_rival, "dialog": [{oleh: jack|waskito|darman, teks}].',
  info: 'Kartu info di layar. "judul", "isi": maks 4 pasang [label, nilai], "warna": merah|hijau|ungu.',
  lolos: 'Pengumuman daftar pemain yang lolos (otomatis dari pemain_lolos, sampai 10 nama). WAJIB dipakai kalau pemain_lolos lebih dari 2. "narasi" singkat yang seru.',
  papan_skuad: 'Papan skuad terbaru (otomatis dari status + pemain_lolos) dengan slot KOSONG dan "KAMU?".',
  jersey: 'Pamer 3 desain jersey. "opsi": [{huruf A/B/C, nama, utama #hex, aksen #hex, celana #hex, pola: polos|garis|setengah|selempang}]. Desain original.',
  latihan: 'Montase latihan tim. "aktivitas": pemanasan|umpan|tembak|gim.',
  ultras: 'Penonton bergabung jadi ULTRAS (suporter garis keras Yonoha) di tribun. "users": 3-8 username dari komentar berlabel ULTRAS/DUKUNGAN (atau pendaftar yang belum lolos), "nyanyian": yel pendek orisinal maks 8 kata (opsional).',
  voting: 'Kartu voting. "pertanyaan" (maks 8 kata), "opsi": 2-3 [{huruf, teks maks 4 kata}]. Penonton komen hurufnya.',
  bersambung: 'Penutup menggantung. "teaser": kalimat cliffhanger maks 10 kata, "narasi".'
};

const system = `Kamu SUTRADARA serial video vertikal "${BIBLE.judul_serial}". Tugasmu menulis RENCANA episode DAY ${DAY} yang nyambung dengan cerita sebelumnya, bergerak menuju target babak, memakai penonton asli dari komentar sebagai pemain, dan membuat penonton penasaran sampai episode berikutnya.
Nada: ${BIBLE.nada}
Aturan dunia:
- ${BIBLE.aturan_dunia.join('\n- ')}
- ${BIBLE.aturan_seragam || ''}
Rencana dari owner (jalankan pada saat yang tepat, jangan lebih cepat):
- ${(BIBLE.ide_owner || []).join('\n- ')}
Jawab HANYA JSON valid sesuai format yang diminta, bahasa Indonesia santai.`;

function prompt(err) {
  const babak = BIBLE.peta_cerita.find(b => b.babak === STATUS.babak) || BIBLE.peta_cerita[0];
  const kom = (BAHAN.komentar || []).filter(k => k.username).map(k =>
    `@${k.username} [${k.label}${k.posisi ? ' ' + k.posisi : ''}${k.nomor && k.nomor !== 'kosong' ? ' no' + k.nomor : ''}${k.sebut_pemain_asli === 'ya' ? ' SEBUT-PEMAIN-ASLI' : ''}${k.status_seleksi ? ' ' + k.status_seleksi : ''}] | "${String(k.teks).slice(0, 120)}"`).join('\n');
  const vote = BAHAN.hasil_voting ? JSON.stringify(BAHAN.hasil_voting) : 'tidak ada';
  return `STATUS SEKARANG (setelah DAY ${STATUS.day_terakhir}):
${JSON.stringify({ babak: babak.nama, target_babak: babak.target, divisi: STATUS.divisi, kas: STATUS.kas, laga_berikutnya: STATUS.laga_berikutnya, skuad: STATUS.skuad, jumlah_skuad: STATUS.skuad.length + '/' + SKUAD_MAKS, slot_kosong_inti: STATUS.slot_kosong, ultras: { nama: STATUS.ultras.nama, jumlah_anggota: STATUS.ultras.anggota.length, anggota: STATUS.ultras.anggota.slice(-15) }, seragam: STATUS.seragam, benang_terbuka: STATUS.benang_terbuka, rencana_dekat: STATUS.rencana_dekat, voting_berjalan: STATUS.voting_berjalan }, null, 1)}
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
 "nama_ultras": null atau nama kelompok ultras kalau episode ini menetapkannya (mis. dari hasil voting),
 "voting_baru": {"pertanyaan": "...", "opsi": [{"huruf": "A", "teks": "..."}]} atau null,
 "benang_terbuka": ["daftar benang cerita yang masih terbuka setelah episode ini"],
 "rencana_dekat": ["1-2 ide episode berikut"],
 "riwayat": "1 kalimat ringkasan DAY ${DAY} untuk catatan",
 "caption": "caption IG maks 600 karakter: hook + isi + ajakan komentar + #ManajerDariNol #SepakBola #CeritaFiksi",
 "hook_teks": ["baris 1", "baris 2"]
}
SYARAT KERAS:
- SETIAP beat wajib punya "narasi" (Jack bicara sebagai "aku", orang pertama — JANGAN "Jack harus...") atau "dialog".
- beat 5-8 buah. beat pertama "cold_open", beat terakhir "bersambung". Wajib TEPAT SATU ajakan memilih: beat "voting" ATAU beat "jersey" (jersey sudah termasuk voting — jangan dobel).
- HOOK: cold_open = momen PALING dramatis/lucu episode ini (konflik, kejutan, teriakan), BUKAN ringkasan datar. hook_teks 2 baris pendek yang bikin penasaran, contoh bagus: ["KETAHUAN NGINTIP RIVAL.", "YANG CURI 9 PEMAIN KITA."], ["2 KIPER DAFTAR.", "CUMA 1 JADI STARTER."]. Contoh buruk: ["Jack kembali ke Yonoha", "Ada misi baru"].
- Setiap pemain_lolos WAJIB tampil di beat "seleksi" (pemain = username-nya), beat "komentar" (users memuat username-nya), atau beat "lolos" (semua pemain_lolos otomatis tampil). Kalau pemain_lolos > 2, pakai beat "lolos" + boleh 1-2 beat "seleksi" untuk yang paling menarik.
- bersambung: narasi diakhiri ketegangan/pertanyaan ("...?" atau "..."), BUKAN kalimat menenangkan. teaser = kejutan yang belum terjawab.
- caption: hook + sebut nama pemain baru + ajakan komen yang jelas (mis. "Komen A, B, atau C!") + hashtag.
- Total kata semua "narasi" + "dialog" maksimal 110 kata (video ±45 detik).
- PEMAIN LOLOS SUDAH DITETAPKAN (jangan diubah, salin persis ke "pemain_lolos"): ${PILIHAN.length ? PILIHAN.map(p => `${p.nama} (@${p.user}, ${p.posisi}${STATUS.slot_kosong.includes(p.posisi) ? ', INTI' : ', cadangan'})`).join('; ') : 'TIDAK ADA — pemain_lolos = []'}.${PILIHAN.length > 2 ? ' Wajib ada beat "lolos" untuk mengumumkan mereka.' : ''} Beat "seleksi" (opsional, 1-2) HANYA untuk username di daftar ini; pakai nama yang sama persis.${STATUS.skuad.length + MAKS_LOLOS >= SKUAD_MAKS ? ' Skuad hampir penuh: arahkan pendaftar lain ke ULTRAS.' : ''}
- ULTRAS: penonton yang tidak lolos / berkomentar dukungan bisa jadi ULTRAS Yonoha (suporter di tribun). Pakai beat "ultras" kalau ada ≥3 calon (boleh sekali per episode, tidak wajib). Ajak komen "ULTRAS" untuk gabung. Nama kelompok ultras ${STATUS.ultras.nama ? 'sudah: ' + STATUS.ultras.nama : 'BELUM ADA — suatu saat bisa jadi bahan voting'}.
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
  const pilih = beat.filter(b => b.jenis === 'voting' || b.jenis === 'jersey').length;
  if (pilih !== 1) e.push(`harus tepat 1 beat voting ATAU jersey (sekarang ${pilih})`);
  const tampil = new Set();
  for (const b of beat) { if (b.pemain) tampil.add(String(b.pemain).replace(/^@/, '').toLowerCase()); for (const u of b.users || []) tampil.add(String(u).replace(/^@/, '').toLowerCase()); }
  const adaLolos = beat.some(b => b.jenis === 'lolos');
  if ((r.pemain_lolos || []).length > 2 && !adaLolos) e.push('pemain_lolos lebih dari 2: wajib ada beat "lolos"');
  if (beat.filter(b => b.jenis === 'lolos').length > 1) e.push('beat lolos maksimal 1');
  if (adaLolos && !(r.pemain_lolos || []).length) e.push('beat lolos tanpa pemain_lolos');
  if (!adaLolos) for (const p of r.pemain_lolos || []) { const u = String(p.user || '').replace(/^@/, '').toLowerCase(); if (!tampil.has(u)) e.push(`pemain_lolos @${u} tidak tampil di beat seleksi/komentar/lolos`); }
  const akhir = beat[beat.length - 1] || {};
  if (akhir.jenis === 'bersambung' && !/(\?|\.\.\.|…)\s*$/.test(String(akhir.narasi || '').trim())) e.push('narasi bersambung harus diakhiri "?" atau "..." (menggantung)');
  if (r.caption && r.caption.length < 140) e.push('caption terlalu pendek: sebut pemain baru + ajakan komen yang jelas');
  for (const b of beat) if (!JENIS[b.jenis]) e.push(`jenis beat tidak dikenal: ${b.jenis}`);
  beat.forEach((b, i) => { if (!String(b.narasi || '').trim() && !(b.dialog || []).length) e.push(`beat ${i + 1} (${b.jenis}) tanpa narasi/dialog`); });
  beat.forEach((b, i) => { if (/\bJack\s+(harus|langsung|merasa|sedang|akan|kembali|panik)\b/i.test(String(b.narasi || ''))) e.push(`beat ${i + 1}: narasi harus orang pertama ("aku"), bukan "Jack ..."`); });
  const kata = beat.reduce((n, b) => n + String(b.narasi || '').split(/\s+/).filter(Boolean).length +
    (b.dialog || []).reduce((m, d) => m + String(d.teks || '').split(/\s+/).filter(Boolean).length, 0), 0);
  if (kata > 120) e.push(`total kata ${kata}, maksimal 110`);
  // HOOK: pembuka wajib menghentak (bukan ringkasan datar)
  const co = beat[0] || {};
  const teksCo = [co.narasi].concat((co.dialog || []).map(d => d.teks)).filter(Boolean).join(' ').trim();
  if (co.jenis === 'cold_open') {
    if (/^(hari ini|selamat|halo|hai|di episode|episode ini|kali ini|pagi ini|sekarang)/i.test(teksCo)) e.push(`cold_open terlalu datar ("${teksCo.slice(0, 40)}..."): mulai LANGSUNG dari konflik/kejutan/teriakan, jangan "Hari ini..."`);
    if (!/[!?]/.test(teksCo)) e.push('cold_open wajib ada teriakan/kejutan (mengandung "!" atau "?")');
    if (/\b(menarik|beberapa|bersemangat|antusias)\b/i.test(teksCo)) e.push('cold_open pakai kata datar (menarik/beberapa/antusias): ganti dengan momen dramatis yang spesifik');
  }
  for (const h of r.hook_teks || []) if (/^(hari ini|selamat|halo|day \d+$)/i.test(String(h).trim())) e.push(`hook_teks "${h}" terlalu datar`);
  // pemain_lolos dipaksa = PILIHAN (lihat rapikan), jadi tidak perlu dinilai di sini
  for (const b of beat) if (b.jenis === 'ultras' && (!Array.isArray(b.users) || b.users.length < 1)) e.push('beat ultras wajib punya "users"');
  if (beat.filter(b => b.jenis === 'ultras').length > 1) e.push('beat ultras maksimal 1');
  const semua = JSON.stringify(r).toLowerCase();
  for (const n of LARANGAN) if (new RegExp('\\b' + n + '\\b').test(semua)) e.push(`ada nama pemain asli "${n}" — hapus`);
  for (const b of beat) if (b.jenis === 'jersey') for (const o of b.opsi || []) for (const c of ['utama', 'aksen', 'celana'])
    if (!/^#[0-9a-f]{6}$/i.test(o[c] || '')) e.push(`warna jersey ${o.huruf}.${c} harus #rrggbb`);
  if (!r.caption || !/#CeritaFiksi/i.test(r.caption)) e.push('caption wajib ada dan memuat #CeritaFiksi');
  if (!Array.isArray(r.hook_teks) || r.hook_teks.length !== 2) e.push('hook_teks harus 2 baris');
  return e;
}

// perbaikan otomatis hal-hal mekanis supaya AI tidak gagal karena detail
const WARNA_CADANGAN = [['#dc2626', '#1e3a8a', '#111827'], ['#16a34a', '#111827', '#f8fafc'], ['#2563eb', '#facc15', '#1e3a8a']];
function rapikan(r) {
  r.beat = Array.isArray(r.beat) ? r.beat : [];
  const cocok = u => PILIHAN.find(p => p.user.toLowerCase() === String(u || '').replace(/^@/, '').toLowerCase());
  const alasan = Object.fromEntries((r.pemain_lolos || []).map(p => [String(p.user || '').replace(/^@/, '').toLowerCase(), p.alasan]));
  r.pemain_lolos = PILIHAN.map(p => ({ ...p, alasan: alasan[p.user.toLowerCase()] || '' }));
  const adaKomen = new Set((BAHAN.komentar || []).map(k => String(k.username).toLowerCase()));
  const sudah = new Set();
  r.beat = r.beat.filter(b => {
    if (b.jenis !== 'seleksi') return true;
    let p = cocok(b.pemain);
    if (!p) p = PILIHAN.find(x => !sudah.has(x.user.toLowerCase()));
    if (!p) return false;
    sudah.add(p.user.toLowerCase()); b.pemain = p.user;
    // nama di narasi seleksi disamakan
    return true;
  });
  for (const b of r.beat) {
    if (b.jenis === 'komentar') { b.users = (b.users || []).map(u => String(u).replace(/^@/, '')).filter(u => adaKomen.has(u.toLowerCase())).slice(0, 4); if (!b.users.length) b.users = PILIHAN.slice(0, 4).map(p => p.user); }
    if (b.jenis === 'ultras') b.users = (b.users || []).map(u => String(u).replace(/^@/, '')).filter(u => adaKomen.has(u.toLowerCase()) && !cocok(u)).slice(0, 8);
    if (b.jenis === 'jersey') (b.opsi || []).forEach((o, i) => ['utama', 'aksen', 'celana'].forEach((c, j) => { if (!/^#[0-9a-f]{6}$/i.test(o[c] || '')) o[c] = WARNA_CADANGAN[i % 3][j]; }));
  }
  r.beat = r.beat.filter(b => b.jenis !== 'ultras' || b.users.length);
  const ISI = { komentar: 'Lihat komentar kalian. Kalian serius mau main!', ultras: 'Yang belum lolos? Kalian jadi ultras Yonoha!', lolos: `${PILIHAN.length} pemain baru resmi gabung Yonoha!`,
    papan_skuad: 'Ini skuad kita sekarang.', info: 'Catat baik-baik.', latihan: 'Latihan dulu, biar nggak malu-maluin.', jersey: 'Kalian yang pilih seragamnya!', voting: 'Kalian yang pilih!' };
  for (const b of r.beat) if (!String(b.narasi || '').trim() && !(b.dialog || []).length && ISI[b.jenis]) b.narasi = ISI[b.jenis];
  if (PILIHAN.length > 2 && !r.beat.some(b => b.jenis === 'lolos')) {
    const i = Math.max(1, r.beat.findIndex(b => b.jenis === 'voting' || b.jenis === 'jersey' || b.jenis === 'bersambung'));
    r.beat.splice(i, 0, { jenis: 'lolos', narasi: `${PILIHAN.length} pemain baru resmi gabung Yonoha!` });
  }
  if (r.beat.length > 8) { const buang = r.beat.findIndex((b, i) => i > 0 && (b.jenis === 'komentar' || b.jenis === 'info' || b.jenis === 'latihan')); if (buang > 0) r.beat.splice(buang, 1); }
  const akhir = r.beat[r.beat.length - 1];
  if (akhir && akhir.jenis === 'bersambung' && akhir.narasi && !/(\?|\.\.\.|…)\s*$/.test(akhir.narasi.trim())) akhir.narasi = akhir.narasi.trim().replace(/[.!]+$/, '') + '...';
  if (r.caption && !/#CeritaFiksi/i.test(r.caption)) r.caption += ' #CeritaFiksi';
  return r;
}
const RINGAN = /cold_open|hook|caption|total kata|orang pertama/i; // masalah yang tidak boleh menggagalkan tayang

// juri hook: AI kedua menilai 3 detik pertama (cold_open + hook_teks) seperti penonton yang mau nge-skip
async function nilaiHook(r) {
  const co = (r.beat || [])[0] || {};
  const isi = `TEKS LAYAR: ${(r.hook_teks || []).join(' / ')}\nUCAPAN: ${[co.narasi].concat((co.dialog || []).map(d => d.oleh + ': ' + d.teks)).filter(Boolean).join(' / ')}`;
  const res = await aiFetch(BASE + '/chat/completions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, temperature: 0.2, response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: 'Kamu juri hook video pendek (Reels/Shorts) penonton Indonesia 18-34 th. Galak dan jujur. Jawab JSON saja.' },
      { role: 'user', content: `Nilai 3 detik pertama episode serial bola fiksi ini. Skor 1-10: apakah orang BERHENTI scroll? Hook bagus = konflik/kejutan/teriakan spesifik, kalimat pendek, bikin penasaran ("KETAHUAN NGINTIP RIVAL!", "2 KIPER, CUMA 1 STARTER."). Hook buruk = mengumumkan/menjelaskan rencana ("Kami akan memilih jersey baru"), datar, umum.\n\n${isi}\n\nJSON: {"skor": angka, "alasan": "maks 15 kata", "saran": "contoh hook lebih baik maks 12 kata"}` }] })
  });
  const j = await res.json();
  const o = JSON.parse(String(j.choices?.[0]?.message?.content || '{}').match(/\{[\s\S]*\}/)[0]);
  return { skor: Number(o.skor) || 0, alasan: o.alasan || '', saran: o.saran || '' };
}

async function tanya(err) {
  const res = await aiFetch(BASE + '/chat/completions', {
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
  s.skuad_maks = SKUAD_MAKS;
  for (const p of r.pemain_lolos || []) {
    const inti = s.slot_kosong.includes(p.posisi);
    s.skuad.push({ nama: p.nama, user: String(p.user).replace(/^@/, ''), posisi: p.posisi, status: inti ? 'inti' : 'cadangan', nomor: p.nomor || '' });
    if (inti) s.slot_kosong = s.slot_kosong.filter((x, i, a) => i !== a.indexOf(p.posisi));
  }
  s.ultras = s.ultras || { nama: null, anggota: [] };
  const sudahUltras = new Set(s.ultras.anggota.map(x => x.toLowerCase()));
  for (const b of r.beat || []) if (b.jenis === 'ultras') for (const u0 of b.users || []) {
    const u = String(u0).replace(/^@/, '');
    if (!sudahUltras.has(u.toLowerCase())) { s.ultras.anggota.push(u); sudahUltras.add(u.toLowerCase()); }
  }
  if (r.nama_ultras) s.ultras.nama = r.nama_ultras;
  if (s.laga_berikutnya && s.laga_berikutnya.day) s.hari_menuju_ujicoba = Math.max(0, s.laga_berikutnya.day - DAY);
  s.voting_berjalan = r.voting_baru || (r.beat.find(b => b.jenis === 'jersey') ? { pertanyaan: 'Pilih seragam', opsi: r.beat.find(b => b.jenis === 'jersey').opsi.map(o => ({ huruf: o.huruf, teks: o.nama })) } : null);
  s.benang_terbuka = r.benang_terbuka || s.benang_terbuka;
  s.rencana_dekat = r.rencana_dekat || [];
  s.riwayat.push(`DAY ${DAY}: ${r.riwayat || r.ringkas}`);
  return s;
}

// panggil AI; kalau server (mis. Gemini) menolak response_format, ulangi tanpa itu. Gagal 401/402/429 = berhenti dengan pesan jelas.
async function aiFetch(url, opt) {
  let r = await fetch(url, opt);
  if (r.status === 400) { const b = JSON.parse(opt.body); if (b.response_format) { delete b.response_format; r = await fetch(url, { ...opt, body: JSON.stringify(b) }); } }
  if ([401, 402, 403, 429].includes(r.status)) { const t = await r.text(); throw new Error(`AI menolak (${r.status}) — cek key/saldo/kuota: ${t.slice(0, 200)}`); }
  return r;
}

(async () => {
  if (arg('--terapkan-dari')) { // perbarui status dari rencana yang sudah tayang, tanpa AI
    const r0 = baca(arg('--terapkan-dari'));
    fs.writeFileSync(path.join(ROOT, 'cerita', 'status.json'), JSON.stringify(terapkan(r0), null, 2));
    console.log(`status.json diperbarui untuk DAY ${r0.day}.`); return;
  }
  console.log(`Pemain lolos (ditetapkan kode): ${PILIHAN.map(p => `${p.nama} @${p.user} ${p.posisi}`).join(', ') || '-'}`);
  let err = null, r = null, cadangan = null;
  for (let coba = 1; coba <= 4; coba++) {
    try { r = rapikan(await tanya(err)); } catch (e) { console.log(`Percobaan ${coba}: AI error ${e.message}`); err = ['jawaban sebelumnya bukan JSON valid']; continue; }
    err = periksa(r);
    let skor = 0;
    if (err.every(x => RINGAN.test(x))) {
      const h = await nilaiHook(r).catch(() => null);
      if (h) { skor = h.skor; console.log(`Nilai hook: ${h.skor}/10 — ${h.alasan}`); if (h.skor < 7) err.push(`HOOK kurang nendang (skor ${h.skor}/10): ${h.alasan}. Saran: ${h.saran || 'buka dari momen paling dramatis/lucu, kalimat pendek berteriak'}`); }
      const nilai = skor * 10 - err.length; // pilih hook terbaik, lalu masalah paling sedikit
      if (!cadangan || nilai > cadangan.nilai) cadangan = { r: JSON.parse(JSON.stringify(r)), err: err.slice(), nilai };
    }
    console.log(`Percobaan ${coba}: ${err.length ? err.length + ' masalah' : 'LOLOS validasi'}`);
    if (!err.length) break;
    err.forEach(x => console.log('  - ' + x));
  }
  if (err && err.length) {
    if (!cadangan) { console.error('Rencana tidak lolos validasi setelah 4x.'); process.exit(2); }
    console.log(`PERINGATAN: dipakai rencana terbaik dengan ${cadangan.err.length} masalah ringan: ${cadangan.err.join(' | ')}`);
    r = cadangan.r; r.peringatan = cadangan.err;
  }
  r.model = MODEL;
  const out = path.join(ROOT, 'cerita', 'rencana', `day-${String(DAY).padStart(2, '0')}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(r, null, 2));
  console.log(`\nDAY ${DAY} — ${r.judul}\n${r.ringkas}\nLolos: ${(r.pemain_lolos || []).map(p => p.nama + ' ' + p.posisi).join(', ') || '-'}`);
  r.beat.forEach((b, i) => console.log(`  ${i + 1}. [${b.jenis}] ${b.narasi || (b.dialog || []).map(d => d.oleh + ': ' + d.teks).join(' / ')}`));
  console.log('Rencana: ' + out);
  console.log('RENCANA=' + path.relative(ROOT, out).replace(/\\/g, '/'));
  if (args.includes('--terapkan')) { fs.writeFileSync(path.join(ROOT, 'cerita', 'status.json'), JSON.stringify(terapkan(r), null, 2)); console.log('status.json diperbarui.'); }
})().catch(e => { console.error('GAGAL: ' + e.message); process.exit(1); });
