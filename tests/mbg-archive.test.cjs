const test = require('node:test');
const assert = require('node:assert/strict');
const archiveApi = require('../dist/assets/mbg-archive.js');

test('migrasi V8.1 idempoten dan tidak menimpa laporan', () => {
    const now = '2026-09-18T01:00:00.000Z';
    const legacy = { sppg1: { tanggalVal: 'Jumat, 18 September 2026', menuVal: 'Menu aktual' } };
    const first = archiveApi.migrateLegacy(null, legacy, now);
    assert.equal(first.createdIds.length, 1);
    const second = archiveApi.migrateLegacy(first.archive, legacy, now);
    assert.equal(second.createdIds.length, 0);
    assert.equal(Object.keys(second.archive.reports).length, 1);
});

test('duplikasi membuat ID baru tanpa mengubah sumber', () => {
    const source = archiveApi.createReportRecord('sppg1', '2026-09-18', { menuVal: 'Nasi Putih' }, { id: 'rpt_source', now: '2026-09-18T01:00:00.000Z' });
    const base = archiveApi.upsertReport(null, source, '2026-09-18T01:00:00.000Z');
    const result = archiveApi.duplicateReport(base, source.id, { nonce: 'copy-1', now: '2026-09-18T02:00:00.000Z' });
    assert.notEqual(result.report.id, source.id);
    assert.equal(result.report.status, 'draft');
    assert.equal(result.archive.reports[source.id].data.menuVal, 'Nasi Putih');
});

test('arsip menyimpan beberapa laporan pada unit dan tanggal yang sama', () => {
    const one = archiveApi.createReportRecord('sppg1', '2026-09-18', {}, { nonce: 'one' });
    const two = archiveApi.createReportRecord('sppg1', '2026-09-18', {}, { nonce: 'two' });
    let archive = archiveApi.upsertReport(null, one);
    archive = archiveApi.upsertReport(archive, two);
    assert.equal(archiveApi.listReports(archive, 'sppg1').length, 2);
});

test('rasio sekolah tidak mencampur sisa B3', () => {
    const result = archiveApi.splitWasteMetrics([
        { isPosyandu: false, total: 12 },
        { isPosyandu: true, total: 8 }
    ], 1200, 200);
    assert.equal(result.schoolWasteKg, 12);
    assert.equal(result.b3WasteKg, 8);
    assert.equal(result.schoolGramsPerPortion, 10);
    assert.equal(result.b3GramsPerRecipient, 40);
});

test('validator backup menolak aset bukan gambar', () => {
    assert.throws(() => archiveApi.validateBackupPayload({
        app: 'MBG Daily Report',
        archive: archiveApi.createEmptyArchive(),
        assets: [{ key: 'poster_sppg1', dataUrl: 'javascript:alert(1)' }]
    }, ['sppg1']), /aset yang tidak aman/);
});
