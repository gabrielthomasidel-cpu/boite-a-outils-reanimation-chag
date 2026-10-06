/* ============================================================
   Encodeur QR minimal — mode octet, correction Q (25 %), versions 1 à 4.
   Écrit sur mesure : aucune bibliothèque n'est disponible hors ligne.
   Renvoie une matrice booléenne (true = module noir).
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- Corps de Galois GF(256), polynôme primitif 0x11D ---------- */
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  /* Polynôme générateur de Reed-Solomon pour n codets de correction */
  function rsGenerator(n) {
    let poly = [1];
    for (let i = 0; i < n; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  /* Codets de correction d'un bloc de données */
  function rsEncode(data, ecCount) {
    const gen = rsGenerator(ecCount);
    const res = new Array(ecCount).fill(0);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ res[0];
      res.shift();
      res.push(0);
      if (factor !== 0) {
        for (let j = 0; j < ecCount; j++) {
          res[j] ^= gfMul(gen[j + 1], factor);
        }
      }
    }
    return res;
  }

  /* ---------- Paramètres par version, niveau de correction Q ----------
     [ codets de données au total, codets de correction par bloc,
       nb de blocs du 1er groupe, données/bloc groupe 1,
       nb de blocs du 2e groupe, données/bloc groupe 2 ]              */
  const SPECS = {
    1: { data: 13, ecPerBlock: 13, groups: [[1, 13]] },
    2: { data: 22, ecPerBlock: 22, groups: [[1, 22]] },
    3: { data: 34, ecPerBlock: 18, groups: [[2, 17]] },
    4: { data: 48, ecPerBlock: 26, groups: [[2, 24]] }
  };
  const MAX_VERSION = 4;

  /* Centre des motifs d'alignement (versions 2 à 4 : un seul motif) */
  const ALIGN_CENTER = { 2: 18, 3: 22, 4: 26 };

  /* ---------- Encodage des données en flux binaire ---------- */
  function buildBitStream(bytes, version) {
    const spec = SPECS[version];
    const bits = [];
    const push = (value, length) => {
      for (let i = length - 1; i >= 0; i--) bits.push((value >> i) & 1);
    };

    push(0b0100, 4);          // mode octet
    push(bytes.length, 8);    // compteur (versions 1 à 9)
    bytes.forEach(b => push(b, 8));

    const capacity = spec.data * 8;
    if (bits.length > capacity) return null;

    // terminateur : jusqu'à 4 zéros
    for (let i = 0; i < 4 && bits.length < capacity; i++) bits.push(0);
    // alignement sur l'octet
    while (bits.length % 8 !== 0) bits.push(0);

    // octets de remplissage alternés
    const pad = [0xEC, 0x11];
    let p = 0;
    while (bits.length < capacity) {
      push(pad[p++ % 2], 8);
    }

    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let v = 0;
      for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      codewords.push(v);
    }
    return codewords;
  }

  /* ---------- Découpage en blocs puis entrelacement ---------- */
  function interleave(codewords, version) {
    const spec = SPECS[version];
    const dataBlocks = [];
    let pos = 0;
    spec.groups.forEach(([count, size]) => {
      for (let i = 0; i < count; i++) {
        dataBlocks.push(codewords.slice(pos, pos + size));
        pos += size;
      }
    });
    const ecBlocks = dataBlocks.map(b => rsEncode(b, spec.ecPerBlock));

    const out = [];
    const maxData = Math.max(...dataBlocks.map(b => b.length));
    for (let i = 0; i < maxData; i++) {
      dataBlocks.forEach(b => { if (i < b.length) out.push(b[i]); });
    }
    for (let i = 0; i < spec.ecPerBlock; i++) {
      ecBlocks.forEach(b => out.push(b[i]));
    }
    return out;
  }

  /* ---------- Construction de la matrice ---------- */
  function createMatrix(version) {
    const size = 17 + 4 * version;
    const modules = Array.from({ length: size }, () => new Array(size).fill(null));
    const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

    const setF = (r, c, val) => {
      if (r < 0 || c < 0 || r >= size || c >= size) return;
      modules[r][c] = val;
      reserved[r][c] = true;
    };

    // motifs de détection de position + séparateurs
    const placeFinder = (row, col) => {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const rr = row + r, cc = col + c;
          if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
          const inner = (r >= 0 && r <= 6 && c >= 0 && c <= 6);
          const dark = inner && (
            r === 0 || r === 6 || c === 0 || c === 6 ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4)
          );
          setF(rr, cc, dark);
        }
      }
    };
    placeFinder(0, 0);
    placeFinder(0, size - 7);
    placeFinder(size - 7, 0);

    // motifs de synchronisation
    for (let i = 8; i < size - 8; i++) {
      const dark = (i % 2 === 0);
      setF(6, i, dark);
      setF(i, 6, dark);
    }

    // motif d'alignement (versions 2 à 4)
    if (version >= 2) {
      const ctr = ALIGN_CENTER[version];
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
          setF(ctr + r, ctr + c, dark);
        }
      }
    }

    // module noir obligatoire
    setF(size - 8, 8, true);

    // zones réservées à l'information de format
    for (let i = 0; i <= 8; i++) {
      if (modules[8][i] === null) { modules[8][i] = false; reserved[8][i] = true; }
      if (modules[i][8] === null) { modules[i][8] = false; reserved[i][8] = true; }
    }
    for (let i = 0; i < 8; i++) {
      if (modules[8][size - 1 - i] === null) { modules[8][size - 1 - i] = false; reserved[8][size - 1 - i] = true; }
      if (modules[size - 1 - i][8] === null) { modules[size - 1 - i][8] = false; reserved[size - 1 - i][8] = true; }
    }

    return { modules, reserved, size };
  }

  /* ---------- Placement des données en zigzag ---------- */
  function placeData(state, codewords) {
    const { modules, reserved, size } = state;
    const bits = [];
    codewords.forEach(cw => {
      for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
    });

    let idx = 0;
    let upward = true;
    for (let right = size - 1; right > 0; right -= 2) {
      if (right === 6) right = 5; // on saute la colonne de synchronisation
      for (let step = 0; step < size; step++) {
        const row = upward ? (size - 1 - step) : step;
        for (let k = 0; k < 2; k++) {
          const col = right - k;
          if (reserved[row][col]) continue;
          modules[row][col] = idx < bits.length ? bits[idx++] === 1 : false;
        }
      }
      upward = !upward;
    }
  }

  /* ---------- Masques ---------- */
  const MASKS = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2 + (r * c) % 3) === 0,
    (r, c) => (((r * c) % 2 + (r * c) % 3) % 2) === 0,
    (r, c) => (((r + c) % 2 + (r * c) % 3) % 2) === 0
  ];

  function applyMask(state, maskIdx) {
    const { modules, reserved, size } = state;
    const out = modules.map(row => row.slice());
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (reserved[r][c]) continue;
        if (MASKS[maskIdx](r, c)) out[r][c] = !out[r][c];
      }
    }
    return out;
  }

  /* Pénalités (règles 1 à 4 de la norme) */
  function penalty(grid) {
    const size = grid.length;
    let score = 0;

    // règle 1 : suites de 5 modules identiques ou plus
    const runScore = (line) => {
      let s = 0, run = 1;
      for (let i = 1; i < line.length; i++) {
        if (line[i] === line[i - 1]) run++;
        else { if (run >= 5) s += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) s += 3 + (run - 5);
      return s;
    };
    for (let i = 0; i < size; i++) {
      score += runScore(grid[i]);
      score += runScore(grid.map(row => row[i]));
    }

    // règle 2 : blocs 2x2 de même couleur
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const v = grid[r][c];
        if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) score += 3;
      }
    }

    // règle 3 : motifs 1:1:3:1:1 accompagnés de 4 modules clairs
    const P1 = [true, false, true, true, true, false, true, false, false, false, false];
    const P2 = [false, false, false, false, true, false, true, true, true, false, true];
    const matchAt = (line, i, pat) => {
      for (let k = 0; k < pat.length; k++) if (line[i + k] !== pat[k]) return false;
      return true;
    };
    for (let i = 0; i < size; i++) {
      const row = grid[i];
      const col = grid.map(r => r[i]);
      for (let j = 0; j + 11 <= size; j++) {
        if (matchAt(row, j, P1) || matchAt(row, j, P2)) score += 40;
        if (matchAt(col, j, P1) || matchAt(col, j, P2)) score += 40;
      }
    }

    // règle 4 : déséquilibre clair/sombre
    let dark = 0;
    grid.forEach(row => row.forEach(v => { if (v) dark++; }));
    const ratio = dark * 100 / (size * size);
    score += Math.floor(Math.abs(ratio - 50) / 5) * 10;

    return score;
  }

  /* ---------- Information de format (niveau Q + masque), BCH(15,5) ---------- */
  /* Renvoie l'entier de 15 bits ; le bit i s'obtient par (value >> i) & 1 */
  function formatValue(maskIdx) {
    const ecBits = 0b11; // niveau Q
    const data = (ecBits << 3) | maskIdx;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >> 9) & 1) ? 0x537 : 0);
    return ((data << 10) | rem) ^ 0x5412;
  }

  /* Placement normalisé (ISO/IEC 18004, § 8.9). Les coordonnées sont exprimées
     en [ligne][colonne] et le bit 0 est celui de poids faible. */
  function placeFormat(grid, maskIdx) {
    const size = grid.length;
    const value = formatValue(maskIdx);
    const bit = i => ((value >> i) & 1) === 1;

    // copie 1 : colonne 8 de haut en bas, puis ligne 8 de droite à gauche
    for (let i = 0; i <= 5; i++) grid[i][8] = bit(i);
    grid[7][8] = bit(6);
    grid[8][8] = bit(7);
    grid[8][7] = bit(8);
    for (let i = 9; i < 15; i++) grid[8][14 - i] = bit(i);

    // copie 2 : ligne 8 depuis le bord droit, puis colonne 8 vers le bas
    for (let i = 0; i < 8; i++) grid[8][size - 1 - i] = bit(i);
    for (let i = 8; i < 15; i++) grid[size - 15 + i][8] = bit(i);

    // module toujours sombre
    grid[size - 8][8] = true;
  }

  /* ---------- Point d'entrée ---------- */
  function encode(text) {
    const bytes = [];
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      bytes.push(code > 255 ? 63 /* '?' */ : code);
    }

    let version = null, codewords = null;
    for (let v = 1; v <= MAX_VERSION; v++) {
      const cw = buildBitStream(bytes, v);
      if (cw) { version = v; codewords = cw; break; }
    }
    if (!version) {
      throw new Error('Référence trop longue pour un QR de version 4 (max ~46 caractères).');
    }

    const final = interleave(codewords, version);
    const state = createMatrix(version);
    placeData(state, final);

    let best = null, bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      const grid = applyMask(state, m);
      placeFormat(grid, m);
      const score = penalty(grid);
      if (score < bestScore) { bestScore = score; best = grid; }
    }
    return best;
  }

  global.QR = { encode };
})(typeof window !== 'undefined' ? window : globalThis);
