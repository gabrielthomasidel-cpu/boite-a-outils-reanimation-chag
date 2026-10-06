/* Impression directe des planches d'étiquettes depuis la gestion administrateur. */
(function (global) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  let activeCleanup = null;

  function addPrintStyles() {
    if (global.document.getElementById('commandes-label-print-style')) return;
    const style = global.document.createElement('style');
    style.id = 'commandes-label-print-style';
    style.textContent = `
      #commandesLabelPrintRoot{display:none}
      @media print{
        @page{size:A4 portrait;margin:0}
        html,body{width:210mm!important;min-width:210mm!important;margin:0!important;padding:0!important;background:#fff!important}
        body.commandes-printing-labels>*:not(#commandesLabelPrintRoot){display:none!important}
        body.commandes-printing-labels #commandesLabelPrintRoot{display:block!important;width:210mm!important;margin:0!important;padding:0!important;background:#fff!important;color:#000!important}
        .commandes-label-page{width:210mm;height:297mm;box-sizing:border-box;display:grid;
          grid-template-columns:repeat(var(--label-cols),var(--label-width));
          grid-template-rows:repeat(var(--label-rows),var(--label-height));
          column-gap:var(--label-gap-x);row-gap:var(--label-gap-y);
          padding:var(--label-margin-y) var(--label-margin-x);break-after:page;page-break-after:always;
          overflow:hidden;background:#fff;color:#000}
        .commandes-label-page:last-child{break-after:auto;page-break-after:auto}
        .commandes-label-cell{box-sizing:border-box;overflow:hidden;background:#fff;color:#000;border:0;
          font-family:Arial,sans-serif;break-inside:avoid;page-break-inside:avoid}
        .commandes-label-cell.qr{display:flex;align-items:center;gap:2.5mm;padding:2.5mm}
        .commandes-label-qr{width:18mm;height:18mm;flex:0 0 18mm;shape-rendering:crispEdges}
        .commandes-label-copy{min-width:0;line-height:1.12;overflow:hidden}
        .commandes-label-ref{font-size:11pt;font-weight:700;margin-bottom:1.2mm;white-space:nowrap;overflow:hidden;text-overflow:clip}
        .commandes-label-name{font-size:7pt;font-weight:700;line-height:1.18;overflow:hidden}
        .commandes-label-pharmacy{font-size:6pt;color:#555;line-height:1.18;margin-top:.8mm;overflow:hidden}
        .commandes-label-cell.barcode{display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;padding:2.5mm}
        .commandes-label-bars{width:100%;height:10mm;flex:0 0 10mm;shape-rendering:crispEdges}
        .commandes-label-code{text-align:center;font-size:8pt;font-weight:700;line-height:1.1;margin-top:.5mm;white-space:nowrap;overflow:hidden}
        .commandes-label-bar-name{font-size:6.5pt;font-weight:700;line-height:1.15;margin-top:1mm;white-space:nowrap;overflow:hidden}
        .commandes-label-order-ref{font-size:5.5pt;color:#555;line-height:1.1;margin-top:.6mm;white-space:nowrap;overflow:hidden}
      }`;
    global.document.head.appendChild(style);
  }

  function svgElement(name, attributes) {
    const element = global.document.createElementNS(SVG_NS, name);
    Object.entries(attributes || {}).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  function qrSvg(value) {
    if (!global.QR || typeof global.QR.encode !== 'function') throw new Error('Encodeur QR indisponible.');
    const matrix = global.QR.encode(String(value || ''));
    const size = matrix.length;
    const svg = svgElement('svg', { class: 'commandes-label-qr', viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true' });
    let path = '';
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        if (matrix[row][column]) path += `M${column} ${row}h1v1h-1z`;
      }
    }
    svg.appendChild(svgElement('path', { d: path, fill: '#000' }));
    return svg;
  }

  function barcodeSvg(value) {
    if (typeof global.code128B !== 'function') throw new Error('Encodeur code-barres indisponible.');
    const modules = global.code128B(String(value || ''));
    const svg = svgElement('svg', { class: 'commandes-label-bars', viewBox: `0 0 ${modules.length} 40`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    let start = -1;
    modules.forEach((black, index) => {
      if (black && start < 0) start = index;
      if ((!black || index === modules.length - 1) && start >= 0) {
        const end = black && index === modules.length - 1 ? index + 1 : index;
        svg.appendChild(svgElement('rect', { x: start, y: 0, width: end - start, height: 40, fill: '#000' }));
        start = -1;
      }
    });
    return svg;
  }

  function text(className, value) {
    const element = global.document.createElement('div');
    element.className = className;
    element.textContent = String(value || '');
    return element;
  }

  function qrCell(item) {
    const cell = global.document.createElement('div');
    cell.className = 'commandes-label-cell qr';
    cell.appendChild(qrSvg(item.ref));
    const copy = global.document.createElement('div');
    copy.className = 'commandes-label-copy';
    copy.appendChild(text('commandes-label-ref', item.ref));
    copy.appendChild(text('commandes-label-name', item.denom || item.nom));
    if (item.nom && String(item.nom).trim().toLocaleLowerCase('fr') !== String(item.denom || '').trim().toLocaleLowerCase('fr')) {
      copy.appendChild(text('commandes-label-pharmacy', item.nom));
    }
    cell.appendChild(copy);
    return cell;
  }

  function barcodeCell(item, orderReference) {
    const cell = global.document.createElement('div');
    cell.className = 'commandes-label-cell barcode';
    cell.appendChild(barcodeSvg(item.codeBarres));
    cell.appendChild(text('commandes-label-code', item.codeBarres));
    cell.appendChild(text('commandes-label-bar-name', item.denom || item.nom));
    cell.appendChild(text('commandes-label-order-ref', `Réf. commande : ${orderReference(item.ref)}`));
    return cell;
  }

  function buildPages(list, format, kind, orderReference) {
    addPrintStyles();
    if (activeCleanup) activeCleanup();
    const root = global.document.createElement('div');
    root.id = 'commandesLabelPrintRoot';
    root.setAttribute('aria-hidden', 'true');
    for (let offset = 0; offset < list.length; offset += format.perPage) {
      const page = global.document.createElement('section');
      page.className = 'commandes-label-page';
      page.style.setProperty('--label-cols', String(format.cols));
      page.style.setProperty('--label-rows', String(format.rows));
      page.style.setProperty('--label-width', `${format.cellWidthMm}mm`);
      page.style.setProperty('--label-height', `${format.cellHeightMm}mm`);
      page.style.setProperty('--label-gap-x', `${format.gapXmm}mm`);
      page.style.setProperty('--label-gap-y', `${format.gapYmm}mm`);
      page.style.setProperty('--label-margin-x', `${format.marginXmm}mm`);
      page.style.setProperty('--label-margin-y', `${format.marginYmm}mm`);
      const chunk = list.slice(offset, offset + format.perPage);
      chunk.forEach(item => page.appendChild(kind === 'barcode'
        ? barcodeCell(item, orderReference)
        : qrCell(item)));
      for (let index = chunk.length; index < format.perPage; index++) {
        const blank = global.document.createElement('div');
        blank.className = 'commandes-label-cell';
        page.appendChild(blank);
      }
      root.appendChild(page);
    }
    global.document.body.appendChild(root);
    global.document.body.classList.add('commandes-printing-labels');
    return root;
  }

  async function printLabels(options) {
    const list = Array.isArray(options && options.list) ? options.list : [];
    const format = options && options.format;
    const kind = options && options.kind === 'barcode' ? 'barcode' : 'qr';
    const orderReference = options && typeof options.orderReference === 'function'
      ? options.orderReference
      : value => String(value || '');
    if (!list.length) throw new Error('Aucune étiquette sélectionnée.');
    if (!format) throw new Error('Format d’étiquette absent.');

    const previousTitle = global.document.title;
    buildPages(list, format, kind, orderReference);
    global.document.title = `Étiquettes — ${format.name}`;
    let cleaned = false;
    const cleanup = function () {
      if (cleaned) return;
      cleaned = true;
      global.document.body.classList.remove('commandes-printing-labels');
      const root = global.document.getElementById('commandesLabelPrintRoot');
      if (root) root.remove();
      global.document.title = previousTitle;
      global.removeEventListener('afterprint', afterPrint);
      global.removeEventListener('androidprintfinished', androidDone);
      global.removeEventListener('androidprintcancelled', androidDone);
      if (activeCleanup === cleanup) activeCleanup = null;
    };
    const afterPrint = function () {
      if (!global.__androidPrintManaged) global.setTimeout(cleanup, 60);
    };
    const androidDone = function () { global.setTimeout(cleanup, 60); };
    activeCleanup = cleanup;
    global.addEventListener('afterprint', afterPrint);
    global.addEventListener('androidprintfinished', androidDone);
    global.addEventListener('androidprintcancelled', androidDone);

    try {
      if (global.document.fonts && global.document.fonts.ready) await global.document.fonts.ready;
      await new Promise(resolve => global.requestAnimationFrame(() => global.requestAnimationFrame(resolve)));
      global.print();
      if (!global.__androidPrintManaged) global.setTimeout(cleanup, 1500);
      return true;
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  global.CommandesLabelPrinter = Object.freeze({ print: printLabels });
})(window);
