// PENYUSUN — mengubah rencana Sutradara (cerita/rencana/day-NN.json) menjadi naskah render (episodes/episode-NN.json).
// Pakai:  node penyusun.js cerita/rencana/day-06.json --bahan cerita/bahan/day-06.json
// Status yang dipakai = cerita/status.json SEBELUM rencana diterapkan (jalankan penyusun sebelum sutradara --terapkan,
// atau beri --status <file status lama>).
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const args = process.argv.slice(2);
const arg = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const baca = f => JSON.parse(fs.readFileSync(path.resolve(ROOT, f), 'utf8'));

const R = baca(args.find(a => a.endsWith('.json') && !a.includes('bahan') && !a.includes('status')));
const STATUS = baca(arg('--status') || 'cerita/status.json');
const BAHAN = arg('--bahan') ? baca(arg('--bahan')) : { komentar: [] };
const DAY = R.day;

// ---------- data dasar ----------
const BASE = { kyy151030: 'rizky', 'miftakh_al.13': 'miftakh', daffazzh: 'dapeng', elmermuhandis_: 'jay', sayaando8: 'ando', radhika_ananda16: 'radhika', bagus73503: 'bagus' };
const BASE_LOOK = {
  rizky: { skin: '#c58b5c', shirt: '#dc2626', stripe: '#f8fafc', pants: '#111827', hair: '#1b1b1b', shoes: '#f3f4f6' },
  miftakh: { skin: '#b97a4f', shirt: '#2563eb', stripe: '#1e3a8a', pants: '#1f2937', hair: '#1b1b1b', shoes: '#111', skala: 1.07 },
  dapeng: { skin: '#e0ac80', shirt: '#16a34a', stripe: '#fde047', pants: '#1f2937', hair: '#3b2a20', shoes: '#f97316' },
  jay: { skin: '#c58b5c', shirt: '#f8fafc', stripe: '#ea580c', pants: '#111827', hair: '#1b1b1b', shoes: '#ea580c' },
  ando: { skin: '#b97a4f', shirt: '#f59e0b', stripe: '#111827', pants: '#111827', hair: '#1b1b1b', gloves: '#f8fafc', shoes: '#111', kiper: true, skala: 1.06 },
  radhika: { skin: '#e0ac80', shirt: '#7c3aed', stripe: '#c4b5fd', pants: '#1f2937', hair: '#2b1d14', gloves: '#22c55e', shoes: '#f3f4f6', kiper: true },
  bagus: { skin: '#d9a273', shirt: '#facc15', stripe: '#1f2937', pants: '#1f2937', hair: '#3b2a20', shoes: '#111', belly: 0.25 }
};
const POSISI = { GK: 'Kiper', CB: 'Bek Tengah', LB: 'Bek Kiri', RB: 'Bek Kanan', DMF: 'Gelandang Bertahan', CMF: 'Gelandang Tengah', AMF: 'Gelandang Serang', LWF: 'Sayap Kiri', RWF: 'Sayap Kanan', CF: 'Penyerang Tengah', BEK: 'Bek', GELANDANG: 'Gelandang', SAYAP: 'Sayap' };
const WARNA = ['#dc2626', '#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#ca8a04', '#0891b2', '#db2777', '#4f46e5', '#059669'];
const LARANGAN = /\b(setara|mirip|kayak|kaya|seperti|ala)\s+[\w.]+(\s+[\w.]+)?/gi;
const ANGKA = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas', 'dua belas', 'tiga belas', 'empat belas', 'lima belas', 'enam belas', 'tujuh belas', 'delapan belas', 'sembilan belas', 'dua puluh'];

const hash = s => { let x = 5381; for (const ch of String(s)) x = ((x * 33) ^ ch.charCodeAt(0)) >>> 0; return x; };
const kunci = u => BASE[String(u).replace(/^@/, '').toLowerCase()] || ('p_' + String(u).toLowerCase().replace(/[^a-z0-9]/g, '_'));
const bersih = t => String(t || '').replace(LARANGAN, '').replace(/\s{2,}/g, ' ').trim();
const ucap = t => String(t || '').replace(/\bDay\s+(\d+)/gi, (m, n) => 'Day ' + (ANGKA[+n] || n)).replace(/@/g, '').replace(/\bFC\b/g, 'F C');
const komenDari = u => (BAHAN.komentar || []).find(k => String(k.username).toLowerCase() === String(u).replace(/^@/, '').toLowerCase());

function lookBaru(user, posisi) {
  const h = hash(user), skin = ['#d9a273', '#c58b5c', '#e0ac80', '#b97a4f', '#f1c7a0'][h % 5];
  const look = { skin, shirt: WARNA[(h >> 3) % WARNA.length], stripe: ['#f8fafc', '#111827', '#fde047'][(h >> 5) % 3], pants: ['#111827', '#1f2937', '#374151', '#1e3a8a'][(h >> 7) % 4],
    hair: ['#1b1b1b', '#3b2a20', '#2b1d14'][(h >> 9) % 3], shoes: ['#111', '#f3f4f6', '#f97316', '#2563eb'][(h >> 11) % 4] };
  if (posisi === 'GK') { look.gloves = '#f8fafc'; look.kiper = true; }
  if ((h >> 13) % 4 === 0) look.cap = ['#111827', '#dc2626', '#2563eb'][(h >> 15) % 3];
  return look;
}

// ---------- pemain ----------
const lolos = (R.pemain_lolos || []).map(p => ({ ...p, user: String(p.user).replace(/^@/, '') }));
const SKUAD_MAKS = STATUS.skuad_maks || 30;
const slotAkhir = STATUS.slot_kosong.slice();
lolos.forEach(p => { const i = slotAkhir.indexOf(p.posisi); p.inti = i >= 0; if (i >= 0) slotAkhir.splice(i, 1); });
const skuadAkhir = STATUS.skuad.concat(lolos.map(p => ({ nama: p.nama, user: p.user, posisi: p.posisi, status: p.inti ? 'inti' : 'cadangan', baru: true })));
const target = n => (n < 11 ? 11 : SKUAD_MAKS);
const ULTRAS = STATUS.ultras || { nama: null, anggota: [] };
const pemainData = {};
function pastikan(user, posisi) {
  const k = kunci(user);
  if (!pemainData[k]) pemainData[k] = BASE_LOOK[k] ? { ...BASE_LOOK[k] } : lookBaru(user, posisi);
  return k;
}
if (STATUS.seragam) skuadAkhir.forEach(p => pastikan(p.user, p.posisi));

// ---------- beat -> adegan ----------
const SUARA = { jack: { voice: 'id-ID-ArdiNeural', rate: '+10%', pitch: '-3Hz', label: 'JACK' }, waskito: { voice: 'id-ID-ArdiNeural', rate: '+0%', pitch: '-24Hz', label: 'WASKITO (KETUA)' }, darman: { voice: 'id-ID-ArdiNeural', rate: '+6%', pitch: '-14Hz', label: 'COACH DARMAN (BINTANG SEBELAH)' } };
const LOK = { lapangan: 'lapangan', kantor: 'kantor', ruang_ganti: 'ruang_ganti', tribun: 'tribun', lapangan_rival: 'lapangan_rival' };
const NAMA_LOK = { kantor: 'KANTOR KETUA', ruang_ganti: 'RUANG GANTI', tribun: 'TRIBUN', lapangan_rival: 'LAPANGAN BINTANG SEBELAH', lapangan: 'STADION YONOHA' };
function baris(b) {
  const out = [];
  if (b.narasi) out.push({ oleh: 'jack', teks: b.narasi });
  for (const d of b.dialog || []) out.push({ oleh: SUARA[d.oleh] ? d.oleh : 'jack', teks: d.teks });
  return out.filter(x => String(x.teks || '').trim()).map(x => { const t = bersih(x.teks), s = ucap(t); return s !== t ? { ...x, teks: t, tts: s } : { ...x, teks: t }; });
}
const adegan = [], ketukan = [];
let skorTerakhir = null;
let id = 0;
for (const b of R.beat) {
  id++;
  const a = { id: 'b' + id, suasana: 'pagi', min: 4.5, baris: baris(b) };
  const tokoh = ['jack'].concat((b.dialog || []).map(d => d.oleh).filter(o => o !== 'jack'));
  if (b.jenis === 'cold_open') {
    Object.assign(a, { panggung: 'umum', dramatis: true, lokasi3d: LOK[b.lokasi] || (tokoh.includes('darman') ? 'lapangan_rival' : 'lapangan'), tokoh, lead: 0.1, min: 3.6, sfx: [[0, 'peluit']] });
  } else if (b.jenis === 'ngobrol') {
    const l = LOK[b.lokasi] || 'lapangan';
    Object.assign(a, { panggung: 'umum', lokasi3d: l, tokoh, suasana: l === 'kantor' || l === 'ruang_ganti' ? 'dalam' : 'pagi', lokasi: NAMA_LOK[l] });
  } else if (b.jenis === 'komentar') {
    const users = (b.users || []).map(u => String(u).replace(/^@/, '')).slice(0, 4);
    a.panggung = 'komen';
    a.komen = users.map(u => { const k = komenDari(u) || {}; return { user: u, waktu: 'baru', teks: bersih(k.teks || 'daftar'), warna: WARNA[hash(u) % WARNA.length] }; });
    a.sfx = a.komen.map((_, i) => [0.6 + i * 0.45, 'ding']);
    // pemain lolos yang hanya muncul di kartu komentar (tanpa beat seleksi) -> tambah penghitung skuad di sini
    const diSeleksi = new Set(R.beat.filter(x => x.jenis === 'seleksi').map(x => String(x.pemain || '').replace(/^@/, '').toLowerCase()));
    const sudahDihitung = new Set(adegan.flatMap(x => x.dihitung || []));
    const hit = users.filter(u => lolos.some(p => p.user.toLowerCase() === u.toLowerCase()) && !diSeleksi.has(u.toLowerCase()) && !sudahDihitung.has(u.toLowerCase()));
    if (hit.length) { a.tambahSkuad = hit.length; a.dihitung = hit.map(u => u.toLowerCase()); }
  } else if (b.jenis === 'seleksi') {
    const u = String(b.pemain || '').replace(/^@/, ''), k = komenDari(u) || {}, p = lolos.find(x => x.user.toLowerCase() === u.toLowerCase());
    const pos = (p && p.posisi) || k.posisi || 'CMF', aktor = pastikan(u, pos), tes = b.tes || 'umpan', warna = WARNA[hash(u) % WARNA.length];
    if (!a.baris.length) a.baris = [{ oleh: 'jack', teks: `Tes: ${(p && p.nama) || k.nama || u}, ${POSISI[pos] || pos}.` }];
    Object.assign(a, { lokasi: 'TES · ' + ({ lari: 'LARI SAYAP', sundul: 'DUEL UDARA', umpan: 'UMPAN', tembak: 'TENDANGAN', kiper: 'KIPER' }[tes] || 'SELEKSI'), aktor, min: 5.5 });
    if (tes === 'tembak') { a.tembak = { penendang: aktor, hasil: 'gol' }; a.sfx = [[1.0, 'tendang'], [1.5, 'jaring']]; }
    else if (tes === 'kiper') { pastikan('elmermuhandis_', 'CF'); a.tembak = { penendang: 'jay', kiper: aktor, hasil: 'tangkap' }; a.sfx = [[1.0, 'tendang'], [1.5, 'tangkap']]; }
    else { a.tes = tes; if (tes === 'umpan') a.sfx = [[1.5, 'tendang'], [4.5, 'tendang']]; }
    a.pemain = { nama: String((p && p.nama) || k.nama || u).toUpperCase(), posisi: POSISI[pos] || pos, singkat: pos.slice(0, 3), warna, tunda: 0.5, cap: p ? (p.inti ? 'LOLOS' : 'CADANGAN') : (b.cap || 'CADANGAN'),
      warnaCap: !p || !p.inti ? '#7c3aed' : undefined, hitung: !!p, user: u, komen: bersih(k.teks || ''), stat: (b.stat || [['Teknik', 75], ['Fisik', 70], ['Semangat', 90]]).slice(0, 3) };
    ketukan.push(a.id);
  } else if (b.jenis === 'info') {
    Object.assign(a, { panggung: 'umum', lokasi3d: 'lapangan', kartu: { jenis: { merah: 'peringatan', hijau: 'sukses', ungu: 'target' }[b.warna] || 'target', tunda: 0.3, judul: String(b.judul || '').toUpperCase().slice(0, 22), sub: b.sub || '', isi: (b.isi || []).slice(0, 4) } });
  } else if (b.jenis === 'papan_skuad') {
    a.panggung = 'skuad';
    a.barisan = skuadAkhir.map(p => pastikan(p.user, p.posisi));
    const urut = skuadAkhir.filter(p => p.status !== 'cadangan').concat(skuadAkhir.filter(p => p.status === 'cadangan'));
    const sel0 = p => ({ pos: p.posisi + (p.status === 'cadangan' ? ' · cad.' : ''), nama: p.nama, warna: WARNA[hash(p.user) % WARNA.length], baru: !!p.baru });
    const inti = urut.filter(p => p.status !== 'cadangan').map(sel0).concat(slotAkhir.map(s => ({ pos: s })));
    const cad = urut.filter(p => p.status === 'cadangan').map(sel0);
    let sel = inti.concat(cad);
    if (sel.length > 11) { const muat = Math.max(0, 10 - inti.length); const sisa = cad.length - muat; sel = inti.slice(0, 10).concat(cad.slice(0, muat), [{ pos: 'CADANGAN', nama: `+${sisa} lagi`, warna: '#7c3aed' }]); }
    a.papan = sel.concat([{ pos: '', kamu: true }]);
    a.papanJudul = `${skuadAkhir.length} / ${target(skuadAkhir.length)}`;
    a.sfx = [[0.3, 'ding']]; a.min = 5;
  } else if (b.jenis === 'jersey') {
    Object.assign(a, { panggung: 'umum', lokasi3d: 'lapangan', jersey: (b.opsi || []).slice(0, 3), min: 6.5, sfx: [[0.5, 'ding']] });
  } else if (b.jenis === 'laga') {
    const ad = b.adegan || 'serang';
    const LBL = { lorong: 'LORONG PEMAIN', keluar: 'MASUK LAPANGAN', barisan: 'LINE-UP', kickoff: 'KICK-OFF', serang: 'PERTANDINGAN', golLawan: 'GOL LAWAN', golKita: 'GOL!', penalti: 'PENALTI', golTikus: 'GOL TIKUS?!', turunMinum: 'TURUN MINUM' };
    Object.assign(a, { lokasi: b.skor ? null : (LBL[ad] || 'PERTANDINGAN'), min: ad === 'golLawan' ? 5 : ad === 'golTikus' ? 6 : 4.5 });
    if (ad === 'golKita') { a.tembak = { penendang: pastikan(b.pemain || 'elmermuhandis_', 'CF'), kiper: 'rival', hasil: 'gol' }; a.sfx = [[1.0, 'tendang'], [1.5, 'jaring'], [1.7, 'peluit']]; }
    else if (ad === 'penalti') { a.panggung = 'penalti'; a.sfx = [[0.3, 'peluit']]; }
    else { a.panggung = 'laga'; a.laga = { jenis: ad, variasi: b.variasi || 1 }; a.suasana = ad === 'lorong' ? 'dalam' : 'pagi'; a.sfx = ad === 'kickoff' ? [[1.2, 'peluit']] : ad === 'golLawan' ? [[2.4, 'tendang'], [2.85, 'jaring']] : ad === 'golTikus' ? [[2.0, 'tendang'], [2.35, 'tangkap'], [3.4, 'jaring'], [3.75, 'peluit']] : []; }
    if (b.lineup) { a.lineup = b.lineup; a.min = 7; }
    if (b.skor) a.skor = b.skor; if (b.menit) a.menit = b.menit;
    const GOL = { golLawan: 2.85, golTikus: 3.45, golKita: 1.5 };
    if (GOL[ad] != null && b.skor) { a.golPada = GOL[ad]; a.golLawan = ad === 'golLawan'; a.skorAwal = skorTerakhir || [0, 0]; }
    if (b.skor) skorTerakhir = b.skor;
    if (!['lorong', 'keluar', 'barisan'].includes(ad)) ketukan.push(a.id);
  } else if (b.jenis === 'lolos') {
    const diSeleksi = new Set(R.beat.filter(x => x.jenis === 'seleksi').map(x => String(x.pemain || '').replace(/^@/, '').toLowerCase()));
    const sudahDihitung = new Set(adegan.flatMap(x => x.dihitung || []));
    const daftar = lolos.slice(0, 10);
    Object.assign(a, { panggung: 'umum', lokasi3d: 'lapangan', lokasi: 'HASIL SELEKSI', min: 4 + daftar.length * 0.35,
      lolosList: daftar.map(p => ({ nama: String(p.nama || p.user).toUpperCase(), user: p.user, pos: p.posisi, inti: p.inti, warna: WARNA[hash(p.user) % WARNA.length] })),
      sfx: daftar.map((_, i) => [0.7 + i * 0.25, 'ding']) });
    const hit = daftar.map(p => p.user.toLowerCase()).filter(u => !diSeleksi.has(u) && !sudahDihitung.has(u));
    if (hit.length) { a.tambahSkuad = hit.length; a.dihitung = hit; }
    ketukan.push(a.id);
  } else if (b.jenis === 'ultras') {
    const users = [...new Set((b.users || []).map(u => String(u).replace(/^@/, '')))].slice(0, 8);
    const lama = new Set(ULTRAS.anggota.map(x => x.toLowerCase()));
    const total = ULTRAS.anggota.length + users.filter(u => !lama.has(u.toLowerCase())).length;
    Object.assign(a, { panggung: 'umum', lokasi3d: 'tribun', lokasi: 'TRIBUN · ULTRAS', min: 5.5,
      ultras: { nama: String(R.nama_ultras || ULTRAS.nama || 'ULTRAS YONOHA').toUpperCase(), anggota: users.map(u => ({ user: u, warna: WARNA[hash(u) % WARNA.length] })), total, nyanyian: bersih(b.nyanyian || '') },
      sfx: users.map((_, i) => [0.8 + i * 0.3, 'ding']) });
    ketukan.push(a.id);
  } else if (b.jenis === 'voting') {
    Object.assign(a, { panggung: 'umum', lokasi3d: 'lapangan', voting: { pertanyaan: b.pertanyaan, opsi: (b.opsi || []).slice(0, 3) }, min: 5.5, sfx: [[0.3, 'ding']] });
  } else if (b.jenis === 'latihan') {
    const akt = b.aktivitas || 'pemanasan';
    if (akt === 'pemanasan') Object.assign(a, { id: 'pemanasan', lokasi: 'LATIHAN · PEMANASAN', sfx: [[0.2, 'peluit']] });
    else if (akt === 'umpan') Object.assign(a, { id: 'umpan', lokasi: 'LATIHAN · UMPAN', penghitung: { label: 'UMPAN NYAMBUNG', tiap: 1.0, mulai: 0.5 }, sfx: [[0.5, 'tendang'], [1.5, 'tendang'], [2.5, 'tendang'], [3.5, 'tendang']] });
    else if (akt === 'tembak') Object.assign(a, { lokasi: 'LATIHAN · TEMBAKAN', tembak: { penendang: 'jay', kiper: 'radhika', hasil: 'tepis' }, sfx: [[1.0, 'tendang'], [1.5, 'tangkap']] });
    else Object.assign(a, { panggung: 'masalah', lokasi: 'LATIHAN · GIM MINI', sfx: [[0.6, 'tendang']] });
    ketukan.push(a.id);
  } else if (b.jenis === 'bersambung') {
    Object.assign(a, { id: 'penutup', teaser: bersih(b.teaser || ''), min: 4.5 });
  } else {
    Object.assign(a, { panggung: 'umum', lokasi3d: 'lapangan' }); // jenis lain (pertandingan/klasemen) belum ada bloknya
  }
  adegan.push(a);
}

// ---------- rakit episode ----------
const n = (k, d) => k.replace(/^(.)/, c => c.toUpperCase());
const vote = R.beat.find(b => b.jenis === 'voting' || b.jenis === 'jersey');
const hurufVote = vote ? (vote.opsi || []).map(o => o.huruf).join(', ').replace(/, ([^,]*)$/, ' atau $1') : '';
const hari = STATUS.laga_berikutnya && STATUS.laga_berikutnya.day ? Math.max(0, STATUS.laga_berikutnya.day - DAY) : null;
const ep = {
  seri: 'Manajer dari Nol', episode: DAY, judul: `DAY ${DAY} — ${R.judul}`, subjudul: `DAY ${DAY} · ${String(R.judul).toUpperCase()}`,
  fps: 30, ukuran: [1080, 1920], suara: SUARA, otomatis: true, sumber_rencana: `cerita/rencana/day-${String(DAY).padStart(2, '0')}.json`,
  hookCepat: true, tanpaJudul: true, hookTeks: (R.hook_teks || []).map(s => bersih(s).toUpperCase()).slice(0, 2),
  skuadAwal: STATUS.skuad.length, skuadMaks: SKUAD_MAKS, musikHangat: 'semua', ketukan,
  seragam: STATUS.seragam || null, pemain_data: pemainData, adegan,
  akhir: {
    judul: slotAkhir.length ? 'AYO GABUNG!' : 'GABUNG ULTRAS!', posisi: slotAkhir.length ? slotAkhir.map(s => (POSISI[s] || s).toUpperCase()) : ['KOMEN "ULTRAS"'],
    tombol: vote ? `KOMEN: ${hurufVote}` : 'FOLLOW + KOMEN: DAFTAR',
    baris2: 'Follow @ai_bareng_el biar nggak ketinggalan',
    status: `Skuad ${skuadAkhir.length}/${target(skuadAkhir.length)}` +(hari != null ? ` · uji coba ${hari} hari lagi` : '')
  },
  caption: R.caption
};
{
  const cari = slotAkhir.length ? `DICARI PEMAIN:  ${slotAkhir.map(s => (POSISI[s] || s).toUpperCase()).join('  •  ')}  •  FOLLOW @ai_bareng_el + KOMEN "DAFTAR – NAMA – POSISI"  •  `
    : skuadAkhir.length < SKUAD_MAKS ? `SKUAD ${skuadAkhir.length}/${SKUAD_MAKS}  •  MASIH BUKA CADANGAN: KOMEN "DAFTAR – NAMA – POSISI"  •  ` : '';
  const ultras = `GABUNG ULTRAS ${String(ULTRAS.nama || 'YONOHA').toUpperCase()}: KOMEN "ULTRAS"  •  `;
  ep.ticker = { teks: cari + ultras, dari: adegan[1] ? adegan[1].id : adegan[0].id, sampai: adegan[adegan.length - 2].id };
}

// pemeriksaan akhir
const ids = adegan.map(a => a.id); const kembar = ids.filter((x, i) => ids.indexOf(x) !== i);
if (kembar.length) throw new Error('id adegan kembar: ' + kembar.join(','));
adegan.forEach((a, i) => {
  if (a.baris.length) return;
  const b = R.beat[i], cadangan = {
    jersey: `Tiga desain jersey. Kalian yang pilih: ${hurufVote}?`,
    voting: String((b && b.pertanyaan) || 'Kalian pilih yang mana?'),
    papan_skuad: `Skuad sekarang ${skuadAkhir.length}. ` + (slotAkhir.length ? `Tinggal ${slotAkhir.length} slot lagi.` : 'Sebelas pemain, lengkap!'),
    komentar: 'Kalian komen... kalian jadi pemain.',
    lolos: `${lolos.length} pemain baru resmi gabung Yonoha!`,
    ultras: 'Tribun ini nggak sepi lagi. Selamat datang, ultras!',
    info: String((b && b.judul) || ''),
    latihan: 'Latihan dulu, biar nggak malu-maluin.',
    cold_open: 'Ini bukan hari biasa di Yonoha.',
    bersambung: 'Dan ternyata... ini baru permulaan.'
  }[b && b.jenis] || 'Dan cerita berlanjut...';
  a.baris = [{ oleh: 'jack', teks: cadangan, tts: ucap(cadangan) }];
});
const out = path.join(ROOT, 'episodes', `episode-${String(DAY).padStart(2, '0')}.json`);
fs.writeFileSync(out, JSON.stringify(ep, null, 2));
console.log(`Naskah: ${out}\n${adegan.map(a => `  ${a.id} ${a.panggung || a.tes || (a.tembak ? 'tembak' : '')} | ${a.baris.map(b => b.oleh + ': ' + b.teks).join(' / ')}`).join('\n')}`);
