/* ══════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════ */
const RU = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
const EN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
let currentAlgo = 'grille';
let currentMode = 'text';
let grilleSize = 4;
let grilleTemplate = []; // boolean[][]
let currentRotation = 0;

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
window.onload = () => {
  grilleTemplate = Array.from({length: 4}, () => Array(4).fill(false));
  document.getElementById('grilleInfo').innerHTML =
    'Введите текст и нажмите «Зашифровать» —<br>решётка и дырки сгенерируются автоматически.';
};

// Calculate minimum even grid size to fit the text
function calcGrilleSize(charCount) {
  if (charCount === 0) return 4;
  
  // Сколько нужно дырок, чтобы разместить все буквы
  // Каждая дырка дает 4 позиции (по одной на каждый поворот)
  const neededHoles = Math.ceil(charCount / 4);
  
  // Ищем минимальный размер сетки, в который можно поместить нужное количество дырок
  // В сетке n×n максимум дырок = floor(n²/4)
  let n = 1;
  while (Math.floor(n * n / 4) < neededHoles) {
    n++;
  }
  
  // Минимальный размер для осмысленной решетки - 2×2
  return Math.max(2, n);
}

/* ══════════════════════════════════════════════
   ALGO / MODE SWITCH
══════════════════════════════════════════════ */
function switchAlgo(algo) {
  currentAlgo = algo;
  document.getElementById('grilleSection').classList.toggle('hidden', algo !== 'grille');
  document.getElementById('vigenereSection').classList.toggle('hidden', algo !== 'vigenere');
  document.getElementById('btnGrille').classList.toggle('active', algo === 'grille');
  document.getElementById('btnGrille').classList.toggle('blue', false);
  document.getElementById('btnVigenere').classList.toggle('active', algo === 'vigenere');
  document.getElementById('btnVigenere').classList.toggle('blue', algo === 'vigenere');
  switchMode(true);
}

function switchMode(force) {
  const isFile = force ? (currentMode === 'file') : document.getElementById('modeToggle').checked;
  if (!force) currentMode = isFile ? 'file' : 'text';
  document.getElementById('grilleTextMode').classList.toggle('hidden', isFile);
  document.getElementById('grilleFileMode').classList.toggle('hidden', !isFile);
  document.getElementById('vigTextMode').classList.toggle('hidden', isFile);
  document.getElementById('vigFileMode').classList.toggle('hidden', !isFile);
}

/* ══════════════════════════════════════════════
   GRILLE CORE
══════════════════════════════════════════════ */

// Поворот матрицы 90° по часовой: (r,c) -> (c, n-1-r)
function rotateMatrix(mat, n) {
  const res = Array.from({length: n}, () => Array(n).fill(false));
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      res[c][n - 1 - r] = mat[r][c];
  return res;
}

// Все 4 позиции ячейки (r,c) при поворотах по часовой
function getAllRotationPositions(r, c, n) {
  const positions = [];
  let cr = r, cc = c;
  for (let i = 0; i < 4; i++) {
    positions.push([cr, cc]);
    const nr = cc; const nc = n - 1 - cr;
    cr = nr; cc = nc;
  }
  return positions;
}

// Обход дырок маски в правильном порядке для данного поворота
// rot=0: строки сверху вниз, столбцы слева направо
// rot=1: столбцы слева направо, строки сверху вниз  
// rot=2: строки снизу вверх, столбцы справа налево
// rot=3: столбцы справа налево, строки снизу вверх
function getBaseHoleOrder(template, n) {
  const holes = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (template[r][c]) holes.push([r, c]);
  return holes;
}
function rotateCoord(r, c, n, times) {
  let cr = r, cc = c;
  for (let i = 0; i < times; i++) {
    const nr = cc;
    const nc = n - 1 - cr;
    cr = nr;
    cc = nc;
  }
  return [cr, cc];
}
function getRotatedHoles(baseHoles, n, rot) {
  return baseHoles.map(([r, c]) => rotateCoord(r, c, n, rot));
}

function isCenter(r, c, n) {
  return n % 2 !== 0 && r === Math.floor(n / 2) && c === Math.floor(n / 2);
}

function canOpenCell(r, c, n, template) {
  if (isCenter(r, c, n)) return false;
  const positions = getAllRotationPositions(r, c, n);
  const keys = new Set(positions.map(([pr, pc]) => `${pr},${pc}`));
  if (keys.size < 4) return false;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (template[i][j] && !(i === r && j === c)) {
        const existing = getAllRotationPositions(i, j, n);
        for (const [er, ec] of existing)
          if (keys.has(`${er},${ec}`)) return false;
      }
  return true;
}

function generateTemplate(n) {
  const template = Array.from({length: n}, () => Array(n).fill(false));
  const maxCells = n % 2 === 0 ? (n * n) / 4 : (n * n - 1) / 4;
  const shuffled = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (!isCenter(r, c, n)) shuffled.push([r, c]);
  shuffled.sort(() => Math.random() - 0.5);
  let count = 0;
  for (const [r, c] of shuffled) {
    if (count >= maxCells) break;
    if (canOpenCell(r, c, n, template)) {
      template[r][c] = true;
      count++;
    }
  }
  return template;
}

// Строим 4 маски поворачивая базовый шаблон
function buildRotationMasks(template, n) {
  const masks = [];
  let cur = template.map(row => [...row]);
  for (let i = 0; i < 4; i++) {
    masks.push(cur.map(row => [...row]));
    cur = rotateMatrix(cur, n);
  }
  return masks;
}

function renderGrilleDisplay(template, n) {
  const ed = document.getElementById('grilleEditor');
  ed.style.gridTemplateColumns = `repeat(${n}, 44px)`;
  ed.innerHTML = '';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const cell = document.createElement('div');
      cell.className = 'grille-cell' + (template[r][c] ? ' open' : '');
      ed.appendChild(cell);
    }
}

function renderGrillePreviewWithLetters(template, n, filledGrid, perRotGrids) {
  const prev = document.getElementById('grillePreview');
  prev.innerHTML = '';
  prev.style.display = 'flex';
  prev.style.gap = '12px';
  prev.style.flexWrap = 'wrap';

  const labels = ['0°', '90°', '180°', '270°'];
  const masks = buildRotationMasks(template, n);

  for (let rot = 0; rot < 4; rot++) {
    const mask = masks[rot];
    // Если есть per-rotation grids — показываем их, иначе filledGrid
    const displayGrid = perRotGrids ? perRotGrids[rot] : filledGrid;

    const wrap = document.createElement('div');
    wrap.style.textAlign = 'center';

    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-family:var(--mono);font-size:10px;color:var(--muted);margin-bottom:5px;';
    lbl.textContent = labels[rot];
    wrap.appendChild(lbl);

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = `repeat(${n}, 28px)`;
    grid.style.gap = '2px';

    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const cell = document.createElement('div');
        const isOpen = mask[r][c];
        const isCtr = isCenter(r, c, n);
        const letter = displayGrid ? displayGrid[r][c] : '';
        // null = рандом-заполнитель дырки → показываем ? без красного
        const isRandom = letter === null;
        cell.style.cssText = `width:28px;height:28px;border-radius:4px;border:1px solid var(--border);
          display:flex;align-items:center;justify-content:center;
          font-family:var(--mono);font-size:11px;font-weight:600;` +
          (isOpen && !isRandom
            ? 'background:var(--accent);color:white;'
            : 'background:var(--cell-off);color:var(--muted);');
        cell.textContent = isRandom ? '?' : (isCtr ? '?' : (letter || ''));
        grid.appendChild(cell);
      }
    wrap.appendChild(grid);
    prev.appendChild(wrap);
  }
}

/* ══════════════════════════════════════════════
   GRILLE ENCRYPT / DECRYPT
══════════════════════════════════════════════ */
function grilleClean(text) {
  return text.toUpperCase().split('').filter(c => EN.includes(c)).join('');
}

function grilleEncrypt(text) {
  const clean = grilleClean(text);
  if (clean.length === 0) return '';

  const n = calcGrilleSize(clean.length);
  grilleSize = n;
  grilleTemplate = generateTemplate(n);

  const masks = buildRotationMasks(grilleTemplate, n);
  const baseHoles = getBaseHoleOrder(grilleTemplate, n);

  // Сетка целиком заполнена рандомом изначально
  const grid = Array.from({length: n}, () =>
    Array.from({length: n}, () => EN[Math.floor(Math.random() * 26)])
  );

  // Поверх рандома через дырки пишем буквы текста (потом рандом если текст кончился)
  let idx = 0;
for (let rot = 0; rot < 4; rot++) {
  const holes = getRotatedHoles(baseHoles, n, rot);
  for (const [r, c] of holes)
    grid[r][c] = idx < clean.length
      ? clean[idx++]
      : EN[Math.floor(Math.random() * 26)];
}

  renderGrilleDisplay(grilleTemplate, n);

  // Для превью: накопленное состояние. null = рандом (показывать ? без красного)
  // Используем специальный маркер '?' в cumGrid для рандом-заполнителей
  const stepGrids = [];
  const cumGrid = Array.from({length: n}, () => Array(n).fill(''));
  let previewIdx = 0;

  for (let rot = 0; rot < 4; rot++) {
    const holes = getRotatedHoles(baseHoles, n, rot);
    for (const [r, c] of holes)
      cumGrid[r][c] = previewIdx < clean.length ? clean[previewIdx++] : null; // null = рандом
    stepGrids.push(cumGrid.map(row => [...row]));
  }

  // В последнем шаге закрытые ячейки заполняем рандомом
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (stepGrids[3][r][c] === '') stepGrids[3][r][c] = grid[r][c];

  renderGrillePreviewWithLetters(grilleTemplate, n, grid, stepGrids);

  const slots = n % 2 === 0 ? (n * n) / 4 : (n * n - 1) / 4;
  const centerCount = n % 2 !== 0 ? 1 : 0;
  const randCount = slots * 4 - clean.length + centerCount;
  document.getElementById('grilleHint').textContent =
    `Решётка ${n}×${n} · ${clean.length} букв · дырок: ${slots}`;
  document.getElementById('grilleInfo').innerHTML =
    `<strong>Размер:</strong> ${n}×${n} (${n * n} ячеек)<br>` +
    `<strong>Дырок:</strong> ${slots} × 4 поворота = ${slots * 4} позиций<br>` +
    `<strong>Букв текста:</strong> ${clean.length} · рандом заполнил: ${randCount}`;

  // Шифротекст = вся матрица построчно
  let result = '';
  for (let r = 0; r < n; r++) result += grid[r].join('');
  return result.match(/.{1,5}/g).join(' ');
}

function grilleDecrypt(text) {
  const clean = grilleClean(text);
  if (clean.length === 0) return '';
  if (countOpenCells() === 0) { showToast('Сначала зашифруйте текст!'); return ''; }

  const n = grilleSize;
  const blockSize = n * n;

  if (clean.length < blockSize) {
    showToast(`Нужно ${blockSize} символов для решётки ${n}×${n}`);
    return '';
  }

  const chunk = clean.slice(0, blockSize);
  const grid = Array.from({length: n}, (_, r) =>
    chunk.slice(r * n, (r + 1) * n).split('')
  );

  const baseHoles = getBaseHoleOrder(grilleTemplate, n);

  // Сначала читаем буквы через дырки (по порядку зафиксированному в encrypt)
  let throughHoles = '';
  for (let rot = 0; rot < 4; rot++) {
    const holes = getRotatedHoles(baseHoles, n, rot);
    for (const [r, c] of holes) throughHoles += grid[r][c];
  }

  // Потом читаем закрытые ячейки (рандомный шум)
  const masks = buildRotationMasks(grilleTemplate, n);
  let closed = '';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      let inHole = false;
      for (let rot = 0; rot < 4; rot++)
        if (masks[rot][r][c]) { inHole = true; break; }
      if (!inHole) closed += grid[r][c];
    }

  // Для превью: строим cumGrid
  const decStepGrids = [];
  const decCumGrid = Array.from({length: n}, () => Array(n).fill(null));
  for (let rot = 0; rot < 4; rot++) {
    const holes = getRotatedHoles(baseHoles, n, rot);
    for (const [r, c] of holes) decCumGrid[r][c] = grid[r][c];
    decStepGrids.push(decCumGrid.map(row => [...row]));
  }

  renderGrillePreviewWithLetters(grilleTemplate, n, grid, decStepGrids);

  return throughHoles + closed;
}

function countOpenCells() {
  return grilleTemplate.flat().filter(Boolean).length;
}

function grilleProcess(decrypt) {
  const text = document.getElementById('grilleInput').value;
  if (!text.trim()) return;
  const res = decrypt ? grilleDecrypt(text) : grilleEncrypt(text);
  document.getElementById('grilleOutput').value = res;
}

/* ══════════════════════════════════════════════
   GRILLE FILE PROCESS
══════════════════════════════════════════════ */

// Преобразует шаблон решётки в строку для файла
function grilleTemplateToString(template) {
  return template.map(row => row.map(b => b ? '1' : '0').join('')).join(';');
}

// Восстанавливает шаблон решётки из строки файла
function stringToGrilleTemplate(str) {
  return str.split(';').map(row => row.split('').map(ch => ch === '1'));
}

// Шифрование файла
/* ══════════════════════════════════════════════
   GRILLE FILE PROCESS
══════════════════════════════════════════════ */
function grilleEncryptFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    let content = e.target.result.toUpperCase();
    // Оставляем только допустимые буквы
    content = content.split('').filter(c => EN.includes(c)).join('');
    
    if (!content) { 
      showToast('Файл не содержит допустимых символов A-Z!'); 
      return; 
    }

    const encrypted = grilleEncrypt(content);
    const blob = new Blob([encrypted], { type: 'text/plain' });
    const link = document.getElementById('grilleDownload');
    link.href = URL.createObjectURL(blob);
    link.download = file.name.replace(/(\.txt)?$/, '_enc.txt');
    link.classList.remove('hidden');
    showToast('Готово! Нажмите "Скачать"');
  };
  reader.readAsText(file, 'UTF-8');
}

function grilleDecryptFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    let content = e.target.result.replace(/\s+/g, '').toUpperCase();
    // Оставляем только допустимые буквы
    content = content.split('').filter(c => EN.includes(c)).join('');

    if (!content) { 
      showToast('Файл не содержит допустимых символов A-Z!'); 
      return; 
    }

    const decrypted = grilleDecrypt(content);
    const blob = new Blob([decrypted], { type: 'text/plain' });
    const link = document.getElementById('grilleDownload');
    link.href = URL.createObjectURL(blob);
    link.download = file.name.replace(/(\.txt)?$/, '_dec.txt');
    link.classList.remove('hidden');
    showToast('Готово! Нажмите "Скачать"');
  };
  reader.readAsText(file, 'UTF-8');
}

function grilleFileProcess(decrypt) {
  const file = document.getElementById('grilleFileInput').files[0];
  if (!file) { showToast('Выберите файл!'); return; }
  if (decrypt) grilleDecryptFile(file);
  else grilleEncryptFile(file);
}
/* ══════════════════════════════════════════════
   VIGENERE PROGRESSIVE
══════════════════════════════════════════════ */
function vigClean(text) {
  // Только для ключа - удаляем все не-русские буквы
  return text.toUpperCase().split('').filter(c => RU.includes(c)).join('');
}

function vigProgressiveEncrypt(text, key) {
  // Очищаем только ключ
  const cleanKey = vigClean(key);
  if (!cleanKey) { showToast('Введите ключ!'); return ''; }

  let result = '';
  let keyIndex = 0; // индекс в ключе (увеличивается только когда шифруем букву)
  const keyLength = cleanKey.length;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i].toUpperCase();
    
    // Если это не русская буква - оставляем как есть
    if (!RU.includes(ch)) {
      result += text[i];
      continue;
    }

    // Шифруем русскую букву
    const m = RU.indexOf(ch);
    const keyChar = cleanKey[keyIndex % keyLength];
    const keyShift = RU.indexOf(keyChar);
    
    // Прогрессивное смещение = номер повторения ключа
    const repeatNum = Math.floor(keyIndex / keyLength);
    const totalShift = (keyShift + repeatNum) % 33;
    
    const encrypted = (m + totalShift) % 33;
    result += RU[encrypted];
    
    keyIndex++; // увеличиваем только когда обработали букву
  }
  
  return result;
}

function vigProgressiveDecrypt(text, key) {
  const cleanKey = vigClean(key);
  if (!cleanKey) { showToast('Введите ключ!'); return ''; }

  let result = '';
  let keyIndex = 0;
  const keyLength = cleanKey.length;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i].toUpperCase();
    
    if (!RU.includes(ch)) {
      result += text[i];
      continue;
    }

    const c = RU.indexOf(ch);
    const keyChar = cleanKey[keyIndex % keyLength];
    const keyShift = RU.indexOf(keyChar);
    
    const repeatNum = Math.floor(keyIndex / keyLength);
    const totalShift = (keyShift + repeatNum) % 33;
    
    const decrypted = (c - totalShift + 33) % 33;
    result += RU[decrypted];
    
    keyIndex++;
  }
  
  return result;
}

function vigProcess(decrypt) {
  const text = document.getElementById('vigInput').value;
  const key = document.getElementById('vigKey').value;
  if (!text.trim()) return;
  if (!key.trim()) { showToast('Введите ключ!'); return; }
  const res = decrypt ? vigProgressiveDecrypt(text, key) : vigProgressiveEncrypt(text, key);
  document.getElementById('vigOutput').value = res;
}

function vigFileProcess(decrypt) {
  const file = document.getElementById('vigFileInput').files[0];
  const key = document.getElementById('vigFileKey').value;
  if (!file) { showToast('Выберите файл!'); return; }
  if (!key.trim()) { showToast('Введите ключ!'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const res = decrypt ? vigProgressiveDecrypt(e.target.result, key) : vigProgressiveEncrypt(e.target.result, key);
    const blob = new Blob([res], {type: 'text/plain'});
    const link = document.getElementById('vigDownload');
    link.href = URL.createObjectURL(blob);
    link.download = file.name.replace(/(\.txt)?$/, (decrypt ? '_dec' : '_enc') + '.txt');
    link.classList.remove('hidden');
    showToast('Готово! Нажмите "Скачать"');
  };
  reader.readAsText(file);
}

/* ══════════════════════════════════════════════
   UTILITY
══════════════════════════════════════════════ */
function clearFields(...ids) {
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

function copyText(id) {
  const val = document.getElementById(id).value;
  if (!val) return;
  navigator.clipboard.writeText(val).then(() => showToast('Скопировано!'));
}

function swapTexts(a, b) {
  const ea = document.getElementById(a), eb = document.getElementById(b);
  [ea.value, eb.value] = [eb.value, ea.value];
}

function fileSelected(inputId, nameId) {
  const f = document.getElementById(inputId).files[0];
  if (f) document.getElementById(nameId).textContent = f.name;
}

function dragOver(e, zoneId) {
  e.preventDefault();
  document.getElementById(zoneId).classList.add('dragover');
}
function dragLeave(zoneId) {
  document.getElementById(zoneId).classList.remove('dragover');
}
function dropFile(e, inputId, zoneId) {
  e.preventDefault();
  dragLeave(zoneId);
  const dt = e.dataTransfer;
  if (dt.files.length) {
    const input = document.getElementById(inputId);
    const nameId = inputId.replace('FileInput','FileName');
    const list = new DataTransfer();
    list.items.add(dt.files[0]);
    input.files = list.files;
    fileSelected(inputId, nameId);
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}