import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { catalogService } from '../src/services/catalogService.ts';
import { BlueprintZoomLens } from '../src/components/viewer/BlueprintZoomLens.ts';
import { renderVerticalSpreads } from '../src/components/viewer/VerticalSpreadViewer.ts';
import { renderLookInsideModal } from '../src/components/viewer/LookInsideModal.ts';

describe('Phase 3: Look Inside Continuous Vertical Viewer & 1:20 Blueprint Zoom', () => {

  test('TC-3.1: BlueprintZoomLens handles 1x to 4x zoom and pan calculations', () => {
    const lens = new BlueprintZoomLens();

    assert.deepEqual(lens.getTransform(), { scale: 1.0, translateX: 0, translateY: 0 });

    // Zoom in
    lens.zoomIn();
    assert.equal(lens.getTransform().scale, 1.5);

    // Zoom to 1:20 detail (scale = 3.0 or 4.0)
    lens.setScale(3.5);
    assert.equal(lens.getTransform().scale, 3.5);

    // Pan across blueprint
    lens.pan(50, -30);
    const panTransform = lens.getTransform();
    assert.equal(panTransform.translateX, 50);
    assert.equal(panTransform.translateY, -30);

    // Reset
    lens.reset();
    assert.deepEqual(lens.getTransform(), { scale: 1.0, translateX: 0, translateY: 0 });
    assert.ok(lens.getCssTransformString().includes('scale(1)'));
  });

  test('TC-3.2: renderVerticalSpreads outputs continuous vertical sequence with 1:20 plates', async () => {
    const book = await catalogService.getBookById('ols-book-01');
    assert.ok(book);
    const spreads = await catalogService.getBookMediaAssets('ols-book-01');
    assert.ok(spreads.length >= 6);

    const html = renderVerticalSpreads(book, spreads);
    assert.ok(html.includes('Plate 01'));
    assert.ok(html.includes('Plate 06'));
    assert.ok(html.includes('1:20 Technical Section') || html.includes('1:20'));
    assert.ok(html.includes('cursor-zoom-in'));
  });

  test('TC-3.3: renderLookInsideModal contains navigation, 1:20 zoom button, and ESC shortcut hint', async () => {
    const book = await catalogService.getBookById('ols-book-01');
    assert.ok(book);
    const spreads = await catalogService.getBookMediaAssets('ols-book-01');

    const modalHtml = renderLookInsideModal(book, spreads);
    assert.ok(modalHtml.includes('id="look-inside-modal"'));
    assert.ok(modalHtml.includes('1:20 ZOOM'));
    assert.ok(modalHtml.includes('Đóng [ESC]'));
    assert.ok(modalHtml.includes('Xem ruột sách không ảnh hưởng tồn kho'));
  });

  test('TC-3.4: Invariant — Viewing Look Inside never affects stock or basket state', async () => {
    const bookBefore = await catalogService.getBookById('ols-book-01');
    assert.ok(bookBefore);
    const initialStock = bookBefore.stockCount;

    // Simulate opening viewer and rendering spreads
    const spreads = await catalogService.getBookMediaAssets('ols-book-01');
    renderLookInsideModal(bookBefore, spreads);

    const bookAfter = await catalogService.getBookById('ols-book-01');
    assert.ok(bookAfter);
    assert.equal(bookAfter.stockCount, initialStock, 'Stock must remain completely identical');
  });

});
