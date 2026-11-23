// Posting Reel ke Instagram (Graph API, upload langsung/resumable — tanpa hosting publik)
// Pakai:  node posting.js episodes/episode-06.json            (posting out/episode-06/episode-06.mp4 + caption dari JSON)
//         node posting.js episodes/episode-06.json --cek      (cek token & akun saja, tidak memposting)
//         node posting.js episodes/episode-06.json --paksa    (posting lagi walau episode ini sudah pernah diposting)
// Token TIDAK disimpan di kode: isi sendiri file video/.env  ->  META_IG_TOKEN=...   (lihat .env.contoh)
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const args = process.argv.slice(2);
const epPath = path.resolve(ROOT, args.find(a => a.endsWith('.json')) || '');
if (!fs.existsSync(epPath)) { console.error('File episode tidak ada: ' + epPath); process.exit(1); }
const EP = JSON.parse(fs.readFileSync(epPath, 'utf8'));
const NAME = path.basename(epPath, '.json');
const OUT = path.join(ROOT, 'out', NAME);
const VIDEO = path.join(OUT, NAME + '.mp4');
const LOG = path.join(OUT, 'posting.json');

// --- baca .env (tanpa library) ---
const env = {};
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const TOKEN = process.env.META_IG_TOKEN || env.META_IG_TOKEN;
const IG = process.env.IG_USER_ID || env.IG_USER_ID || '17841474398873049'; // @ai_bareng_el
const V = env.GRAPH_VERSION || 'v21.0';
const G = `https://graph.facebook.com/${V}`;
if (!TOKEN) { console.error('META_IG_TOKEN belum diisi di video/.env (lihat .env.contoh).'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(method, url, params) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
  u.searchParams.set('access_token', TOKEN);
  const r = await fetch(u, { method });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`${method} ${url.replace(G, '')} gagal: ` + (j.error ? `${j.error.message} (kode ${j.error.code})` : r.status));
  return j;
}

(async () => {
  const akun = await api('GET', `${G}/${IG}`, { fields: 'username,media_count' });
  console.log(`Akun: @${akun.username} (${akun.media_count} postingan)`);
  const batas = await api('GET', `${G}/${IG}/content_publishing_limit`, { fields: 'quota_usage,config' }).catch(() => null);
  if (batas && batas.data && batas.data[0]) console.log(`Kuota posting 24 jam: ${batas.data[0].quota_usage}/${(batas.data[0].config || {}).quota_total || '?'}`);
  if (args.includes('--cek')) { console.log('Cek OK — token bisa dipakai. (tidak memposting)'); return; }

  if (fs.existsSync(LOG) && !args.includes('--paksa')) {
    const l = JSON.parse(fs.readFileSync(LOG, 'utf8'));
    console.log(`Sudah pernah diposting ${l.waktu}: ${l.permalink}  (pakai --paksa untuk posting ulang)`); return;
  }
  if (!fs.existsSync(VIDEO)) { console.error('Video belum ada: ' + VIDEO + ' — render dulu.'); process.exit(1); }
  const caption = String(EP.caption || EP.judul || '').slice(0, 2200);
  const size = fs.statSync(VIDEO).size;
  console.log(`Video: ${path.basename(VIDEO)} (${(size / 1048576).toFixed(1)} MB)`);

  // 1) buat container Reel (upload langsung)
  const c = await api('POST', `${G}/${IG}/media`, { media_type: 'REELS', upload_type: 'resumable', caption, share_to_feed: 'true', thumb_offset: String(EP.sampulMs || 1500) });
  console.log('Container: ' + c.id);
  // 2) kirim file video
  const up = await fetch(c.uri || `https://rupload.facebook.com/ig-api-upload/${V}/${c.id}`, {
    method: 'POST', headers: { Authorization: 'OAuth ' + TOKEN, offset: '0', file_size: String(size) }, body: fs.readFileSync(VIDEO)
  });
  const uj = await up.json().catch(() => ({}));
  if (!up.ok || uj.success === false) throw new Error('Upload video gagal: ' + JSON.stringify(uj).slice(0, 300));
  console.log('Video terkirim, menunggu Instagram memproses...');
  // 3) tunggu FINISHED
  let st = {};
  for (let i = 0; i < 60; i++) {
    await sleep(10000);
    st = await api('GET', `${G}/${c.id}`, { fields: 'status_code,status' });
    process.stdout.write(`\r  status: ${st.status_code}   `);
    if (st.status_code === 'FINISHED') break;
    if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new Error('Instagram menolak video: ' + (st.status || st.status_code));
  }
  console.log('');
  if (st.status_code !== 'FINISHED') throw new Error('Proses Instagram terlalu lama (10 menit). Coba lagi nanti.');
  // 4) tayangkan
  const p = await api('POST', `${G}/${IG}/media_publish`, { creation_id: c.id });
  const info = await api('GET', `${G}/${p.id}`, { fields: 'permalink,timestamp' });
  fs.writeFileSync(LOG, JSON.stringify({ media_id: p.id, permalink: info.permalink, waktu: info.timestamp, episode: NAME }, null, 2));
  console.log('TAYANG: ' + info.permalink);
})().catch(e => { console.error('\nGAGAL: ' + e.message); process.exit(1); });
