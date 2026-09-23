const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../dist/assets/mbg-core.js');

test('escapeHtml menetralkan markup dan atribut berbahaya', () => {
    assert.equal(core.escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});

test('parseMenuItems membersihkan bullet dan nomor', () => {
    assert.deepEqual(core.parseMenuItems('• Nasi putih\n2. Ayam panggang\n- Jeruk'), ['Nasi putih', 'Ayam panggang', 'Jeruk']);
});

test('parseKgValue membaca format desimal Indonesia', () => {
    assert.equal(core.parseKgValue('12,50 kg'), 12.5);
    assert.equal(core.parseKgValue('belum ada'), 0);
});

test('title case bahan menjaga singkatan dan kode ukuran', () => {
    assert.equal(core.toMaterialTitleCase('beras rms'), 'Beras RMS');
    assert.equal(core.toMaterialTitleCase('susu uht 125ml'), 'Susu UHT 125ml');
    assert.equal(core.toMaterialTitleCase('bawang putih bubuk'), 'Bawang Putih Bubuk');
    assert.equal(core.toMaterialTitleCase('minyak.resto'), 'Minyak Resto');
    assert.equal(core.toMaterialTitleCase('saus asam-manis'), 'Saus Asam-Manis');
});

test('klasifikasi bahan mendahulukan frasa khusus dan tidak menebak bahan asing', () => {
    assert.equal(core.classifyIngredientCategory('Manggis'), 'buah');
    assert.equal(core.classifyIngredientCategory('Daun Jeruk'), 'bumbu');
    assert.equal(core.classifyIngredientCategory('Jagung Utuh Kupas'), 'sayur');
    assert.equal(core.classifyIngredientCategory('Bahan Baru Eksperimental'), 'unknown');
});

test('header tanggal lama dipisahkan dari teks operasional', () => {
    assert.equal(core.stripEmbeddedDateHeaders('Kedatangan bahan baku hari Minggu, 13 September 2026\n\nWortel : 10 kg', 'materials'), 'Wortel : 10 kg');
    assert.equal(core.stripEmbeddedDateHeaders('LAPORAN SISA\nTanggal: Senin, 14 September 2026\n\nNasi: 1 kg', 'waste'), 'LAPORAN SISA\nNasi: 1 kg');
});

test('normalizeName menyamakan variasi identitas sekolah', () => {
    assert.equal(core.normalizeName('SDN Sukamaju 03'), 'sukamaju3');
    assert.equal(core.normalizeName('SDN SKM 003'), 'sukamaju3');
});

test('klasifikasi sekolah membedakan B3 dan sekolah', () => {
    assert.equal(core.isSchoolInstitution('SMPN 6 Depok'), true);
    assert.equal(core.isSchoolInstitution('PAUD Dahlia'), true);
    assert.equal(core.isSchoolInstitution('Posyandu Melati'), false);
});

test('varian analisis deterministik untuk data yang sama', () => {
    const choices = ['a', 'b', 'c'];
    assert.equal(core.pickAnalysisVariant(choices, 'unit-1', 'gizi'), core.pickAnalysisVariant(choices, 'unit-1', 'gizi'));
});

test('nama file aman dari karakter terlarang', () => {
    assert.equal(core.safeFilename('Laporan: SPPG/01?'), 'Laporan SPPG01');
});

test('identitas akuntan resmi tervalidasi', () => {
    assert.equal(core.validateIdentity('sppg1', { akuntan: 'Putri Sribarokah' }).length, 0);
    assert.equal(core.validateIdentity('sppg1', { akuntan: 'Putri Sibarokah' })[0].level, 'error');
});

test('checkpoint autosave menyimpan unit, waktu, alasan, dan data', () => {
    const data = { menuVal: 'Nasi putih', updatedAt: '2026-09-17T04:00:00.000Z' };
    assert.deepEqual(core.buildAutosaveCheckpoint('sppg1', data, 'periodic', data.updatedAt), {
        schemaVersion: 1,
        unitId: 'sppg1',
        savedAt: '2026-09-17T04:00:00.000Z',
        reason: 'periodic',
        data
    });
});

test('data dapat dipulihkan dari checkpoint ketika penyimpanan utama rusak', () => {
    const data = { menuVal: 'Menu terselamatkan', updatedAt: '2026-09-17T04:00:00.000Z' };
    const checkpoint = core.buildAutosaveCheckpoint('sppg1', data, 'periodic', data.updatedAt);
    assert.deepEqual(core.recoverSavedData('{rusak', JSON.stringify(checkpoint)), { data, source: 'checkpoint' });
});

test('data utama tetap dipilih ketika checkpoint tidak lebih baru', () => {
    const primary = { menuVal: 'Data utama', updatedAt: '2026-09-17T05:00:00.000Z' };
    const checkpoint = core.buildAutosaveCheckpoint('sppg1', { menuVal: 'Data lama' }, 'periodic', '2026-09-17T04:00:00.000Z');
    assert.deepEqual(core.recoverSavedData(JSON.stringify(primary), JSON.stringify(checkpoint)), { data: primary, source: 'primary' });
});

test('laporan kosong V8.1 memakai struktur distribusi kanonis', () => {
    assert.deepEqual(core.createEmptyDistributionState(), {
        pagi: { time: '09.00', rows: [] },
        siang: { time: '11.00', rows: [] },
        b3: { time: '09.00', rows: [] },
        sourceRaw: ''
    });
});

test('normalisasi memperbaiki struktur distribusi laporan kosong V8.1 yang bermasalah', () => {
    const broken = { morning: [], afternoon: [], b3: [], sourceRaw: '' };
    assert.deepEqual(core.normalizeDistributionState(broken), core.createEmptyDistributionState());
});

test('normalisasi mempertahankan baris distribusi lama dan tidak mengubah sumber', () => {
    const legacy = {
        morning: [{ name: 'SDN Sukamaju 1', kecil: 10, besar: 20 }],
        afternoon: [{ name: 'SDN Sukamaju 6', kecil: 5, besar: 6 }],
        b3: [{ name: 'Pos Anggrek', balita: 7, bumil: 1, busui: 2 }],
        sourceRaw: 'Data lama'
    };
    const normalized = core.normalizeDistributionState(legacy);
    assert.equal(normalized.pagi.rows[0].name, 'SDN Sukamaju 1');
    assert.equal(normalized.siang.rows[0].besar, 6);
    assert.equal(normalized.b3.rows[0].busui, 2);
    normalized.pagi.rows[0].name = 'Diubah';
    assert.equal(legacy.morning[0].name, 'SDN Sukamaju 1');
});

test('normalisasi memakai hasil parsing teks ketika data terstruktur belum tersedia', () => {
    const parsed = {
        pagi: { time: '08.30', rows: [{ name: 'SDN 1', kecil: 1, besar: 2 }] },
        siang: { time: '11.30', rows: [] },
        b3: { time: '09.15', rows: [] },
        sourceRaw: 'Teks distribusi'
    };
    assert.deepEqual(core.normalizeDistributionState({}, parsed), parsed);
});
