/* ============================================================
   Formats de planches d'etiquettes
   ============================================================
   La planche Avery L7060 a ete mesuree depuis le modele Word Avery fourni :
   A4, 3 colonnes x 7 lignes, etiquettes 63,5 x 38,1 mm, intervalle
   horizontal de 2,5 mm et marges centrees de 7,25 x 15,15 mm.
   ============================================================ */
(function (global) {
  'use strict';

  const FORMATS = Object.freeze({
    'standard-27': Object.freeze({
      id: 'standard-27',
      name: 'Standard 27 étiquettes',
      shortDescription: 'A4, 3 colonnes × 9 lignes, 27 étiquettes',
      details: 'A4 — 3 colonnes × 9 lignes — 27 étiquettes par page',
      cols: 3,
      rows: 9,
      perPage: 27,
      marginXmm: 22,
      marginYmm: 15,
      cellWidthMm: (210 - 44) / 3,
      cellHeightMm: (297 - 30) / 9,
      gapXmm: 0,
      gapYmm: 0,
      fileSlug: 'Standard_27'
    }),
    'avery-plastifie': Object.freeze({
      id: 'avery-plastifie',
      name: 'Avery plastifié',
      shortDescription: 'Avery L7060, 3 colonnes × 7 lignes, 21 étiquettes',
      details: 'Avery L7060 — 63,5 × 38,1 mm — 3 colonnes × 7 lignes — 21 étiquettes par page',
      cols: 3,
      rows: 7,
      perPage: 21,
      marginXmm: 7.25,
      marginYmm: 15.15,
      cellWidthMm: 63.5,
      cellHeightMm: 38.1,
      gapXmm: 2.5,
      gapYmm: 0,
      fileSlug: 'Avery_plastifie_L7060'
    })
  });

  function get(id) {
    return FORMATS[id] || FORMATS['standard-27'];
  }

  function current() {
    const select = global.document && global.document.getElementById('etiqFormat');
    return get(select ? select.value : 'standard-27');
  }

  function geometry(format, millimetre) {
    const selected = format || current();
    return {
      COLS: selected.cols,
      ROWS: selected.rows,
      MARGIN_X: selected.marginXmm * millimetre,
      MARGIN_Y: selected.marginYmm * millimetre,
      CELL_W: selected.cellWidthMm * millimetre,
      CELL_H: selected.cellHeightMm * millimetre,
      GAP_X: selected.gapXmm * millimetre,
      GAP_Y: selected.gapYmm * millimetre
    };
  }

  global.CommandesLabelFormats = Object.freeze({ FORMATS, get, current, geometry });
})(window);
