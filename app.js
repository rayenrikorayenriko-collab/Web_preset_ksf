/* =========================================================
   Kessoku Family — versi statis (tanpa server).
   Web 1 (member) + Web 2 (panel setting) dalam satu halaman.
   Data & media disimpan di Supabase (Postgres + Storage).
   Ikon memakai vector (SVG sprite di index.html).
   ========================================================= */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (sec) => { if (!sec && sec !== 0) return '0:00'; sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
const trackFilename = (track) => ((track.title || 'musik').replace(/[\\/:*?"<>|]/g, '').trim() || 'musik') + '.mp3';
function forceDownloadUrl(url, filename) {
  try {
    const out = new URL(url, window.location.href);
    out.searchParams.set('download', filename);
    return out.toString();
  } catch (e) { return url; }
}
const ic = (n, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = (p) => (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------------- konfigurasi & klien Supabase ---------------- */
const CFG = window.KF_CONFIG || {};
const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true }
});
const TABLE = 'kf_data';

/* ---------------- motion: GSAP (ScrollTrigger) + Lenis ---------------- */
const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const HAS_GSAP = !REDUCED && !!(window.gsap && window.ScrollTrigger);
const HAS_LENIS = !REDUCED && !!window.Lenis;
let lenis = null, motionReady = false;
const stInstances = [];
if (HAS_GSAP) {
  window.gsap.registerPlugin(window.ScrollTrigger);
  document.documentElement.classList.add('gsap-ready', 'motion-pending');
}

function defaults() {
  return {
    settings: {
      siteTitle: 'Kessoku Family', siteTagline: 'Preview & Rekomendasi Musik',
      siteDescription: 'Kumpulan preview karya dan rekomendasi musik pilihan buat keluarga Kessoku. Pilih kategori di bawah untuk mulai menjelajah.',
      logoUrl: '', accentColor: '#111114', footerText: '© Kessoku Family'
    },
    categories: [], previews: [], banners: [], music: []
  };
}
function normalize(d) {
  const out = defaults();
  if (!d || typeof d !== 'object') return out;
  out.settings = Object.assign(out.settings, d.settings || {});
  ['categories', 'previews', 'banners', 'music'].forEach((k) => { out[k] = Array.isArray(d[k]) ? d[k] : []; });
  return out;
}

let DB = defaults();
let activeTab = 'settings';
let currentAudio = null, currentTrackId = null;
let lastUpdated = 0, lastWriteAt = 0;
const state = { previewMedia: {}, music: {}, bannerMedia: {} };

/* ---------------- util UI ---------------- */
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('show', 'hidden');
  clearTimeout(t._t); clearTimeout(t._hideT);
  requestAnimationFrame(() => t.classList.add('show'));
  t._t = setTimeout(() => {
    t.classList.remove('show');
    t._hideT = setTimeout(() => { if (!t.classList.contains('show')) t.classList.add('hidden'); }, 350);
  }, 2200);
}
function setSaveState(s) { $('#saveState').textContent = s || ''; }

const layerTimers = new WeakMap();
function showLayer(el) {
  clearTimeout(layerTimers.get(el));
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  el.classList.remove('is-open');
  requestAnimationFrame(() => el.classList.add('is-open'));
  syncScrollLock();
}
function hideLayer(el) {
  clearTimeout(layerTimers.get(el));
  el.classList.remove('is-open');
  el.setAttribute('aria-hidden', 'true');
  layerTimers.set(el, setTimeout(() => {
    if (!el.classList.contains('is-open')) { el.classList.add('hidden'); syncScrollLock(); }
  }, 260));
}

/* kalau ada overlay terbuka: kunci scroll halaman + hentikan Lenis */
function anyLayerOpen() {
  return ['#loginModal', '#adminPanel', '#modal'].some((s) => {
    const el = $(s); return el && !el.classList.contains('hidden');
  });
}
function syncScrollLock() {
  const open = anyLayerOpen();
  document.body.classList.toggle('no-scroll', open);
  if (lenis) { open ? lenis.stop() : lenis.start(); }
}

/* =========================================================
   PENYIMPANAN (Supabase)
   ========================================================= */
async function fetchDB() {
  const { data, error } = await sb.from(TABLE).select('data, updated_at').eq('id', 1).maybeSingle();
  if (error) throw error;
  if (data && data.updated_at) lastUpdated = data.updated_at;
  return normalize(data && data.data);
}
async function saveDB(next) {
  DB = normalize(next);
  renderPublic();
  setSaveState('Menyimpan...');
  lastWriteAt = Date.now();
  const { data, error } = await sb.from(TABLE)
    .update({ data: DB, updated_at: new Date().toISOString() }).eq('id', 1)
    .select('updated_at').maybeSingle();
  if (error) { setSaveState(''); throw error; }
  if (data && data.updated_at) lastUpdated = data.updated_at;
  setSaveState('Tersimpan');
}

/* =========================================================
   BAGIAN WEB 1 — tampilan publik
   ========================================================= */
function renderPublic() {
  const s = DB.settings || {};
  document.documentElement.style.setProperty('--accent', s.accentColor || '#111114');
  document.title = s.siteTitle || 'Kessoku Family';
  $('#brandName').textContent = s.siteTitle || 'Kessoku Family';
  /* judul hero: hanya tulis ulang kalau teksnya berubah (biar animasi per kata tetap utuh) */
  const titleTxt = s.siteTitle || 'Kessoku Family';
  const ht = $('#heroTitle');
  if (ht && ht.dataset.txt !== titleTxt) { ht.dataset.txt = titleTxt; ht.textContent = titleTxt; ht.dataset.split = ''; }
  $('#heroTagline').textContent = s.siteTagline || '';
  $('#heroDesc').textContent = s.siteDescription || '';
  $('#footerText').textContent = s.footerText || ('© ' + (s.siteTitle || 'Kessoku Family'));
  const logo = $('#brandLogo');
  if (s.logoUrl) { logo.src = s.logoUrl; logo.classList.remove('hidden'); }
  else { logo.classList.add('hidden'); logo.removeAttribute('src'); }

  renderBanners(); renderCategories(); renderMusic();
  observeReveal();
  scheduleMotion();
}

/* Banner: maksimal satu, format tampil 16:9, di bawah bar kategori */
function renderBanners() {
  const wrap = $('#bannerSection'), box = $('#bannerWrap');
  const b = (DB.banners || [])[0];
  if (!b) { wrap.classList.add('hidden'); box.innerHTML = ''; return; }
  wrap.classList.remove('hidden');
  const m = b.media || {};
  let inner;
  if (m.url && m.type === 'video') inner = `<video src="${esc(m.url)}" muted playsinline autoplay loop></video>`;
  else if (m.url) inner = `<img src="${esc(m.url)}" alt="${esc(b.title || '')}" />`;
  else inner = `<span class="banner-empty">${ic('image')} Belum ada media banner</span>`;
  const cap = b.title ? `<div class="banner-cap">${esc(b.title)}</div>` : '';
  box.innerHTML = b.link
    ? `<a class="banner-item" href="${esc(b.link)}" target="_blank" rel="noopener">${inner}${cap}</a>`
    : `<div class="banner-item">${inner}${cap}</div>`;
}

function renderCategories() {
  const cats = (DB.categories || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const bar = $('#catBar');
  bar.innerHTML = `<button class="chip active" data-target="sections">Semua</button>` +
    cats.map((c) => `<button class="chip" data-target="cat-${esc(c.id)}">${esc(c.name)}</button>`).join('');
  bar.querySelectorAll('.chip').forEach((ch) => ch.addEventListener('click', () => {
    bar.querySelectorAll('.chip').forEach((x) => x.classList.remove('active')); ch.classList.add('active');
    const el = document.getElementById(ch.dataset.target); if (el) goTo(el, -134);
  }));
  const wrap = $('#sections');
  if (!cats.length) { wrap.innerHTML = `<p class="empty lined">Belum ada kategori. Admin bisa menambahkannya dari panel Setting.</p>`; return; }
  wrap.innerHTML = cats.map((c) => {
    const items = (DB.previews || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0)).filter((p) => p.categoryId === c.id);
    const cards = items.length ? items.map((p, i) => cardHTML(p, i)).join('') : `<p class="empty lined">Belum ada preview di kategori ini.</p>`;
    return `<section id="cat-${esc(c.id)}" class="section-block">
      <div class="section-head reveal"><h2 class="split">${esc(c.name)}</h2>${c.description ? `<p>${esc(c.description)}</p>` : ''}</div>
      <div class="rail-wrap">
        <button class="rail-nav prev" type="button" data-rail="prev" aria-label="Geser ke kiri">${ic('arrow-left')}</button>
        <div class="rail" data-lenis-prevent>${cards}</div>
        <button class="rail-nav next" type="button" data-rail="next" aria-label="Geser ke kanan">${ic('arrow')}</button>
      </div></section>`;
  }).join('');
  wireRails(wrap);
  wireVideoControls(wrap);
}

/* tombol geser (prev/next) untuk setiap baris preview */
function wireRails(scope) {
  scope.querySelectorAll('.rail-wrap').forEach((wrap) => {
    const rail = wrap.querySelector('.rail');
    if (!rail) return;
    const prev = wrap.querySelector('.rail-nav.prev'), next = wrap.querySelector('.rail-nav.next');
    const step = () => Math.max(240, rail.clientWidth * 0.82);
    if (prev) prev.addEventListener('click', () => rail.scrollBy({ left: -step(), behavior: 'smooth' }));
    if (next) next.addEventListener('click', () => rail.scrollBy({ left: step(), behavior: 'smooth' }));
    const upd = () => {
      const max = rail.scrollWidth - rail.clientWidth;
      if (prev) prev.classList.toggle('is-off', rail.scrollLeft <= 4);
      if (next) next.classList.toggle('is-off', max <= 3 || rail.scrollLeft >= max - 4);
    };
    rail.addEventListener('scroll', upd, { passive: true });
    window.addEventListener('resize', upd, { passive: true });
    upd();
  });
}
function wireVideoControls(scope) {
  scope.querySelectorAll('.video-media').forEach((frame) => {
    const video = frame.querySelector('video');
    const button = frame.querySelector('[data-media-toggle]');
    if (!video || !button) return;
    const sync = () => {
      const playing = !video.paused && !video.ended;
      frame.classList.toggle('is-playing', playing);
      button.innerHTML = ic(playing ? 'pause' : 'play');
      button.setAttribute('aria-label', playing ? 'Jeda preview' : 'Putar preview');
      button.title = playing ? 'Jeda preview' : 'Putar preview';
    };
    button.addEventListener('click', async () => {
      if (video.paused) {
        scope.querySelectorAll('.video-media video').forEach((other) => {
          if (other !== video) other.pause();
        });
        try { await video.play(); }
        catch (e) { toast('Video preview tidak bisa diputar.'); }
      } else video.pause();
      sync();
    });
    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    video.addEventListener('ended', sync);
    sync();
  });
}
function cardHTML(p, i) {
  const m = p.media || {};
  let media = `<div class="placeholder">${ic('image')}<span>Belum ada media</span></div>`;
  if (m.url && m.type === 'video') media = `<video src="${esc(m.url)}" playsinline preload="metadata"${m.poster ? ` poster="${esc(m.poster)}"` : ''}></video>
    <button class="media-toggle" type="button" data-media-toggle aria-label="Putar preview" title="Putar preview">${ic('play')}</button>`;
  else if (m.url) media = `<img src="${esc(m.url)}" alt="${esc(p.title)}" loading="lazy" />`;
  const btns = (p.buttons || []).filter((b) => b && b.label)
    .map((b, k) => `<a class="card-btn${k % 2 ? ' alt' : ''}" href="${esc(b.url || '#')}" target="_blank" rel="noopener">${esc(b.label)}${ic('arrow')}</a>`).join('');
  const ratio = p.size && p.size !== 'auto' ? p.size.replace(':', '/') : '';
  return `<article class="card" style="animation-delay:${Math.min(i * 60, 400)}ms">
    <div class="card-media${ratio ? ' ratio' : ''}${m.url && m.type === 'video' ? ' video-media' : ''}"${ratio ? ` style="aspect-ratio:${ratio}"` : ''}>${media}</div>
    <div class="card-body">
      <h3 class="card-title">${esc(p.title || 'Tanpa judul')}</h3>
      ${p.description ? `<p class="card-desc">${esc(p.description)}</p>` : ''}
      ${btns ? `<div class="card-buttons">${btns}</div>` : ''}
    </div></article>`;
}

function renderMusic() {
  const list = $('#musicList'), music = (DB.music || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  $('#musicEmpty').classList.toggle('hidden', music.length > 0);
  list.innerHTML = music.map((t, i) => `
    <div class="track" data-id="${esc(t.id)}" style="animation-delay:${Math.min(i * 50, 350)}ms">
      ${t.cover ? `<img class="track-cover" src="${esc(t.cover)}" alt="" />` : `<div class="track-cover">${ic('headphones')}</div>`}
      <button class="icon-btn play" data-act="play" title="Putar">${ic('play')}</button>
      <div class="track-main">
        <p class="track-title">${esc(t.title || 'Tanpa judul')}</p>
        <p class="track-desc">${esc(t.description || '')}</p>
        <div class="track-progress" data-act="seek"><span></span></div>
      </div>
      <span class="track-time" data-time>${fmt(t.duration)}</span>
      <a class="dl-btn" href="${esc(forceDownloadUrl(t.url, trackFilename(t)))}" download="${esc(trackFilename(t))}">${ic('download')} Download MP3</a>
    </div>`).join('');
  list.querySelectorAll('.track').forEach((row) => {
    const track = music.find((x) => x.id === row.dataset.id);
    const btn = row.querySelector('[data-act="play"]'), bar = row.querySelector('[data-act="seek"]');
    const fill = bar.querySelector('span'), timeEl = row.querySelector('[data-time]');
    btn.addEventListener('click', () => togglePlay(track, row, btn, fill, timeEl));
    bar.addEventListener('click', (e) => {
      if (!currentAudio || currentTrackId !== track.id) return;
      const rect = bar.getBoundingClientRect();
      if (currentAudio.duration) currentAudio.currentTime = ((e.clientX - rect.left) / rect.width) * currentAudio.duration;
    });
  });
}
function togglePlay(track, row, btn, fill, timeEl) {
  if (currentTrackId === track.id && currentAudio) {
    if (currentAudio.paused) { currentAudio.play(); btn.innerHTML = ic('pause'); } else { currentAudio.pause(); btn.innerHTML = ic('play'); }
    return;
  }
  if (currentAudio) currentAudio.pause();
  $$('.track').forEach((r) => { r.classList.remove('track-playing'); const b = r.querySelector('[data-act="play"]'); if (b) b.innerHTML = ic('play'); const f = r.querySelector('[data-act="seek"] span'); if (f) f.style.width = '0%'; });
  currentAudio = new Audio(track.url); currentTrackId = track.id;
  row.classList.add('track-playing'); btn.innerHTML = ic('pause'); currentAudio.play().catch(() => { });
  currentAudio.addEventListener('timeupdate', () => {
    const d = currentAudio.duration || track.duration || 0;
    if (d) fill.style.width = (currentAudio.currentTime / d) * 100 + '%';
    timeEl.textContent = fmt(currentAudio.currentTime) + ' / ' + fmt(d);
  });
  currentAudio.addEventListener('ended', () => { btn.innerHTML = ic('play'); row.classList.remove('track-playing'); timeEl.textContent = fmt(track.duration); fill.style.width = '0%'; });
}

/* reveal on scroll */
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
function observeReveal() { $$('.reveal:not(.in)').forEach((el) => io.observe(el)); }

/* =========================================================
   LOGIN + PANEL SETTING (Web 2)
   ========================================================= */
function openLogin() {
  $('#loginErr').textContent = '';
  showLayer($('#loginModal'));
  setTimeout(() => $('#loginPass').focus(), 80);
}
function closeLogin() { hideLayer($('#loginModal')); $('#loginPass').value = ''; }

$('#openSettings').addEventListener('click', ensureAuth);
$('#loginCancel').addEventListener('click', closeLogin);
$('#loginModal').addEventListener('click', (e) => { if (e.target.id === 'loginModal') closeLogin(); });
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = String(CFG.adminEmail || '').trim();
  const pass = $('#loginPass').value;
  $('#loginErr').textContent = '';
  if (!email) { $('#loginErr').textContent = 'Email admin belum diatur di config.js'; return; }
  if (!pass) return;
  const btn = $('#loginForm button[type=submit]');
  btn.disabled = true;
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) {
      const m = error.message || '';
      if (m === 'Invalid login credentials') throw new Error('Password salah atau akun admin di config.js tidak cocok dengan Supabase.');
      if (/not confirmed/i.test(m)) throw new Error('User belum dikonfirmasi. Di Supabase, buka user itu -> Confirm / aktifkan Auto Confirm.');
      throw new Error(m);
    }
    closeLogin(); await openAdmin();
  } catch (err) { $('#loginErr').textContent = err.message || 'Gagal masuk'; }
  finally { btn.disabled = false; }
});
$('#closeAdmin').addEventListener('click', () => hideLayer($('#adminPanel')));
$('#logout').addEventListener('click', doLogout);
async function doLogout() { try { await sb.auth.signOut(); } catch (e) { } hideLayer($('#adminPanel')); closeLogin(); }

async function ensureAuth() {
  try {
    const { data } = await sb.auth.getSession();
    if (data && data.session) return openAdmin();
  } catch (e) { }
  openLogin();
}
async function openAdmin() {
  try { DB = await fetchDB(); } catch (e) { toast('Gagal memuat data: ' + (e.message || e)); }
  showLayer($('#adminPanel'));
  renderPanel();
}

$('#sideNav').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]'); if (!b) return;
  activeTab = b.dataset.tab;
  $$('#sideNav button').forEach((x) => x.classList.toggle('active', x === b));
  $('#topTitle').textContent = b.textContent.trim();
  renderPanel();
});

function renderPanel() {
  if (!$('#panel')) return;
  $('#panel').innerHTML = activeTab === 'settings' ? viewSettings()
    : activeTab === 'categories' ? viewCategories()
      : activeTab === 'previews' ? viewPreviews()
        : activeTab === 'banners' ? viewBanners() : viewMusic();
  bindPanel();
}
function bindPanel() {
  if (activeTab === 'settings') {
    $('#saveSettings').addEventListener('click', saveSettings);
    $('#s-logo-up').addEventListener('click', () => pickUpload((info) => {
      if (info.url) {
        $('#s-logo').value = info.url;
        $('#s-logo-status').textContent = 'Logo siap: ' + info.name;
        toast('Logo siap, jangan lupa Simpan');
      }
    }, 'image/*'));
  }
  if (activeTab === 'categories') $('#addCat').addEventListener('click', () => openCategoryEditor(null));
  if (activeTab === 'previews') $('#addPreview').addEventListener('click', () => openPreviewEditor(null));
  if (activeTab === 'banners') $('#editBanner').addEventListener('click', () => openBannerEditor((DB.banners || [])[0] || null));
  if (activeTab === 'music') $('#addMusic').addEventListener('click', () => openMusicEditor(null));
}
$('#panel').addEventListener('click', (e) => {
  const mv = e.target.closest('[data-move]'); if (mv) { moveItem(mv.dataset.id, mv.dataset.move); return; }
  const dl = e.target.closest('[data-del]'); if (dl) { deleteItem(dl.dataset.del, dl.dataset.id); return; }
  const ec = e.target.closest('[data-edit-cat]'); if (ec) { openCategoryEditor(DB.categories.find((c) => c.id === ec.dataset.editCat)); return; }
  const ep = e.target.closest('[data-edit-preview]'); if (ep) { openPreviewEditor(DB.previews.find((x) => x.id === ep.dataset.editPreview)); return; }
  const em = e.target.closest('[data-edit-music]'); if (em) { openMusicEditor(DB.music.find((x) => x.id === em.dataset.editMusic)); return; }
});

/* baris tombol aksi yang sering dipakai */
const moveBtns = (id, i, len) =>
  `<button class="btn small" data-move="up" data-id="${id}" title="Naik" ${i === 0 ? 'disabled' : ''}>${ic('up')}</button>
   <button class="btn small" data-move="down" data-id="${id}" title="Turun" ${i === len - 1 ? 'disabled' : ''}>${ic('down')}</button>`;

/* ----- Pengaturan ----- */
function viewSettings() {
  const s = DB.settings || {};
  return `<div class="pcard">
    <h2>Pengaturan Situs</h2>
    <p class="hint">Judul, keterangan, warna aksen &amp; logo yang tampil di halaman member. Perubahan langsung tersinkron ke semua device.</p>
    <div class="row">
      <div class="field"><label>Judul Web</label><input id="s-title" type="text" value="${esc(s.siteTitle)}" /></div>
      <div class="field"><label>Tagline</label><input id="s-tag" type="text" value="${esc(s.siteTagline)}" /></div>
    </div>
    <div class="field"><label>Deskripsi / Keterangan</label><textarea id="s-desc">${esc(s.siteDescription)}</textarea></div>
    <div class="row">
      <div class="field"><label>Warna Aksen</label><input id="s-accent" type="color" value="${esc(s.accentColor || '#111114')}" /></div>
      <div class="field"><label>Teks Footer</label><input id="s-footer" type="text" value="${esc(s.footerText)}" /></div>
    </div>
    <div class="field"><label>Logo <span class="sub">— opsional, URL file disimpan otomatis</span></label>
      <input id="s-logo" type="hidden" value="${esc(s.logoUrl)}" />
      <p id="s-logo-status" class="sub">${s.logoUrl ? 'Logo sudah tersimpan.' : 'Belum ada logo.'}</p>
      <div class="uploader" id="s-logo-up">${ic('upload')} Upload logo (png/jpg)</div>
    </div>
    <button class="btn primary" id="saveSettings">${ic('save')} Simpan Pengaturan</button>
  </div>`;
}
/* ----- Kategori ----- */
function viewCategories() {
  const cats = (DB.categories || []).slice().sort((a, b) => a.order - b.order);
  const rows = cats.length ? cats.map((c, i) => `
    <div class="item"><div class="thumb">${ic('folder')}</div>
      <div class="meta"><strong>${esc(c.name)}</strong><span>${esc(c.description || '')}</span>
        <span style="margin-top:6px">${(DB.previews || []).filter((p) => p.categoryId === c.id).length} preview</span></div>
      <div class="acts">${moveBtns(c.id, i, cats.length)}
        <button class="btn small" data-edit-cat="${c.id}">${ic('pencil')} Edit</button>
        <button class="btn small danger" data-del="categories" data-id="${c.id}">${ic('trash')} Hapus</button>
      </div></div>`).join('') : `<div class="empty lined">Belum ada kategori.</div>`;
  return `<div class="pcard"><div class="list-head">
      <div><h2>Kategori</h2><p class="hint" style="margin:0">Muncul sebagai bar di Web 1 dan jadi tempat preview.</p></div>
      <button class="btn primary" id="addCat">${ic('plus')} Tambah Kategori</button></div>${rows}</div>`;
}
/* ----- Preview ----- */
function viewPreviews() {
  const catName = (id) => (DB.categories.find((c) => c.id === id) || {}).name || '(tanpa kategori)';
  const items = (DB.previews || []).slice().sort((a, b) => a.order - b.order);
  const rows = items.length ? items.map((p, i) => {
    const m = p.media || {};
    const thumb = m.url && m.type !== 'video' ? `<img class="thumb" src="${esc(m.url)}" />`
      : `<div class="thumb">${ic(m.type === 'video' ? 'film' : 'image')}</div>`;
    return `<div class="item">${thumb}
      <div class="meta"><strong>${esc(p.title || 'Tanpa judul')}</strong><span>${esc(p.description || '')}</span>
        <span style="margin-top:6px"><span class="tag">${esc(catName(p.categoryId))}</span> &nbsp; ${(p.buttons || []).length} tombol</span></div>
      <div class="acts">${moveBtns(p.id, i, items.length)}
        <button class="btn small" data-edit-preview="${p.id}">${ic('pencil')} Edit</button>
        <button class="btn small danger" data-del="previews" data-id="${p.id}">${ic('trash')} Hapus</button>
      </div></div>`;
  }).join('') : `<div class="empty lined">Belum ada preview.</div>`;
  return `<div class="pcard"><div class="list-head">
      <div><h2>Preview &amp; Tombol</h2><p class="hint" style="margin:0">Media (video/foto) + penjelasan + tombol (bisa banyak) + kategori.</p></div>
      <button class="btn primary" id="addPreview">${ic('plus')} Tambah Preview</button></div>${rows}</div>`;
}
/* ----- Banner (maks 1, 16:9) ----- */
function viewBanners() {
  const b = (DB.banners || [])[0];
  const m = b && b.media ? b.media : {};
  let prev = `${ic('image')} Belum ada banner`;
  if (m.url && m.type === 'video') prev = `<video src="${esc(m.url)}" muted playsinline></video>`;
  else if (m.url) prev = `<img src="${esc(m.url)}" alt="" />`;
  return `<div class="pcard">
    <div class="list-head">
      <div><h2>Banner</h2><p class="hint" style="margin:0">Cuma satu banner, tampil rapi di bawah bar kategori. Format otomatis 16:9.</p></div>
      <button class="btn primary" id="editBanner">${ic(b ? 'pencil' : 'plus')} ${b ? 'Edit Banner' : 'Tambah Banner'}</button>
    </div>
    <div class="banner-preview">${prev}</div>
    ${b ? `<div class="grid-hint">${ic('bulb')} ${esc(b.title || '(tanpa judul)')}${b.link ? ' · Tautan aktif' : ''}</div>
      <div style="margin-top:14px"><button class="btn small danger" data-del="banners" data-id="${b.id}">${ic('trash')} Hapus banner</button></div>` : ''}
  </div>`;
}
/* ----- Musik ----- */
function viewMusic() {
  const items = (DB.music || []).slice().sort((a, b) => a.order - b.order);
  const rows = items.length ? items.map((t, i) => `
    <div class="item">${t.cover ? `<img class="thumb" src="${esc(t.cover)}" />` : `<div class="thumb">${ic('headphones')}</div>`}
      <div class="meta"><strong>${esc(t.title || 'Tanpa judul')}</strong><span>${esc(t.description || '')}</span>
        <span style="margin-top:6px"><span class="tag">${fmt(t.duration)}</span></span></div>
      <div class="acts">${moveBtns(t.id, i, items.length)}
        <button class="btn small" data-edit-music="${t.id}">${ic('pencil')} Edit</button>
        <button class="btn small danger" data-del="music" data-id="${t.id}">${ic('trash')} Hapus</button>
      </div></div>`).join('') : `<div class="empty lined">Belum ada musik.</div>`;
  return `<div class="pcard"><div class="list-head">
      <div><h2>Rekomendasi Musik</h2><p class="hint" style="margin:0">Upload musik apa saja → durasi otomatis. Member bisa putar &amp; download (MP3).</p></div>
      <button class="btn primary" id="addMusic">${ic('plus')} Tambah Musik</button></div>${rows}</div>`;
}

/* ----- CRUD ----- */
async function moveItem(id, dir) {
  const map = { categories: DB.categories, previews: DB.previews, music: DB.music };
  for (const key of Object.keys(map)) {
    const arr = map[key]; if (!arr || !arr.find((x) => x.id === id)) continue;
    const next = clone(DB);
    const sorted = next[key].slice().sort((a, b) => a.order - b.order);
    const i = sorted.findIndex((x) => x.id === id), j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    sorted.forEach((x, k) => { x.order = k; });
    try { await saveDB(next); renderPanel(); toast('Urutan diperbarui'); }
    catch (e) { toast('Gagal: ' + (e.message || e)); }
    return;
  }
}
async function deleteItem(collection, id) {
  if (!confirm('Hapus item ini?')) return;
  const next = clone(DB);
  next[collection] = next[collection].filter((x) => x.id !== id);
  if (collection === 'categories') next.previews = next.previews.filter((p) => p.categoryId !== id);
  try { await saveDB(next); renderPanel(); toast('Dihapus'); }
  catch (e) { toast('Gagal: ' + (e.message || e)); }
}

/* ----- modal ----- */
let modalSave = null;
function openModal(title, bodyHTML, onSave, saveLabel) {
  $('#modalTitle').textContent = title; $('#modalBody').innerHTML = bodyHTML;
  $('#modalSave').textContent = saveLabel || 'Simpan'; modalSave = onSave;
  showLayer($('#modal'));
}
function closeModal() { hideLayer($('#modal')); modalSave = null; }
$('#modalClose').addEventListener('click', closeModal);
$('#modalCancel').addEventListener('click', closeModal);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
$('#modalSave').addEventListener('click', async () => {
  if (!modalSave) return; $('#modalSave').disabled = true; setSaveState('Menyimpan...');
  try { await modalSave(); closeModal(); renderPanel(); setSaveState('Tersimpan'); toast('Tersimpan'); }
  catch (err) { setSaveState(''); toast('Gagal: ' + (err.message || err)); }
  finally { $('#modalSave').disabled = false; }
});

/* ---------------- upload ke Supabase Storage ---------------- */
function kindOf(file) {
  const t = file.type || '';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  const ext = (file.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'].includes(ext)) return 'image';
  if (['.mp4', '.webm', '.mov', '.mkv', '.m4v'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'].includes(ext)) return 'audio';
  return 'file';
}
async function uploadToStorage(file) {
  const ext = (file.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
  const path = 'm/' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + ext;
  const { error } = await sb.storage.from(CFG.bucket).upload(path, file, {
    cacheControl: '31536000', upsert: false, contentType: file.type || undefined
  });
  if (error) throw error;
  const { data } = sb.storage.from(CFG.bucket).getPublicUrl(path);
  return data.publicUrl;
}
function imageSize(url) { return new Promise((res) => { const i = new Image(); i.onload = () => res({ width: i.naturalWidth, height: i.naturalHeight }); i.onerror = () => res(null); i.src = url; }); }
function videoMeta(url) { return new Promise((res) => { const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true; v.onloadedmetadata = () => res({ width: v.videoWidth, height: v.videoHeight, duration: v.duration }); v.onerror = () => res(null); v.src = url; }); }
function audioMeta(url) { return new Promise((res) => { const a = document.createElement('audio'); a.preload = 'metadata'; a.onloadedmetadata = () => res({ duration: a.duration }); a.onerror = () => res(null); a.src = url; }); }

async function handleUpload(file) {
  const kind = kindOf(file);
  const out = { name: file.name, kind };
  let target = file;
  if (kind === 'audio') target = await toMp3(file); /* best-effort, kalau gagal pakai file asli */
  out.url = await uploadToStorage(target);
  if (kind === 'image') { const s = await imageSize(out.url); if (s) out.size = s; }
  else if (kind === 'video') { const m = await videoMeta(out.url); if (m) { out.size = { width: m.width, height: m.height }; out.duration = m.duration ? Math.round(m.duration) : null; } }
  else if (kind === 'audio') { const a = await audioMeta(out.url); if (a) out.duration = a.duration ? Math.round(a.duration) : null; }
  return out;
}
function pickUpload(onDone, accept) {
  const inp = document.createElement('input'); inp.type = 'file'; if (accept) inp.accept = accept;
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    toast('Mengunggah...');
    try { onDone(await handleUpload(f)); }
    catch (e) { toast('Upload gagal: ' + (e.message || e)); }
  };
  inp.click();
}

/* ---------------- konversi audio -> MP3 (best effort, di browser) ---------------- */
function loadLame() {
  if (window.lamejs) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}
function encodeMp3(audio) {
  const ch = Math.min(2, audio.numberOfChannels), sr = audio.sampleRate;
  const enc = new window.lamejs.Mp3Encoder(ch, sr, 128);
  const L = audio.getChannelData(0), R = ch > 1 ? audio.getChannelData(1) : null;
  const block = 1152, parts = [];
  const l16 = new Int16Array(block), r16 = ch > 1 ? new Int16Array(block) : null;
  for (let i = 0; i < L.length; i += block) {
    const n = Math.min(block, L.length - i);
    for (let j = 0; j < n; j++) {
      l16[j] = Math.max(-1, Math.min(1, L[i + j])) * 32767;
      if (r16) r16[j] = Math.max(-1, Math.min(1, R[i + j])) * 32767;
    }
    const sl = n < block ? l16.subarray(0, n) : l16;
    const sr2 = r16 ? (n < block ? r16.subarray(0, n) : r16) : null;
    const buf = ch > 1 ? enc.encodeBuffer(sl, sr2) : enc.encodeBuffer(sl);
    if (buf.length) parts.push(new Int8Array(buf));
  }
  const end = enc.flush(); if (end.length) parts.push(new Int8Array(end));
  return new Blob(parts, { type: 'audio/mpeg' });
}
async function toMp3(file) {
  if (file.type === 'audio/mpeg' || /\.mp3$/i.test(file.name)) return file;
  if (file.size > 25 * 1024 * 1024) return file; /* terlalu besar untuk dikonversi di HP */
  let ctx;
  try {
    await loadLame();
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    const buf = await file.arrayBuffer();
    const audio = await ctx.decodeAudioData(buf.slice(0));
    const blob = encodeMp3(audio);
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.mp3', { type: 'audio/mpeg' });
  } catch (e) {
    return file;
  } finally { if (ctx && ctx.close) try { ctx.close(); } catch (e) { } }
}

/* ---------------- editor ---------------- */
function uploaderHTML(id, label) { return `<div class="uploader" id="${id}">${ic('upload')} ${label}</div>`; }
function wireUploader(id, onDone, accept) { const el = document.getElementById(id); if (el) el.addEventListener('click', () => pickUpload((info) => { el.classList.add('has'); onDone(info); }, accept)); }

/* ----- settings ----- */
async function saveSettings() {
  const next = clone(DB);
  next.settings = Object.assign({}, next.settings, {
    siteTitle: $('#s-title').value, siteTagline: $('#s-tag').value, siteDescription: $('#s-desc').value,
    accentColor: $('#s-accent').value, logoUrl: $('#s-logo').value, footerText: $('#s-footer').value
  });
  try { await saveDB(next); toast('Pengaturan disimpan'); }
  catch (e) { toast('Gagal: ' + (e.message || e)); }
}

/* ----- kategori editor ----- */
function openCategoryEditor(cat) {
  const c = cat || { name: '', description: '' };
  openModal(cat ? 'Edit Kategori' : 'Tambah Kategori', `
    <div class="field"><label>Nama Kategori</label><input id="c-name" type="text" value="${esc(c.name)}" placeholder="cth: Music Covers" /></div>
    <div class="field"><label>Keterangan</label><textarea id="c-desc">${esc(c.description || '')}</textarea></div>`,
    async () => {
      const name = $('#c-name').value.trim(); if (!name) throw new Error('Nama wajib diisi');
      const next = clone(DB);
      const item = { id: c.id, name, description: $('#c-desc').value };
      if (!item.id) { item.id = uid('cat'); item.order = next.categories.length; next.categories.push(item); }
      else { const i = next.categories.findIndex((x) => x.id === item.id); next.categories[i] = Object.assign({}, next.categories[i], item); }
      await saveDB(next);
    });
}

/* ----- preview editor ----- */
function openPreviewEditor(preview) {
  const p = preview || { title: '', description: '', categoryId: (DB.categories[0] || {}).id || '', media: {}, buttons: [] };
  state.previewMedia = Object.assign({}, p.media || {});
  const catOpts = (DB.categories || []).map((c) => `<option value="${c.id}" ${c.id === p.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const sizes = ['auto', '16:9', '9:16', '1:1', '4:3', '3:2'];
  const sizeOpts = sizes.map((s) => `<option value="${s}" ${(p.size || 'auto') === s ? 'selected' : ''}>${s === 'auto' ? 'Otomatis (sesuai media)' : s}</option>`).join('');
  openModal(preview ? 'Edit Preview' : 'Tambah Preview', `
    <div class="field"><label>Judul Preview</label><input id="p-title" type="text" value="${esc(p.title)}" /></div>
    <div class="row">
      <div class="field"><label>Kategori</label><select id="p-cat">${catOpts || '<option value="">(buat kategori dulu)</option>'}</select></div>
      <div class="field"><label>Ukuran Tampilan</label><select id="p-size">${sizeOpts}</select></div>
    </div>
    <div class="field"><label>Penjelasan <span class="sub">— bisa diedit</span></label><textarea id="p-desc">${esc(p.description || '')}</textarea></div>
    <div class="field"><label>Media (video / foto) <span class="sub">— ukuran otomatis menyesuaikan</span></label>
      ${uploaderHTML('p-up', 'Upload video atau foto')}
      <div id="p-media-info" class="sub" style="margin-top:8px">${p.media && p.media.url ? 'Media sudah ada' : 'Belum ada media'}</div></div>
    <div class="field"><label>Tombol <span class="sub">— teks &amp; link bisa diubah, bisa ditambah banyak</span></label>
      <div id="btnRows">${(p.buttons || []).map((b) => btnRowHTML(b.label, b.url)).join('')}</div>
      <button class="btn small" id="addBtnRow" type="button">${ic('plus')} Tambah Tombol</button></div>`,
    async () => {
      const title = $('#p-title').value.trim(); if (!title) throw new Error('Judul wajib diisi');
      const buttons = $$('#btnRows .btn-row').map((r) => ({ label: r.querySelector('.lbl').value.trim(), url: r.querySelector('.url').value.trim() })).filter((b) => b.label);
      const next = clone(DB);
      const item = { id: p.id, title, description: $('#p-desc').value, categoryId: $('#p-cat').value, size: $('#p-size').value, media: state.previewMedia, buttons };
      if (!item.id) { item.id = uid('prv'); item.order = next.previews.length; next.previews.push(item); }
      else { const i = next.previews.findIndex((x) => x.id === item.id); next.previews[i] = Object.assign({}, next.previews[i], item); }
      await saveDB(next);
    });
  wireUploader('p-up', (info) => {
    if (info.kind === 'audio') { toast('Ini file audio — pilih video/foto untuk preview'); return; }
    state.previewMedia = { type: info.kind, url: info.url, poster: info.poster || '', size: info.size || null };
    $('#p-media-info').textContent = info.name + (info.size ? ` (${info.size.width}x${info.size.height})` : '');
  }, 'video/*,image/*');
  wireBtnRows();
}
function btnRowHTML(label, url) {
  return `<div class="btn-row"><input class="lbl" type="text" placeholder="Teks tombol" value="${esc(label || '')}" />
    <input class="url" type="url" placeholder="https://link-tujuan" value="${esc(url || '')}" />
    <button class="btn small danger" type="button" data-rm title="Hapus">${ic('x')}</button></div>`;
}
function wireBtnRows() {
  const box = $('#btnRows');
  const bind = () => box.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => b.closest('.btn-row').remove(); });
  $('#addBtnRow').addEventListener('click', () => { box.insertAdjacentHTML('beforeend', btnRowHTML('', '')); bind(); });
  bind();
}

/* ----- musik editor ----- */
function openMusicEditor(track) {
  const t = track || { title: '', description: '', url: '', duration: null, cover: '' };
  state.music = Object.assign({}, t);
  openModal(track ? 'Edit Musik' : 'Tambah Musik', `
    <div class="field"><label>Judul Musik</label><input id="m-title" type="text" value="${esc(t.title)}" /></div>
    <div class="field"><label>Penjelasan</label><textarea id="m-desc">${esc(t.description || '')}</textarea></div>
    <div class="field"><label>File Musik <span class="sub">— durasi otomatis, otomatis jadi MP3</span></label>
      ${uploaderHTML('m-up', 'Upload musik (mp3/wav/m4a/...)')}
      <div id="m-info" class="sub" style="margin-top:8px">${t.url ? 'File sudah ada (' + (t.duration || '—') + 's)' : 'Belum ada file'}</div></div>
    <div class="field"><label>Cover <span class="sub">(opsional)</span></label>${uploaderHTML('m-cover', 'Upload gambar cover (opsional)')}</div>`,
    async () => {
      const title = $('#m-title').value.trim(); if (!title) throw new Error('Judul wajib diisi');
      if (!state.music.url) throw new Error('Upload file musik dulu');
      const next = clone(DB);
      const item = { id: t.id, title, description: $('#m-desc').value, url: state.music.url, duration: state.music.duration, cover: state.music.cover || '' };
      if (!item.id) { item.id = uid('mus'); item.order = next.music.length; next.music.push(item); }
      else { const i = next.music.findIndex((x) => x.id === item.id); next.music[i] = Object.assign({}, next.music[i], item); }
      await saveDB(next);
    });
  wireUploader('m-up', (info) => { state.music.url = info.url; state.music.duration = info.duration; $('#m-info').textContent = info.name + ' — durasi ' + (info.duration || '?') + ' detik'; }, 'audio/*');
  wireUploader('m-cover', (info) => { if (info.kind === 'image') { state.music.cover = info.url; toast('Cover siap'); } }, 'image/*');
}

/* ----- banner editor (tunggal, 16:9) ----- */
function openBannerEditor(banner) {
  const b = banner || { title: '', link: '', media: {} };
  state.bannerMedia = Object.assign({}, b.media || {});
  const m = b.media || {};
  const prev = m.url
    ? (m.type === 'video' ? `<video src="${esc(m.url)}" muted playsinline></video>` : `<img src="${esc(m.url)}" alt="" />`)
    : ic('image');
  openModal(banner ? 'Edit Banner' : 'Tambah Banner', `
    <div class="field"><label>Judul Banner <span class="sub">(opsional)</span></label><input id="b-title" type="text" value="${esc(b.title)}" /></div>
    <div class="field"><label>Link <span class="sub">(opsional — klik banner membuka link ini)</span></label><input id="b-link" type="url" value="${esc(b.link || '')}" placeholder="https://..." /></div>
    <div class="field"><label>Media Banner <span class="sub">— tampil 16:9</span></label>
      ${uploaderHTML('b-up', 'Upload gambar / video')}
      <div class="banner-preview" id="b-prev" style="margin-top:10px">${prev}</div>
    </div>`,
    async () => {
      const next = clone(DB);
      const existing = next.banners[0] || {};
      next.banners = [{ id: existing.id || uid('ban'), title: $('#b-title').value.trim(), link: $('#b-link').value.trim(), media: state.bannerMedia, order: 0 }];
      await saveDB(next);
    });
  wireUploader('b-up', (info) => {
    state.bannerMedia = { type: info.kind, url: info.url, poster: info.poster || '' };
    const p = $('#b-prev');
    p.innerHTML = info.kind === 'video' ? `<video src="${esc(info.url)}" muted playsinline></video>` : `<img src="${esc(info.url)}" alt="" />`;
  }, 'image/*,video/*');
}

/* =========================================================
   SINKRON REALTIME — perubahan langsung tampil di semua device
   ========================================================= */
function setLive(state, text) {
  const d = $('#liveDot'); if (!d) return;
  d.classList.toggle('off', !state);
  d.innerHTML = `<i></i> ${text}`;
}
function subscribe() {
  try {
    sb.channel('kf-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => {
        if (Date.now() - lastWriteAt < 1500) return; /* abaikan pantulan tulisan sendiri */
        refreshAll();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setLive(true, 'Live tersambung');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setLive(false, 'Menyambung ulang...');
      });
  } catch (e) { setLive(false, 'Menyambung ulang...'); }
}
function panelBusy() {
  const ae = document.activeElement;
  return ae && $('#panel') && $('#panel').contains(ae) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ae.tagName);
}
async function refreshAll() {
  try { DB = await fetchDB(); } catch (e) { return; }
  renderPublic();
  const panelOpen = $('#adminPanel').classList.contains('hidden') === false;
  const modalOpen = $('#modal').classList.contains('hidden') === false;
  if (panelOpen && !modalOpen && !panelBusy()) renderPanel();
}
/* cadangan kalau Realtime belum aktif: cek berkala yang sangat ringan */
async function pollOnce() {
  try {
    const { data } = await sb.from(TABLE).select('updated_at').eq('id', 1).maybeSingle();
    const t = data && data.updated_at;
    if (t && t !== lastUpdated) { lastUpdated = t; await refreshAll(); }
  } catch (e) { }
}

/* =========================================================
   MOTION — GSAP/ScrollTrigger (judul per kata) + Lenis (smooth scroll)
   Ringan & hormat pada "prefers-reduced-motion".
   ========================================================= */
function splitWords(el) {
  if (el.dataset.split === '1') return Array.from(el.querySelectorAll('.wd-i'));
  const text = (el.textContent || '').trim();
  if (!text) return [];
  el.dataset.split = '1';
  el.innerHTML = text.split(/\s+/)
    .map((w) => `<span class="wd"><span class="wd-i">${esc(w)}</span></span>`).join(' ');
  return Array.from(el.querySelectorAll('.wd-i'));
}

/* scroll halus ke sebuah elemen (lewat Lenis kalau ada) */
function goTo(el, offset) {
  if (!el) return;
  const y = el.getBoundingClientRect().top + window.scrollY + (offset || 0);
  if (lenis) lenis.scrollTo(y, { duration: 1.1 });
  else window.scrollTo({ top: y, behavior: 'smooth' });
}

function initLenis() {
  if (!HAS_LENIS) return;
  lenis = new window.Lenis({
    duration: 1.05,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    wheelMultiplier: 1,
    touchMultiplier: 1.6
  });
  if (HAS_GSAP) {
    lenis.on('scroll', window.ScrollTrigger.update);
    window.gsap.ticker.add((time) => lenis.raf(time * 1000));
    window.gsap.ticker.lagSmoothing(0);
  } else {
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
}

/* animasi judul: muncul per kata saat masuk viewport */
function animateHeading(el) {
  const g = window.gsap, ST = window.ScrollTrigger;
  const words = splitWords(el);
  if (!words.length) return;
  g.set(words, { yPercent: 120, opacity: 0 });
  document.documentElement.classList.remove('motion-pending');
  const run = () => g.to(words, { yPercent: 0, opacity: 1, duration: .85, ease: 'power3.out', stagger: .08, overwrite: true });
  stInstances.push(ST.create({ trigger: el, start: 'top 92%', once: true, onEnter: run }));
}

function buildMotion() {
  if (!HAS_GSAP) { motionReady = true; return; }
  const g = window.gsap, ST = window.ScrollTrigger;
  /* buang trigger yang elemennya sudah tidak ada di DOM */
  for (let i = stInstances.length - 1; i >= 0; i--) {
    if (!document.contains(stInstances[i].trigger)) { stInstances[i].kill(); stInstances.splice(i, 1); }
  }
  /* judul per kata */
  $$('h1.hero-title, .split').forEach((h) => { if (h.dataset.split !== '1') animateHeading(h); });
  /* barang yang muncul saat discroll */
  [['.section-head', 30], ['.rail .card', 40], ['.track', 24], ['.banner-item', 28], ['.music-section .empty', 20]].forEach(([sel, y]) => {
    $$(sel).forEach((el) => {
      if (el.dataset.motion === '1') return;
      el.dataset.motion = '1';
      g.set(el, { y, opacity: 0 });
      stInstances.push(ST.create({
        trigger: el, start: 'top 90%', once: true,
        onEnter: () => g.to(el, { y: 0, opacity: 1, duration: .7, ease: 'power3.out', overwrite: true })
      }));
    });
  });
  motionReady = true;
  ST.refresh();
}
let stTimer = 0;
function scheduleMotion() {
  if (!HAS_GSAP) return;
  clearTimeout(stTimer);
  stTimer = setTimeout(() => { if (motionReady || !lenis) buildMotion(); }, 60);
}

/* tautan anchor (#...) lewat Lenis biar mulus */
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href || href === '#') return;
  const target = document.querySelector(href);
  if (!target) return;
  e.preventDefault();
  goTo(target, -74);
});

/* =========================================================
   INIT
   ========================================================= */
let progressFrame = 0;
function updatePageProgress() {
  if (progressFrame) return;
  progressFrame = requestAnimationFrame(() => {
    progressFrame = 0;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
    $('#progressFill').style.transform = `scaleX(${ratio})`;
  });
}
window.addEventListener('scroll', () => {
  const n = $('#nav'); if (n) n.classList.toggle('scrolled', window.scrollY > 12);
  updatePageProgress();
}, { passive: true });
window.addEventListener('resize', updatePageProgress, { passive: true });

async function boot() {
  try { DB = await fetchDB(); }
  catch (e) {
    $('#sections').innerHTML = `<p class="empty lined">Gagal memuat data. Pastikan tabel &amp; bucket Supabase sudah dibuat (lihat setup.sql). Detail: ${esc(e.message || e)}</p>`;
  }
  renderPublic();
  initLenis();
  buildMotion();
  observeReveal();
  updatePageProgress();
  subscribe();
  setInterval(pollOnce, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pollOnce(); });
  window.addEventListener('load', () => { if (HAS_GSAP) window.ScrollTrigger.refresh(); });
  setTimeout(() => document.documentElement.classList.remove('motion-pending'), 2500);
  syncScrollLock();
}
boot();
