/* Ex Libris — client app.
   Reads books.json. In edit mode it writes changes straight back to the GitHub repo
   via the contents API, so there is no server. The token lives only in this browser's
   localStorage and is never committed. */

const REPO = 'pikemalltech/ex-libris';
const FILE = 'books.json';
const API  = `https://api.github.com/repos/${REPO}/contents/${FILE}`;

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const STAR = '★★★★★';

const SHELVES = [
  ['all',      'Everything'],
  ['reading',  'Reading'],
  ['read',     'Read'],
  ['owned',    'Owned'],
  ['wishlist', 'Want to read'],
  ['unread',   'To read'],
];
const SHELF_LABEL = Object.fromEntries(SHELVES.map(([k, v]) => [k, v]));

let DATA = { books: [] }, shelf = 'all', shown = 0, view = [], sha = null;
const PAGE = 60;
const token = () => localStorage.getItem('exlibris_token');
const authed = () => !!token();

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hue = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const today = () => new Date().toISOString().slice(0, 10);

/* ---------- base64 that survives accented titles and 200KB payloads ---------- */
function toB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '', CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH)
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}
const fromB64 = b64 =>
  new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));

/* ---------- covers ---------- */
function placeholder(b) {
  const h = hue(b.title || '?');
  return `<div class="ph" style="--c1:hsl(${h} 34% 42%);--c2:hsl(${(h + 38) % 360} 30% 27%)">
            <span>${esc(b.title)}</span></div>`;
}
function coverHTML(b) {
  const ph = placeholder(b);
  if (!b.isbn) return ph;
  return ph + `<img loading="lazy" alt="" onerror="this.remove()"
    src="https://covers.openlibrary.org/b/isbn/${esc(b.isbn)}-M.jpg?default=false">`;
}
const stars = r => r ? `<div class="stars">${STAR.slice(0, r)}</div>` : '';

/* ---------- GitHub write path ---------- */
async function gh(method, body) {
  const res = await fetch(API + (method === 'GET' ? `?ref=main&t=${Date.now()}` : ''), {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    const err = new Error(`GitHub ${res.status}: ${t.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function recount(payload) {
  const c = { total: payload.books.length };
  const th = {};
  for (const b of payload.books) {
    const s = b.status || 'owned';
    c[s] = (c[s] || 0) + 1;
    const t = b.theme || 'Unsorted';
    th[t] = (th[t] || 0) + 1;
  }
  payload.counts = c;
  payload.themes = Object.fromEntries(Object.entries(th).sort((a, b) => b[1] - a[1]));
  payload.generated = today();
  return payload;
}

/* Applies `mutate` to the freshest copy of books.json and commits it.
   Retries on 409, which happens when the vault publishes while an edit is in flight. */
async function commit(mutate, message) {
  status('Saving…');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const file = await gh('GET');
      const payload = JSON.parse(fromB64(file.content));
      const result = mutate(payload);
      if (result === false) { status(''); return; }
      recount(payload);
      await gh('PUT', {
        message,
        content: toB64(JSON.stringify(payload)),
        sha: file.sha,
        branch: 'main',
      });
      DATA = payload;
      sha = null;
      render();
      paintCounts();
      status('Saved ✓', 2200);
      return;
    } catch (e) {
      if (e.status === 409 && attempt < 2) continue;     // someone else wrote; re-read
      console.error(e);
      status(e.status === 401 || e.status === 403
        ? 'Token rejected — check it has Contents: read & write on this repo.'
        : 'Save failed: ' + e.message, 6000);
      return;
    }
  }
}

let statusTimer;
function status(msg, clearAfter) {
  $('#status').textContent = msg;
  clearTimeout(statusTimer);
  if (clearAfter) statusTimer = setTimeout(() => ($('#status').textContent = ''), clearAfter);
}

/* ---------- rendering ---------- */
function card(b) {
  const badge = { read: 'READ', reading: 'READING', wishlist: 'WANT' }[b.status] || '';
  return `<button class="card" data-id="${esc(b.id)}">
    <div class="cover">${coverHTML(b)}${badge ? `<span class="badge">${badge}</span>` : ''}</div>
    <h3>${esc(b.title)}</h3>
    <p>${esc(b.author || '—')}</p>${stars(b.rating)}
  </button>`;
}

function matches(b, q) {
  if (shelf !== 'all' && (b.status || 'owned') !== shelf) return false;
  const t = $('#theme').value;
  if (t && b.theme !== t) return false;
  if (!q) return true;
  return `${b.title} ${b.subtitle || ''} ${b.author || ''} ${b.series || ''}`
    .toLowerCase().includes(q);
}

function sortBooks(list) {
  const last = b => (b.author || 'zzz').split(' ').pop().toLowerCase();
  return list.sort({
    author: (a, b) => last(a).localeCompare(last(b)) || a.title.localeCompare(b.title),
    title:  (a, b) => a.title.localeCompare(b.title),
    year:   (a, b) => (+b.year || 0) - (+a.year || 0) || a.title.localeCompare(b.title),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title),
    read:   (a, b) => String(b.date_read || '').localeCompare(String(a.date_read || '')) ||
                      a.title.localeCompare(b.title),
    added:  (a, b) => String(b.id).localeCompare(String(a.id)),
  }[$('#sort').value]);
}

function render(reset = true) {
  if (reset) {
    const q = $('#q').value.trim().toLowerCase();
    view = sortBooks(DATA.books.filter(b => matches(b, q)));
    shown = 0;
    $('#grid').innerHTML = '';
    $('#count').textContent = `${view.length} ${view.length === 1 ? 'book' : 'books'}`;
    if (!view.length) {
      $('#grid').innerHTML = '<p class="empty">Nothing on this shelf matches.</p>';
      return;
    }
  }
  const slice = view.slice(shown, shown + PAGE);
  $('#grid').insertAdjacentHTML('beforeend', slice.map(card).join(''));
  shown += slice.length;
}

function paintCounts() {
  const c = DATA.counts || {};
  $('#tagline').innerHTML =
    `<b>${c.total || 0}</b> books · <b>${c.read || 0}</b> read · <b>${c.owned || 0}</b> owned · ` +
    `<b>${c.wishlist || 0}</b> wanted`;
  $('#gen').textContent = 'Updated ' + (DATA.generated || '');
  $('#shelves').innerHTML = SHELVES
    .filter(([k]) => k === 'all' || c[k])
    .map(([k, label]) => `<button class="shelf" data-s="${k}" aria-pressed="${k === shelf}">
        ${label}<span class="n">${k === 'all' ? (c.total || 0) : c[k]}</span></button>`).join('');

  const themes = DATA.themes || {};
  const cur = $('#theme').value;
  $('#theme').innerHTML = '<option value="">All subjects</option>' +
    Object.keys(themes).map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  $('#theme').value = cur;

  const bar = (label, n, max) =>
    `<div class="bar"><span class="t">${label}</span>
       <span class="track"><span class="fill" style="width:${max ? n / max * 100 : 0}%"></span></span>
       <span class="v">${n}</span></div>`;
  const tmax = Math.max(1, ...Object.values(themes));
  $('#themebars').innerHTML = Object.entries(themes).map(([t, n]) => bar(esc(t), n, tmax)).join('');
  const rated = DATA.books.filter(b => b.rating);
  const dist = [5, 4, 3, 2, 1].map(r => [r, rated.filter(b => b.rating === r).length]);
  const rmax = Math.max(1, ...dist.map(x => x[1]));
  $('#ratebars').innerHTML = dist.map(([r, n]) => bar(STAR.slice(0, r), n, rmax)).join('');
  const avg = rated.length ? (rated.reduce((s, b) => s + b.rating, 0) / rated.length).toFixed(2) : '—';
  $('#ratenote').textContent =
    `${rated.length} of ${c.total || 0} books are rated (average ${avg}). Most of the library ` +
    `carries no rating — that means it was never recorded, not that the book went unread.`;
}

/* ---------- book detail / edit ---------- */
let editing = null;

function detail(b) {
  editing = b;
  const ro = [
    ['Author', b.author],
    ['Series', b.series ? b.series + (b.series_index ? ` · book ${b.series_index}` : '') : ''],
    ['Published', [b.publisher, b.year].filter(Boolean).join(', ')],
    ['Pages', b.pages],
    ['Subject', b.theme],
    ['ISBN', b.isbn],
  ].filter(r => r[1]);

  const shelfOpts = SHELVES.filter(([k]) => k !== 'all')
    .map(([k, l]) => `<option value="${k}"${(b.status || 'owned') === k ? ' selected' : ''}>${l}</option>`).join('');

  $('#dlg-in').innerHTML = `
    <div class="d-cover"><div class="cover">${coverHTML(b)}</div></div>
    <div class="d-body">
      <h2>${esc(b.title)}</h2>
      ${b.subtitle ? `<p class="by"><em>${esc(b.subtitle)}</em></p>` : ''}
      <dl>${ro.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      ${authed() ? `
        <div class="edit">
          <label>Shelf <select id="e-status">${shelfOpts}</select></label>
          <label>Rating <span class="rate" id="e-rate">${
            [1,2,3,4,5].map(n => `<button data-n="${n}" class="${b.rating >= n ? 'on' : ''}">★</button>`).join('')
          }<button data-n="0" class="clear" title="Clear rating">✕</button></span></label>
          <label>Started <input type="date" id="e-start" value="${esc(b.date_started || '')}"></label>
          <label>Finished <input type="date" id="e-read" value="${esc(b.date_read || '')}"></label>
          <div class="row">
            <button class="primary" id="e-save">Save</button>
            <button class="danger" id="e-del">Remove</button>
          </div>
        </div>` : `
        <dl class="ro-extra">
          ${b.status ? `<dt>Shelf</dt><dd>${SHELF_LABEL[b.status] || b.status}</dd>` : ''}
          ${b.rating ? `<dt>Rating</dt><dd>${STAR.slice(0, b.rating)}</dd>` : ''}
          ${b.date_started ? `<dt>Started</dt><dd>${esc(b.date_started)}</dd>` : ''}
          ${b.date_read ? `<dt>Finished</dt><dd>${esc(b.date_read)}</dd>` : ''}
        </dl>`}
    </div>`;
  $('#dlg').showModal();

  if (!authed()) return;
  let rating = b.rating || 0;
  $('#e-rate').addEventListener('click', e => {
    const btn = e.target.closest('button'); if (!btn) return;
    rating = +btn.dataset.n;
    $$('#e-rate button[data-n]').forEach(x =>
      x.classList.toggle('on', +x.dataset.n <= rating && +x.dataset.n > 0));
  });
  // Setting a finish date implies the book was read; nudge the shelf to match.
  $('#e-read').addEventListener('change', () => {
    if ($('#e-read').value && $('#e-status').value !== 'read') $('#e-status').value = 'read';
  });
  $('#e-save').addEventListener('click', async () => {
    const patch = {
      status: $('#e-status').value,
      rating: rating || undefined,
      date_started: $('#e-start').value || undefined,
      date_read: $('#e-read').value || undefined,
    };
    $('#dlg').close();
    await commit(p => {
      const t = p.books.find(x => x.id === b.id);
      if (!t) return false;
      for (const [k, v] of Object.entries(patch)) v === undefined ? delete t[k] : (t[k] = v);
      return true;
    }, `Update ${b.title}`);
  });
  $('#e-del').addEventListener('click', async () => {
    if (!confirm(`Remove “${b.title}” from the shelf?\n\nThis edits books.json. The note in your vault is not deleted.`)) return;
    $('#dlg').close();
    await commit(p => {
      const i = p.books.findIndex(x => x.id === b.id);
      if (i < 0) return false;
      p.books.splice(i, 1);
      return true;
    }, `Remove ${b.title}`);
  });
}

/* ---------- add a book ---------- */
const slug = s => s.replace(/[\\/:*?"<>|#^[\]]/g, '-').replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');

async function olSearch(q) {
  const url = 'https://openlibrary.org/search.json?' + new URLSearchParams({
    q, limit: '12',
    fields: 'title,subtitle,author_name,first_publish_year,isbn,cover_i,number_of_pages_median,publisher',
  });
  const r = await fetch(url);
  if (!r.ok) throw new Error('Open Library search failed');
  return (await r.json()).docs || [];
}

function openAdd() {
  $('#add-results').innerHTML = '';
  $('#add-q').value = '';
  $('#add').showModal();
  $('#add-q').focus();
}

async function runSearch() {
  const q = $('#add-q').value.trim();
  if (!q) return;
  $('#add-results').innerHTML = '<p class="empty">Searching…</p>';
  try {
    const docs = await olSearch(q);
    if (!docs.length) { $('#add-results').innerHTML = '<p class="empty">No matches.</p>'; return; }
    $('#add-results').innerHTML = docs.map((d, i) => `
      <button class="res" data-i="${i}">
        <div class="res-cover">${d.cover_i
          ? `<img loading="lazy" alt="" src="https://covers.openlibrary.org/b/id/${d.cover_i}-S.jpg">`
          : ''}</div>
        <span><b>${esc(d.title)}</b><br><small>${esc((d.author_name || ['Unknown'])[0])}${
          d.first_publish_year ? ' · ' + d.first_publish_year : ''}</small></span>
      </button>`).join('');
    $('#add-results').onclick = async e => {
      const el = e.target.closest('.res'); if (!el) return;
      const d = docs[+el.dataset.i];
      const shelfPick = $('#add-shelf').value;
      const isbns = d.isbn || [];
      const book = {
        id: slug(d.title),
        title: d.title,
        author: (d.author_name || [''])[0] || '',
        year: d.first_publish_year ? String(d.first_publish_year) : undefined,
        publisher: (d.publisher || [''])[0] || undefined,
        pages: d.number_of_pages_median || undefined,
        isbn: isbns.find(x => x.length === 13) || isbns[0],
        status: shelfPick,
        theme: 'Unsorted',
      };
      if (shelfPick === 'reading') book.date_started = today();
      if (shelfPick === 'read') book.date_read = today();
      Object.keys(book).forEach(k => book[k] === undefined && delete book[k]);
      $('#add').close();
      await commit(p => {
        if (p.books.some(b => b.id === book.id)) {
          let n = 2;
          while (p.books.some(b => b.id === `${book.id} (${n})`)) n++;
          book.id = `${book.id} (${n})`;
        }
        p.books.push(book);
        return true;
      }, `Add ${book.title}`);
    };
  } catch (err) {
    $('#add-results').innerHTML = `<p class="empty">${esc(err.message)}</p>`;
  }
}

/* ---------- auth ---------- */
function paintAuth() {
  $('#authbtn').textContent = authed() ? 'Editing on' : 'Edit';
  $('#authbtn').classList.toggle('on', authed());
  $('#addbtn').hidden = !authed();
}

async function signIn() {
  const t = prompt(
    'Paste a GitHub fine-grained personal access token.\n\n' +
    'It needs only:  Repository access → ' + REPO + '\n' +
    '                Permissions → Contents: Read and write\n\n' +
    'It is stored in this browser only, and never committed.');
  if (!t) return;
  localStorage.setItem('exlibris_token', t.trim());
  try {
    await gh('GET');
    paintAuth();
    status('Editing enabled ✓', 2500);
    await load(true);
  } catch (e) {
    localStorage.removeItem('exlibris_token');
    paintAuth();
    status('That token did not work: ' + e.message, 7000);
  }
}

/* ---------- boot ---------- */
async function load(fresh = false) {
  let payload;
  if (fresh && authed()) {
    payload = JSON.parse(fromB64((await gh('GET')).content));
  } else {
    payload = await (await fetch(`books.json?t=${Date.now()}`)).json();
  }
  DATA = payload;
  paintCounts();
  render();
}

$('#authbtn').addEventListener('click', () => {
  if (!authed()) return signIn();
  if (confirm('Turn off editing on this device and forget the token?')) {
    localStorage.removeItem('exlibris_token');
    paintAuth();
    status('Editing off', 2000);
  }
});
$('#addbtn').addEventListener('click', openAdd);
$('#add-go').addEventListener('click', runSearch);
$('#add-q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });
$$('.close').forEach(b => b.addEventListener('click', e => e.target.closest('dialog').close()));
$('#shelves').addEventListener('click', e => {
  const b = e.target.closest('.shelf'); if (!b) return;
  shelf = b.dataset.s;
  $$('#shelves .shelf').forEach(x => x.setAttribute('aria-pressed', x === b));
  render();
});
$('#grid').addEventListener('click', e => {
  const c = e.target.closest('.card'); if (!c) return;
  const b = DATA.books.find(x => x.id === c.dataset.id);
  if (b) detail(b);
});
let t; $('#q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(render, 120); });
$('#theme').addEventListener('change', () => render());
$('#sort').addEventListener('change', () => render());
new IntersectionObserver(es => {
  if (es[0].isIntersecting && shown < view.length) render(false);
}, { rootMargin: '600px' }).observe($('#sentinel'));

paintAuth();
load(authed());
