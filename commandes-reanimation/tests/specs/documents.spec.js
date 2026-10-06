const { test } = require('@playwright/test');
const { ouvrir, expect } = require('./outils');

for (const module of ['solutes', 'materiel_reanimation', 'aide_soignant']) {
  test(`${module} : PDF de commande, planche d’étiquettes et liste papier`, async ({ page }) => {
    await ouvrir(page, module);
    const r = await page.evaluate(async () => {
      items.filter(aUneDotation).slice(0, 5).forEach(it => { it.inventaire = 0; });
      signatureEl.value = 'Test';
      const pdf = await generatePdfBlob();
      const liste = items.filter(articleEtiquetable).slice(0, 30);
      const etiquettes = await generateLabelsPdfBlob(liste, window.CommandesLabelFormats.get('avery-plastifie'));
      renderPrintTable();
      const papier = window.modeDegradeDocument('', 'pharmacie');
      return {
        pdf: pdf.size, pdfType: pdf.type, etiquettes: etiquettes.size,
        lignes: document.querySelectorAll('#printSheets tbody tr:not(.p-type-row)').length,
        papier: (papier.match(/<tr class="article"/g) || []).length,
      };
    });
    expect(r.pdfType).toBe('application/pdf');
    expect(r.pdf).toBeGreaterThan(1000);
    expect(r.etiquettes).toBeGreaterThan(1000);
    expect(r.lignes).toBe(5);
    expect(r.papier).toBeGreaterThan(0);
  });
}

test('impression directe des étiquettes : planche construite puis nettoyée', async ({ page }) => {
  await page.addInitScript(() => { window.print = () => setTimeout(() => dispatchEvent(new Event('afterprint')), 10); });
  await ouvrir(page, 'solutes');
  const n = await page.evaluate(async () => {
    let cellules = 0;
    const p = window.print;
    window.print = () => { cellules = document.querySelectorAll('#commandesLabelPrintRoot .commandes-label-cell.barcode').length; p(); };
    await window.CommandesLabelPrinter.print({ list: items.slice(0, 4), format: window.CommandesLabelFormats.get('standard-27'), kind: 'barcode', orderReference: referenceSansPrefixe });
    await new Promise(r => setTimeout(r, 200));
    return { cellules, restant: document.querySelectorAll('#commandesLabelPrintRoot').length };
  });
  expect(n).toEqual({ cellules: 4, restant: 0 });
});
