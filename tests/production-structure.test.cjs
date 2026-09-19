const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
const coreSource = fs.readFileSync(path.join(__dirname, '..', 'dist', 'assets', 'mbg-core.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

test('dokumen memiliki bahasa, skip link, dan landmark utama', () => {
    assert.match(html, /<html lang="id"/);
    assert.match(html, /href="#reportContainer"/);
    assert.match(html, /<main[^>]+id="reportContainer"/);
});

test('status dinamis diumumkan ke pembaca layar', () => {
    assert.match(html, /id="autosaveStatus"[^>]+aria-live="polite"/);
    assert.match(html, /id="globalToast"[^>]+aria-live="assertive"/);
});

test('autosave berkala membuat checkpoint setiap 30 detik dan saat halaman ditutup', () => {
    assert.match(html, /window\.AUTOSAVE_INTERVAL_MS = 30000/);
    assert.match(html, /window\.periodicAutosaveTimer = setInterval\([\s\S]*?periodic-30s[\s\S]*?window\.AUTOSAVE_INTERVAL_MS\);/);
    assert.match(html, /mbg_autosave_checkpoint_\$\{key\}/);
    assert.match(html, /window\.startPeriodicAutosave\(\);/);
    assert.match(html, /window\.addEventListener\('pagehide'[\s\S]*?reason: 'pagehide'/);
    assert.match(html, /document\.addEventListener\('visibilitychange'[\s\S]*?reason: 'visibility-hidden'/);
});

test('versi dan modul domain produksi termuat', () => {
    assert.match(html, /VERSI 8\.1/);
    assert.match(html, /assets\/mbg-core\.js/);
    assert.match(html, /assets\/mbg-archive\.js/);
});

test('hardening produksi dan reduced motion tersedia', () => {
    assert.match(html, /Content-Security-Policy/);
    assert.match(html, /noindex,nofollow,noarchive/);
    assert.match(html, /prefers-reduced-motion/);
    assert.match(html, /checkProductionDependencies/);
});

test('dependensi produksi dimuat lokal dengan versi terkunci', () => {
    assert.doesNotMatch(html, /https:\/\/(cdn\.tailwindcss\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)/);
    assert.match(html, /assets\/app\.css/);
    assert.match(html, /assets\/vendor\/jspdf-4\.2\.1\.umd\.min\.js/);
    assert.doesNotMatch(html, /jspdf-2\.5\.1/);
    assert.match(html, /assets\/vendor\/html2canvas-1\.4\.1\.min\.js/);
    assert.match(html, /assets\/fontawesome\/css\/all\.min\.css/);
    assert.equal(packageJson.devDependencies.jspdf, '4.2.1');
});

test('tanda tangan tidak disertakan sebagai aset publik', () => {
    for (const file of ['signature-agung.png', 'signature-putri.png', 'signature-sabrina.png', 'signature-krisna.png']) {
        assert.equal(fs.existsSync(path.join(__dirname, '..', 'dist', file)), false, `${file} masih berada dalam paket publik`);
        assert.doesNotMatch(html, new RegExp(file.replace('.', '\\.')));
    }
    assert.match(html, /sign_\$\{sppgKey\}_\$\{item\.role\}/);
    assert.match(html, /Tersimpan Lokal/);
});

test('V8.1 membuat salinan keselamatan dan hanya bermigrasi jika snapshot berhasil', () => {
    assert.match(html, /mbg_pre_update_backup_v8_0_1/);
    assert.match(html, /const migrationSafetyReady = window\.createV81MigrationSafetyCopy\(\);\s*if \(migrationSafetyReady\) \{\s*window\.migrateReportsToV81\(\);/s);
    assert.match(html, /window\.reportArchiveHealth = 'error';\s*}\s*await window\.migrateLegacyAssets\(\);/s);
    assert.match(html, /targetVersion: '8\.0\.1'/);
});

test('V8.0.2 menyediakan workspace preview yang tersinkron', () => {
    assert.match(html, /id="workspaceShell"/);
    assert.match(html, /id="previewWorkspaceToolbar"/);
    assert.match(html, /id="previewStage"/);
    assert.equal((html.match(/<option value="[1-9]">Halaman/g) || []).length, 9);
    assert.equal((html.match(/<div id="editorPanel[^"]+" data-editor-section=/g) || []).length, 7);
    assert.match(html, /window\.setActivePreviewPage/);
    assert.match(html, /window\.openEditorSection/);
    assert.match(html, /window\.setPreviewWorkspaceMode/);
});

test('ekspor tetap menangkap sembilan halaman di mode sinkron', () => {
    assert.match(html, /document\.body\.classList\.add\('export-capture'\)/);
    assert.match(html, /document\.body\.classList\.remove\('export-capture'\)/);
    assert.match(html, /document\.getElementById\('previewStage'\)\.innerHTML/);
    assert.match(html, /body\.export-capture #previewStage \.a4-page/);
});

test('ekspor diblokir untuk masalah wajib', () => {
    assert.match(html, /if \(errors\.length\) \{[\s\S]*?Ekspor diblokir:[\s\S]*?return false;/);
    assert.match(html, /normalizeReferenceValue/);
    assert.match(html, /Data unit masih dimuat\. Tunggu hingga proses selesai sebelum mengekspor/);
});

test('data yang sama dengan referensi memblokir ekspor sampai dikonfirmasi', () => {
    for (const label of ['Menu utama', 'Distribusi dan penerima', 'Sisa makanan', 'Kedatangan bahan baku', 'Kesiapan bahan masak / ready stock']) {
        assert.match(html, new RegExp(label.replace('/', '\\/')));
    }
    assert.match(html, /unchangedSamples\.forEach\(\(\{ id, label \}\) => \{[\s\S]*?addValidationIssue\(\s*'error'/);
    assert.match(html, /masih sama dengan referensi unit\. Pastikan data tersebut memang berlaku untuk laporan hari ini/);
    assert.doesNotMatch(html, /bagian masih memakai data referensi unit\. Perbarui data aktual sebelum ekspor/);
});

test('data referensi dapat dikonfirmasi dengan checkbox yang terikat isi dan tanggal', () => {
    assert.match(html, /Saya sudah memeriksa—data ini benar\./);
    assert.match(html, /window\.getReferenceConfirmationToken/);
    assert.match(html, /referenceConfirmations: JSON\.parse/);
    assert.match(html, /savedData\?\.referenceConfirmations/);
    assert.match(html, /confirmation\?\.token === window\.getReferenceConfirmationToken\(id\)/);
    assert.match(html, /delete window\.referenceConfirmations\[sourceId\]/);
});

test('nama menu lengkap tidak dipotong di builder maupun kartu laporan', () => {
    assert.match(html, /<textarea rows="2" class="menu-name-field"/);
    assert.match(html, /\.menu-title-2lines \{[\s\S]*?overflow: visible;/);
    assert.doesNotMatch(html, /-webkit-line-clamp:\s*2/);
    assert.match(html, /min-h-\[90px\] text-center/);
});

test('nama menu lengkap dipertahankan pada tabel dan ringkasan sisa makanan', () => {
    assert.equal((html.match(/food-waste-component-label/g) || []).length >= 5, true);
    assert.match(html, /#headerWasteRow \.food-waste-component-label \{[\s\S]*?white-space: normal;[\s\S]*?overflow-wrap: anywhere;/);
    assert.match(html, /const menuLabelLocked = \{ nasi: false, hewani: false, sayur: false, nabati: false \};/);
    assert.match(html, /rawKey\.length > 2 && !menuLabelLocked\[keyCat\]/);
    assert.match(html, /rawKey\.length > 2 && !menuLabelLocked\[category\]/);
});

test('V8.0.3 menyediakan builder menu, buah, dan distribusi', () => {
    assert.match(html, /id="menuBuilderPanel"/);
    assert.match(html, /id="fruitBuilderPanel"/);
    assert.match(html, /id="distributionBuilderPanel"/);
    assert.match(html, /window\.addMenuRow/);
    assert.match(html, /window\.removeMenuRow/);
    assert.match(html, /window\.addDistributionRow/);
    assert.match(html, /window\.removeDistributionRow/);
    assert.match(html, /schemaVersion: 4/);
});

test('V8.0.4 menyediakan dark mode adaptif tanpa mengubah halaman A4', () => {
    assert.match(html, /id="uiModeToggle"/);
    assert.match(html, /id="uiColorModeSelector"/);
    assert.match(html, /mbg_ui_color_mode/);
    assert.match(html, /prefers-color-scheme: dark/);
    assert.match(html, /window\.applyColorMode/);
    assert.match(html, /window\.toggleColorMode/);
    assert.match(html, /data-color-mode="dark"/);
    assert.match(html, /\.a4-page \{ color-scheme: light; color: #0f172a; \}/);
});

test('V8.0.5 memperbaiki klasifikasi, kontras validasi, dan sinkronisasi workspace', () => {
    assert.match(coreSource, /function classifyIngredientCategory/);
    assert.match(html, /data-validation-state="ready"/);
    assert.match(html, /data-validation-state="error"/);
    assert.match(html, /data-validation-state="warning"/);
    assert.match(html, /data-editor-preview-page="5"/);
    assert.match(html, /data-editor-preview-page="7"/);
    assert.match(html, /data-editor-preview-page="8"/);
    assert.match(html, /scrollPreview: true/);
    assert.match(html, /activePage\?\.scrollIntoView/);
    assert.match(html, /programmaticAccordionOpens = new WeakSet/);
    assert.match(html, /id="inputLogistikOperasional"[^>]+onblur="window\.normalizeMaterialTextarea\(this\)"/);
});

test('builder distribusi tetap utuh di sidebar sempit', () => {
    assert.match(html, /\.distribution-row \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\) 44px;/);
    assert.match(html, /\.distribution-row label:first-child \{ grid-column: 1 \/ -1; \}/);
    assert.match(html, /\.distribution-row:not\(\.b3-row\) label:nth-of-type\(4\) \{ grid-column: 3 \/ 5; \}/);
    assert.match(html, /\.distribution-row \.remove-row \{ grid-column: 5; \}/);
    assert.doesNotMatch(html, /\.distribution-row, \.distribution-row\.b3-row \{ grid-template-columns: 1fr 1fr; \}/);
});

test('tanggal bagian laporan menjadi badge terkunci dan tidak ditulis ulang ke textarea', () => {
    for (const id of ['badgeDateMaterials', 'badgeDateFruit', 'badgeDateDistribution', 'badgeDateWaste']) assert.match(html, new RegExp(`id="${id}"`));
    assert.match(html, /window\.updateLockedDateBadges/);
    assert.doesNotMatch(html, /distText\.replace/);
    assert.doesNotMatch(html, /inputSisa\.value = sisaText\.replace/);
});

test('normalisasi bahan mempertahankan singkatan penting', () => {
    assert.match(coreSource, /\['rms', 'RMS'\]/);
    assert.match(coreSource, /\['uht', 'UHT'\]/);
    assert.match(html, /window\.normalizeMaterialTextarea/);
});

test('kontrol editor memakai teks minimum 14 piksel', () => {
    assert.match(html, /#sidebarControl[^}]+font-size: 14px !important/s);
});

test('kalender memakai tanggal lokal sistem saat aplikasi dibuka', () => {
    assert.match(html, /id="inputTanggal" value="" placeholder="Mengikuti tanggal sistem"/);
    assert.match(html, /id="datePickerInput" value=""/);
    assert.match(html, /window\.selectSppg\('sppg1', \{ skipSave: true \}\)/);
    assert.match(html, /const hasSavedReport = window\.loadSppgData\(sppgKey\);[\s\S]*?if \(!hasSavedReport\)[\s\S]*?window\.applySystemDate\(\{ persist: false, sync: false \}\);/);
    assert.match(html, /const today = options\.now instanceof Date \? options\.now : new Date\(\)/);
});

test('V8.1 menyediakan arsip harian, status, migrasi aman, dan laporan tanpa contoh otomatis', () => {
    assert.match(html, /id="reportArchivePanel"/);
    assert.match(html, /id="reportHistorySelect"/);
    assert.match(html, /id="reportStatusSelector"/);
    assert.match(html, /mbg_v81_report_archive/);
    assert.match(html, /mbg_pre_update_backup_v8_1/);
    assert.match(html, /window\.migrateReportsToV81\(\);/);
    assert.match(html, /window\.createNewBlankReport/);
    assert.match(html, /window\.deleteActiveReport/);
    assert.match(html, /inputDist\.value = pick\('distVal', ''\)/);
    assert.match(html, /inputWaste\.value = pick\('wasteVal', ''\)/);
    assert.match(html, /inputMenu\.value = pick\('menuVal', ''\)/);
    assert.match(html, /id="inputMenu"[^>]*><\/textarea>/);
    assert.match(html, /id="inputEvaluasiBuah"[^>]*><\/textarea>/);
    assert.match(html, /window\.isUnitDataLoading = false;\s*window\.syncData\(\);/);
    assert.doesNotMatch(html, /img:not\(\.hidden\)/);
});

test('V8.1 memblokir data referensi tanpa konfirmasi dan memisahkan metrik Sekolah dari B3', () => {
    assert.match(html, /unchangedSamples\.forEach[\s\S]*?'error',[\s\S]*?masih sama dengan referensi unit/);
    assert.match(html, /window\.MBGArchive\.splitWasteMetrics/);
    assert.match(html, /schoolWasteKg/);
    assert.match(html, /b3WasteKg/);
    assert.doesNotMatch(html, /\(finalGrandTotalKg \* 1000\) \/ totalSiswaSekolah/);
});

test('V8.1 mengikat unggahan asinkron ke unit dan report ID asal', () => {
    assert.match(html, /const unitId = window\.currentSppgKey;\s*const reportId = window\.currentReportId;/);
    assert.match(html, /window\.currentSppgKey !== unitId \|\| window\.currentReportId !== reportId/);
    assert.match(html, /window\.getReportAssetKey\('docs'/);
    assert.match(html, /window\.getReportAssetKey\('poster'/);
});

test('ringkasan porsi menampilkan kecil lalu besar pada baris terpisah', () => {
    assert.match(html, /id="cardPorsiBesarKecilTitle">PORSI KECIL \/ BESAR<\/span>/);
    assert.match(html, /id="cardPorsiBesarKecil">641 \/ 887<\/span>/);
    assert.match(html, /cardPorsiBesarKecil'\)\.textContent = `\$\{totalPorsiKecil[^`]+\$\{totalPorsiBesar/s);
    assert.equal((html.match(/distribution-summary-card/g) || []).length >= 6, true);
    assert.equal((html.match(/distribution-summary-label/g) || []).length >= 6, true);
    assert.equal((html.match(/distribution-summary-value/g) || []).length >= 6, true);
    assert.doesNotMatch(html, /cardPorsiBesarKecilTitle[^>]*leading-tight/);
});
