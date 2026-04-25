'use strict';
 
// ── MATH ──────────────────────────────────────────────────────────────────
 
function modpow(base, exp, mod) {
  let r = 1n, b = ((base % mod) + mod) % mod;
  while (exp > 0n) {
    if (exp & 1n) r = r * b % mod;
    exp >>= 1n;
    b = b * b % mod;
  }
  return r;
}
 
function gcd(a, b) {
  a = a < 0n ? -a : a; b = b < 0n ? -b : b;
  while (b) { let t = b; b = a % b; a = t; }
  return a;
}
 
function isPrime(n) {
  if (n < 2n) return false;
  if (n < 4n) return true;
  if (n % 2n === 0n || n % 3n === 0n) return false;
  for (let i = 5n; i * i <= n; i += 6n)
    if (n % i === 0n || n % (i + 2n) === 0n) return false;
  return true;
}
 
function factorize(n) {
  const f = []; let d = 2n;
  while (d * d <= n) {
    if (n % d === 0n) { f.push(d); while (n % d === 0n) n /= d; }
    d++;
  }
  if (n > 1n) f.push(n);
  return f;
}
 
function isPrimRoot(g, p) {
  const pm1 = p - 1n, fs = factorize(pm1);
  for (const q of fs) if (modpow(BigInt(g), pm1 / q, p) === 1n) return false;
  return true;
}
 
function randCoprime(pm1) {
  let k;
  do { k = BigInt(Math.floor(Math.random() * (Number(pm1) - 2)) + 2); }
  while (gcd(k, pm1) !== 1n);
  return k;
}
 
function fmtSize(b) {
  if (b < 1024) return b + ' Б';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' КБ';
  return (b / 1048576).toFixed(2) + ' МБ';
}
 
function getMime(ext) {
  const m = {
    '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png',
    '.gif':'image/gif','.bmp':'image/bmp','.webp':'image/webp',
    '.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg',
    '.mp4':'video/mp4','.pdf':'application/pdf','.txt':'text/plain',
    '.zip':'application/zip',
    '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
  return m[(ext || '').toLowerCase()] || 'application/octet-stream';
}
 
// ── BINARY FORMAT ─────────────────────────────────────────────────────────
// .elg бинарный формат (при открытии в текстовом редакторе — нечитаемые символы):
// [4]  сигнатура "ELG!" (0x45 0x4C 0x47 0x21)
// [4]  p (uint32 big-endian)
// [4]  g (uint32 big-endian)
// [4]  y (uint32 big-endian)
// [1]  длина расширения N
// [N]  расширение ASCII (напр. ".jpg")
// [4]  количество пар
// [8*count]  пары: a (uint32) + b (uint32)
 
function buildElgBlob(p, g, y, ext, pairs) {
  const extBytes = new TextEncoder().encode(ext || '');
  const buf = new ArrayBuffer(4 + 4 + 4 + 4 + 1 + extBytes.length + 4 + pairs.length * 8);
  const v = new DataView(buf);
  let o = 0;
  v.setUint8(o++, 0x45); v.setUint8(o++, 0x4C);
  v.setUint8(o++, 0x47); v.setUint8(o++, 0x21);
  v.setUint32(o, Number(p), false); o += 4;
  v.setUint32(o, Number(g), false); o += 4;
  v.setUint32(o, Number(y), false); o += 4;
  v.setUint8(o++, extBytes.length);
  for (let i = 0; i < extBytes.length; i++) v.setUint8(o++, extBytes[i]);
  v.setUint32(o, pairs.length, false); o += 4;
  for (const { a, b } of pairs) {
    v.setUint32(o, Number(a), false); o += 4;
    v.setUint32(o, Number(b), false); o += 4;
  }
  return new Blob([buf], { type: 'application/octet-stream' });
}
 
function parseElgBlob(ab) {
  const v = new DataView(ab);
  if (v.byteLength < 18) throw new Error('Файл слишком мал или повреждён');
  if (v.getUint8(0) !== 0x45 || v.getUint8(1) !== 0x4C ||
      v.getUint8(2) !== 0x47 || v.getUint8(3) !== 0x21)
    throw new Error('Неверный формат: сигнатура ELG! не найдена. Убедитесь что загружаете .elg файл.');
  let o = 4;
  const p = BigInt(v.getUint32(o, false)); o += 4;
  const g = BigInt(v.getUint32(o, false)); o += 4;
  const y = BigInt(v.getUint32(o, false)); o += 4;
  const extLen = v.getUint8(o++);
  let ext = '';
  for (let i = 0; i < extLen; i++) ext += String.fromCharCode(v.getUint8(o++));
  const count = v.getUint32(o, false); o += 4;
  const pairs = [];
  for (let i = 0; i < count; i++) {
    const a = BigInt(v.getUint32(o, false)); o += 4;
    const b = BigInt(v.getUint32(o, false)); o += 4;
    pairs.push({ a, b });
  }
  return { p, g, y, ext, pairs };
}
 
// ── STATE ─────────────────────────────────────────────────────────────────
 
const S = {
  p: 0n, g: 0n, x: 0n, y: 0n, k0: 0n,
  encBytes: null, encExt: '', pairs: [],
  decArrayBuffer: null, decBytes: null, decExt: ''
};
 
// ── DOM ───────────────────────────────────────────────────────────────────
 
const $ = id => document.getElementById(id);
 
function msg(id, type, text) {
  const el = $(id);
  if (el) el.innerHTML = `<div class="msg msg-${type}">${text}</div>`;
}
 
function clr(id) { const el = $(id); if (el) el.innerHTML = ''; }
 
function cardState(id, state) {
  const el = $(id);
  if (!el) return;
  el.classList.remove('active', 'done');
  if (state) el.classList.add(state);
}
 
function tog(id) { $('c' + id === id ? id : 'c' + id)?.classList.toggle('open'); }
 
// fix: tog receives the full id like 'c1', 'cd1' etc
window.tog = function(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open');
};
 
function openCard(id) { const el = $(id); if (el) el.classList.add('open'); }
function hideAll(ids) { ids.forEach(id => { const e = $(id); if (e) e.style.display = 'none'; }); }
function show(id) { const e = $(id); if (e) e.style.display = 'block'; }
 
// ── TABS ──────────────────────────────────────────────────────────────────
 
window.switchTab = function(t) {
  document.querySelectorAll('.ntab').forEach((el, i) =>
    el.classList.toggle('on', ['enc', 'dec'][i] === t));
  document.querySelectorAll('.pane').forEach(el => el.classList.remove('on'));
  $('pane-' + t).classList.add('on');
};
 
// ── DRAG & DROP ───────────────────────────────────────────────────────────
 
window.dov = e => { e.preventDefault(); e.currentTarget.classList.add('over'); };
window.dlv = e => e.currentTarget.classList.remove('over');
window.ddr = (e, side) => {
  e.preventDefault();
  e.currentTarget.classList.remove('over');
  const f = e.dataTransfer.files[0];
  if (f) loadFile(f, side);
};
 
window.handleFile = (event, side) => {
  const f = event.target.files[0];
  if (f) loadFile(f, side);
};
 
function loadFile(file, side) {
  const badge = `<div class="file-badge">
    <span class="fname">${file.name}</span>
    <span class="fsize">${fmtSize(file.size)}</span>
  </div>`;
 
  const reader = new FileReader();
  reader.onload = ev => {
    if (side === 'enc') {
      S.encBytes = new Uint8Array(ev.target.result);
      S.encExt = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
      $('enc-fbadge').innerHTML = badge;
      $('enc-fbadge').style.display = 'block';
      cardState('c3', 'done');
      cardState('c4', 'active');
      openCard('c4');
    } else {
      // Важно: читаем как ArrayBuffer для бинарного формата
      S.decArrayBuffer = ev.target.result;
      $('dec-fbadge').innerHTML = badge;
      $('dec-fbadge').style.display = 'block';
      cardState('cd2', 'done');
      cardState('cd3', 'active');
      openCard('cd3');
    }
  };
  // Всегда читаем как ArrayBuffer — и для шифрования и для дешифрования
  reader.readAsArrayBuffer(file);
}
 
// ── STEP 1 ────────────────────────────────────────────────────────────────
 
window.findRoots = function() {
  clr('m1');
  const pv = $('ep').value.trim();
  if (!pv) { msg('m1', 'er', 'Введите значение p'); return; }
  const p = BigInt(pv);
  if (!isPrime(p)) { msg('m1', 'er', `${p} — не является простым числом`); return; }
  if (p < 5n)      { msg('m1', 'er', 'p слишком мало (минимум 5)'); return; }
  if (p < 257n)    { msg('m1', 'warn', `p = ${p} < 257 — рекомендуется p ≥ 257, иначе байты ≥ p не поместятся`); }
 
  const pm1 = p - 1n, facs = factorize(pm1);
  const lim = p > 3000n ? 3000n : p - 1n;
  const roots = [];
  for (let g = 2n; g <= lim; g++) if (isPrimRoot(g, p)) roots.push(g);
 
  if (!roots.length) { msg('m1', 'er', 'Первообразных корней не найдено'); return; }
 
  if (p >= 257n) msg('m1', 'ok',
    `p = ${p} ✓ &nbsp;|&nbsp; делители(p−1): ${facs.join(', ')} &nbsp;|&nbsp; корней: ${roots.length}${p > 3000n ? ' (g ≤ 3000)' : ''}`);
 
  const chips = $('rchips');
  chips.innerHTML = '';
  roots.slice(0, 80).forEach(r => {
    const c = document.createElement('button');
    c.className = 'chip'; c.textContent = String(r);
    c.onclick = () => {
      chips.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
      c.classList.add('on');
      $('eg').value = String(r);
      S.p = p;
    };
    chips.appendChild(c);
  });
 
  $('roots-note').textContent = `Условие: g^((p−1)/q) ≢ 1 (mod p) для каждого простого q | (p−1)`;
  cardState('c1', 'done'); cardState('c2', 'active'); openCard('c2');
 
  // Показать таблицу справа
  hideAll(['enc-empty','main-roots','main-key','main-enc']);
  show('main-roots');
  $('mr-p').textContent = String(p);
  $('mr-pm1').textContent = String(pm1);
  $('mr-facs').textContent = facs.join(' × ');
  $('mr-count').textContent = roots.length;
  const tbody = $('roots-tbody');
  tbody.innerHTML = '';
  roots.slice(0, 60).forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="tc">${i + 1}</td>
      <td class="ta">${r}</td>
      <td class="tc">${modpow(r, pm1 / facs[0], p)}</td>
      <td>${modpow(r, pm1, p) === 1n
        ? '<span style="color:var(--green)">✓ 1</span>'
        : '<span style="color:var(--red)">✗</span>'}</td>`;
    tbody.appendChild(tr);
  });
  if (roots.length > 60) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="4" class="tdim" style="text-align:center;padding:10px">... ещё ${roots.length - 60} корней</td>`;
    tbody.appendChild(tr);
  }
};
 
// ── STEP 2 ────────────────────────────────────────────────────────────────
 
window.buildKey = function() {
  clr('m2');
  const p  = BigInt($('ep').value || 0);
  const g  = BigInt($('eg').value || 0);
  const x  = BigInt($('ex').value || 0);
  const k0 = BigInt($('ek').value || 0);
 
  if (!isPrime(p))           { msg('m2','er','p не является простым'); return; }
  if (g < 2n || g >= p)     { msg('m2','er','g должно быть: 2 ≤ g < p'); return; }
  if (!isPrimRoot(g, p))    { msg('m2','er',`g = ${g} — не первообразный корень по mod ${p}`); return; }
  if (x <= 1n || x >= p-1n) { msg('m2','er','x должно быть: 1 < x < p−1'); return; }
  if (k0 <= 1n || k0 >= p-1n){ msg('m2','er','k должно быть: 1 < k < p−1'); return; }
  if (gcd(k0, p-1n) !== 1n) { msg('m2','er',`gcd(k, p−1) = ${gcd(k0,p-1n)} ≠ 1 — выберите другое k`); return; }
 
  const y = modpow(g, x, p);
  S.p = p; S.g = g; S.x = x; S.y = y; S.k0 = k0;
  msg('m2', 'ok', 'Ключ успешно построен');
  $('key-display').innerHTML = `<div class="key-box">
    y = g<sup>x</sup> mod p = ${g}<sup>${x}</sup> mod ${p} = <span class="v">${y}</span><br>
    Открытый ключ: (p = ${p}, g = ${g}, y = <span class="v">${y}</span>)<br>
    Закрытый ключ: x = <span class="v">${x}</span>
  </div>`;
  cardState('c2', 'done'); cardState('c3', 'active'); openCard('c3');
 
  hideAll(['enc-empty','main-roots','main-key','main-enc']);
  show('main-key');
  $('mk-pub').textContent = `(p=${p}, g=${g}, y=${y})`;
  $('mk-priv').textContent = `x = ${x}`;
  $('mk-k0').textContent = `k₁ = ${k0}`;
  $('mk-formula').innerHTML = `y = g<sup>x</sup> mod p = ${g}<sup>${x}</sup> mod ${p} = <span class="v">${y}</span>`;
};
 
// ── ENCRYPT ───────────────────────────────────────────────────────────────
 
window.doEncrypt = function() {
  clr('m4');
  if (!S.p || !S.g || !S.y) { msg('m4','er','Сначала выполните шаги 1 и 2'); return; }
  if (!S.encBytes)           { msg('m4','er','Загрузите файл (шаг 3)'); return; }
 
  const prog = $('enc-prog');
  prog.style.display = 'block'; prog.max = S.encBytes.length; prog.value = 0;
  S.pairs = [];
  let first = true;
 
  for (let i = 0; i < S.encBytes.length; i++) {
    const m = BigInt(S.encBytes[i]);
    const k = first ? S.k0 : randCoprime(S.p - 1n);
    first = false;
    const a = modpow(S.g, k, S.p);
    const b = m * modpow(S.y, k, S.p) % S.p;
    S.pairs.push({ m, k, a, b });
    if (i % 500 === 0) prog.value = i;
  }
  prog.style.display = 'none';
 
  const blob = buildElgBlob(S.p, S.g, S.y, S.encExt, S.pairs);
  msg('m4', 'ok', `Зашифровано ${S.pairs.length} байт → ${S.pairs.length} пар (a, b). Файл бинарный.`);
  $('btn-save-cipher').disabled = false;
  cardState('c4', 'done');
 
  hideAll(['enc-empty','main-roots','main-key','main-enc']);
  show('main-enc');
  $('me-orig').textContent  = fmtSize(S.encBytes.length);
  $('me-pairs').textContent = S.pairs.length;
  $('me-size').textContent  = fmtSize(blob.size);
  $('me-ext').textContent   = S.encExt || '—';
 
  const tbody = $('enc-tbody');
  tbody.innerHTML = '';
  const show30 = Math.min(S.pairs.length, 30);
  for (let i = 0; i < show30; i++) {
    const { m, k, a, b } = S.pairs[i];
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="tc">${i}</td>
      <td class="tc">${m}</td>
      <td class="tdim">${i === 0 ? k : '(случ.)'}</td>
      <td class="ta">${a}</td>
      <td class="tg">${b}</td>`;
    tbody.appendChild(tr);
  }
  if (S.pairs.length > 30) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5" class="tdim" style="text-align:center;padding:10px">... ещё ${S.pairs.length - 30} пар</td>`;
    tbody.appendChild(tr);
  }
};
 
window.saveCipher = function() {
  if (!S.pairs.length) return;
  dl(buildElgBlob(S.p, S.g, S.y, S.encExt, S.pairs), 'encrypted.elg');
};
 
// ── DECRYPT ───────────────────────────────────────────────────────────────
 
window.fillDec = function() {
  $('dp').value = String(S.p || '');
  $('dg').value = String(S.g || '');
  $('dx').value = String(S.x || '');
  if (S.pairs.length) {
    // Создаём blob и читаем его как ArrayBuffer
    const blob = buildElgBlob(S.p, S.g, S.y, S.encExt, S.pairs);
    const reader = new FileReader();
    reader.onload = ev => {
      S.decArrayBuffer = ev.target.result;
      $('dec-fbadge').innerHTML = `<div class="file-badge">
        <span class="fname">encrypted.elg</span>
        <span class="fsize">из текущего сеанса</span>
      </div>`;
      $('dec-fbadge').style.display = 'block';
    };
    reader.readAsArrayBuffer(blob);
  }
  msg('mdp', 'ok', 'Параметры заполнены из сеанса шифрования');
};
 
window.doDecrypt = function() {
  clr('mdc');
  const p = BigInt($('dp').value || 0);
  const x = BigInt($('dx').value || 0);
 
  if (!isPrime(p))           { msg('mdc','er','p не является простым'); return; }
  if (x <= 1n || x >= p-1n) { msg('mdc','er','x должно быть: 1 < x < p−1'); return; }
  if (!S.decArrayBuffer)     { msg('mdc','er','Загрузите .elg файл (шаг 2)'); return; }
 
  let parsed;
  try { parsed = parseElgBlob(S.decArrayBuffer); }
  catch (e) { msg('mdc','er', e.message); return; }
 
  const { pairs, ext } = parsed;
  const prog = $('dec-prog');
  prog.style.display = 'block'; prog.max = pairs.length; prog.value = 0;
 
  const out = new Uint8Array(pairs.length);
  const details = [];
 
  for (let i = 0; i < pairs.length; i++) {
    const { a, b } = pairs[i];
    const ax    = modpow(a, x, p);
    const axInv = modpow(ax, p - 2n, p); // теорема Ферма: ax^(p-2) = ax^(-1) mod p
    const m     = b * axInv % p;
    out[i] = Number(m);
    if (i < 30) details.push({ i, a, b, ax, m });
    if (i % 500 === 0) prog.value = i;
  }
 
  prog.style.display = 'none';
  S.decBytes = out; S.decExt = ext;
  msg('mdc', 'ok', `Расшифровано ${out.length} байт — нажмите "Сохранить файл"`);
  $('btn-save-dec').disabled = false;
 
  hideAll(['dec-empty','main-dec']);
  show('main-dec');
  $('md-pairs').textContent = pairs.length;
  $('md-bytes').textContent = out.length + ' Б';
  $('md-ext').textContent   = ext || 'неизвестен';
 
  const tbody = $('dec-tbody');
  tbody.innerHTML = '';
  details.forEach(({ i, a, b, ax, m }) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="tc">${i}</td>
      <td class="ta">${a}</td>
      <td class="tg">${b}</td>
      <td class="tdim">${ax}</td>
      <td class="tg">${m}</td>`;
    tbody.appendChild(tr);
  });
  if (pairs.length > 30) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5" class="tdim" style="text-align:center;padding:10px">... ещё ${pairs.length - 30} байт</td>`;
    tbody.appendChild(tr);
  }
};
 
window.saveDecrypted = function() {
  if (!S.decBytes) return;
  const ext = S.decExt || '';
  dl(new Blob([S.decBytes], { type: getMime(ext) }), 'decrypted' + ext);
};
 
// ── UTILS ─────────────────────────────────────────────────────────────────
 
function dl(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

window.switchTab = switchTab;
window.toggleStep = toggleStep;
window.findRoots = findRoots;
window.buildKey = buildKey;
window.doEncrypt = doEncrypt;
window.saveCipher = saveCipher;
window.fillDec = fillDec;
window.doDecrypt = doDecrypt;
window.saveDecrypted = saveDecrypted;
window.dov = dov;
window.dlv = dlv;
window.ddr = ddr;
window.handleFile = handleFile;
