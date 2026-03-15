// ============================================================
// LFSR Stream Cipher
// Polynomial: P(x) = x^40 + x^21 + x^19 + x^2 + 1
// Taps: bits 40, 21, 19, 2
// Matches original C# implementation exactly
// ============================================================

const MASK64 = (1n << 64n) - 1n;

// One LFSR clock tick
// Mirrors C#:  key <<= 1;
//              key += ((key>>40)&1) ^ ((key>>21)&1) ^ ((key>>19)&1) ^ ((key>>2)&1);
function lfsrStep(key) {
  key = (key << 1n) & MASK64;
  const fb = ((key >> 40n) & 1n) ^ ((key >> 21n) & 1n)
           ^ ((key >> 19n) & 1n) ^ ((key >>  2n) & 1n);
  return { key: key | fb, fb: Number(fb), outBit: Number((key >> 40n) & 1n) };
}

// Generate one key byte (8 LFSR ticks, MSB first)
function getGenKeyByte(keyRef) {
  let gk = 0;
  for (let j = 0; j < 8; j++) {
    const r = lfsrStep(keyRef.val);
    keyRef.val = r.key;
    gk = ((gk << 1) | r.outBit) & 0xff;
  }
  return gk;
}

// ── Helpers ──────────────────────────────────────────────────

// Convert binary string of 0/1 (exactly 40 chars) to BigInt
function toUInt64(s) {
  let res = 0n, count = 0;
  for (let i = 0; i < s.length && count < 40; i++) {
    if (s[i] === '0' || s[i] === '1') {
      res = (res << 1n) | BigInt(s[i]);
      count++;
    }
  }
  return count === 40 ? res : null;
}

// Convert up to `count` bytes to a binary string
function toByteString(bytes, count) {
  let s = '';
  for (let i = 0; i < Math.min(count, bytes.length); i++) {
    let b = bytes[i];
    for (let j = 0; j < 8; j++) {
      s += (b & 0x80) ? '1' : '0';
      b = (b << 1) & 0xff;
    }
  }
  return s;
}

// Get the 40-bit register state as a binary string
function reg40str(key) {
  let s = '';
  for (let i = 39; i >= 0; i--) s += Number((key >> BigInt(i)) & 1n);
  return s;
}

function fmtSize(n) {
  if (n < 1024)    return n + ' Б';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' КБ';
  return (n / 1048576).toFixed(2) + ' МБ';
}

function downloadBlob(data, name) {
  const blob = new Blob([data]);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── App state ────────────────────────────────────────────────

let fileData    = null;
let fileName    = '';
let fileExt     = '';
let mode        = 'enc';   // 'enc' | 'dec'
let pendingDecrypt = null; // holds data while modal is open

// ── UI helpers ───────────────────────────────────────────────

function setStatus(type, msg) {
  document.getElementById('statusBar').className = 'status ' + type;
  document.getElementById('statusText').textContent = msg;
}

function updateActionBtn() {
  const keyOk = document.getElementById('tbKey').value.replace(/[^01]/g, '').length === 40;
  document.getElementById('btnAction').disabled = !(keyOk && fileData !== null);
}

// ── Mode ─────────────────────────────────────────────────────

function setMode(m) {
  mode = m;
  const isEnc = m === 'enc';

  document.getElementById('tabEnc').className = 'mode-tab' + (isEnc ? ' active-enc' : '');
  document.getElementById('tabDec').className = 'mode-tab' + (!isEnc ? ' active-dec' : '');

  const btn = document.getElementById('btnAction');
  btn.textContent = isEnc ? '🔒 Шифровать' : '🔓 Дешифровать';
  btn.className   = isEnc ? 'btn-green' : 'btn-purple';

  document.getElementById('labelOut').textContent = isEnc
    ? 'Зашифрованный файл — первые 8 байт (двоичный вид)'
    : 'Дешифрованный файл — первые 8 байт (двоичный вид)';
  document.getElementById('labelOut').className = 'field-label ' + (isEnc ? 'out-enc' : 'out-dec');
  document.getElementById('tbOut').className    = 'bin-field ' + (isEnc ? 'enc' : 'dec');

  document.getElementById('labelIn').textContent = isEnc
    ? 'Исходный файл — первые 8 байт (двоичный вид)'
    : 'Зашифрованный файл — первые 8 байт (двоичный вид)';

  resetFile();
}

function resetFile() {
  fileData = null;
  fileName = '';
  fileExt  = '';
  document.getElementById('fileInfo').style.display  = 'none';
  document.getElementById('saveInfo').style.display  = 'none';
  document.getElementById('tbIn').textContent     = '—';
  document.getElementById('tbGenKey').textContent = '—';
  document.getElementById('tbOut').textContent    = '—';
  document.getElementById('btnOpen').classList.remove('active');
  document.getElementById('tableWrap').innerHTML =
    '<div class="empty">Выполните шифрование или дешифрование — появится таблица тактов LFSR</div>';
  document.getElementById('ticksBadge').textContent = '0 тактов';
  updateActionBtn();
}

// ── Key input ────────────────────────────────────────────────

function onKeyInput(el) {
  el.value = el.value.replace(/[^01]/g, '');
  const n = el.value.length;
  const cnt = document.getElementById('keyCount');
  cnt.textContent = n + ' / 40';
  cnt.className   = 'key-count ' + (n === 40 ? 'ok' : 'bad');
  el.className    = n === 40 ? 'valid' : (n > 0 ? 'invalid' : '');
  updateActionBtn();
}

// ── File loading ─────────────────────────────────────────────

function openFile() {
  document.getElementById('fileInput').value = '';
  document.getElementById('fileInput').click();
}

function onFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    fileData = new Uint8Array(e.target.result);
    fileName = file.name;
    const dot = fileName.lastIndexOf('.');
    fileExt = dot > -1 ? fileName.slice(dot) : '';

    document.getElementById('fileInfo').style.display = 'flex';
    document.getElementById('fileNameSpan').textContent = fileName;
    document.getElementById('fileSizeSpan').textContent = fmtSize(fileData.length);
    document.getElementById('btnOpen').classList.add('active');
    document.getElementById('saveInfo').style.display = 'none';

    document.getElementById('tbIn').textContent =
      toByteString(fileData.slice(0, 8), Math.min(fileData.length, 8));
    document.getElementById('tbGenKey').textContent = '—';
    document.getElementById('tbOut').textContent    = '—';

    const hint = mode === 'enc' ? '«Шифровать»' : '«Дешифровать»';
    setStatus('ok', `Файл загружен: ${fileName} — ${fmtSize(fileData.length)}. Введите ключ и нажмите ${hint}`);
    updateActionBtn();
  };
  reader.readAsArrayBuffer(file);
}

// ── Cipher / Decipher ────────────────────────────────────────

function doProcess() {
  const keyStr  = document.getElementById('tbKey').value;
  const keyInit = toUInt64(keyStr);
  if (keyInit === null) { setStatus('err', 'Ключ некорректен! Нужно ровно 40 бит'); return; }
  if (!fileData)        { setStatus('err', 'Выберите файл'); return; }

  // XOR is symmetric — encrypt and decrypt are identical operations
  const keyRef      = { val: keyInit };
  const output      = new Uint8Array(fileData.length);
  const genKeyBytes = new Uint8Array(8);
  const displayCount = Math.min(fileData.length, 8);

  for (let i = 0; i < fileData.length; i++) {
    const gk = getGenKeyByte(keyRef);
    output[i] = fileData[i] ^ gk;
    if (i < 8) genKeyBytes[i] = gk;
  }

  const dot  = fileName.lastIndexOf('.');
  const base = dot > -1 ? fileName.slice(0, dot) : fileName;

  if (mode === 'enc') {
    // Always save as .txt so user can inspect the content
    const outName = base + '_encrypted.txt';
    finishProcess(output, genKeyBytes, displayCount, keyInit, outName);
  } else {
    // Ask user which extension the decrypted file should have
    pendingDecrypt = { output, genKeyBytes, displayCount, keyInit, base };
    document.getElementById('extInput').value = fileExt || '.txt';
    document.getElementById('extModal').classList.add('show');
    document.getElementById('extInput').focus();
    document.getElementById('extInput').select();
  }
}

function finishProcess(output, genKeyBytes, displayCount, keyInit, outName) {
  document.getElementById('tbGenKey').textContent = toByteString(genKeyBytes, displayCount);
  document.getElementById('tbOut').textContent    = toByteString(output.slice(0, 8), displayCount);

  buildTable(keyInit);
  downloadBlob(output, outName);

  document.getElementById('saveInfo').style.display = 'flex';
  document.getElementById('saveNameSpan').textContent = outName;

  const verb = outName.includes('_encrypted') ? 'Шифрование' : 'Дешифрование';
  setStatus('ok', `✓ ${verb} выполнено. Файл скачан: ${outName} (${fmtSize(output.length)})`);
}

// ── LFSR step table ──────────────────────────────────────────

function buildTable(keyInit) {
  const numTicks = 60;
  let key = keyInit;

  document.getElementById('ticksBadge').textContent = numTicks + ' тактов';

  let html = `<table><thead><tr>
    <th>Такт</th>
    <th>Регистр (b₁…b₄₀) до сдвига</th>
    <th>FB</th>
    <th>Вых.</th>
  </tr></thead><tbody>`;

  for (let t = 1; t <= numTicks; t++) {
    const before = reg40str(key);
    const r = lfsrStep(key);
    key = r.key;
    html += `<tr>
      <td>${t}</td>
      <td style="font-size:0.6rem;letter-spacing:0.02em;color:var(--text)">${before}</td>
      <td>${r.fb}</td>
      <td>${r.outBit}</td>
    </tr>`;
  }

  html += '</tbody></table>';
  document.getElementById('tableWrap').innerHTML = html;
}

// ── Extension picker modal ───────────────────────────────────

function setSuggestion(ext) {
  document.getElementById('extInput').value = ext;
  document.getElementById('extInput').focus();
}

function cancelExtModal() {
  document.getElementById('extModal').classList.remove('show');
  pendingDecrypt = null;
}

function confirmExtModal() {
  let chosenExt = document.getElementById('extInput').value.trim();
  if (!chosenExt) return;
  if (!chosenExt.startsWith('.')) chosenExt = '.' + chosenExt;

  document.getElementById('extModal').classList.remove('show');

  const { output, genKeyBytes, displayCount, keyInit, base } = pendingDecrypt;
  pendingDecrypt = null;

  const cleanBase = base.replace(/_encrypted$/, '');
  const outName   = cleanBase + '_decrypted' + chosenExt;

  finishProcess(output, genKeyBytes, displayCount, keyInit, outName);
}

// ── Init ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Close modal on backdrop click
  document.getElementById('extModal').addEventListener('click', function (e) {
    if (e.target === this) cancelExtModal();
  });

  // Keyboard shortcuts for modal
  document.getElementById('extInput').addEventListener('keydown', e => {
    if (e.key === 'Enter')  confirmExtModal();
    if (e.key === 'Escape') cancelExtModal();
  });
});
