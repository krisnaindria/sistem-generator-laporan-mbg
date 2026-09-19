(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.MBGArchive = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SCHEMA_VERSION = 4;
    const REPORT_STATUSES = Object.freeze(['draft', 'needs_review', 'ready', 'approved', 'exported']);

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function hash(value) {
        let result = 2166136261;
        for (const char of String(value || '')) {
            result ^= char.charCodeAt(0);
            result = Math.imul(result, 16777619);
        }
        return (result >>> 0).toString(36);
    }

    function normalizeDateIso(value, fallback = '') {
        const source = String(value || '').trim();
        const iso = source.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
        const isValidDate = (year, month, day) => {
            const date = new Date(Number(year), Number(month) - 1, Number(day));
            return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day);
        };
        if (iso && isValidDate(iso[1], iso[2], iso[3])) return `${iso[1]}-${iso[2]}-${iso[3]}`;
        const months = {
            januari: '01', februari: '02', maret: '03', april: '04', mei: '05', juni: '06',
            juli: '07', agustus: '08', september: '09', oktober: '10', november: '11', desember: '12'
        };
        const localized = source.match(/\b(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})\b/i);
        if (localized) {
            const month = months[localized[2].toLowerCase()];
            const day = String(Number(localized[1])).padStart(2, '0');
            if (isValidDate(localized[3], month, day)) return `${localized[3]}-${month}-${day}`;
        }
        return String(fallback || '');
    }

    function normalizeStatus(value) {
        return REPORT_STATUSES.includes(value) ? value : 'draft';
    }

    function createEmptyArchive(now = new Date()) {
        const timestamp = new Date(now).toISOString();
        return {
            app: 'MBG Daily Report',
            schemaVersion: SCHEMA_VERSION,
            createdAt: timestamp,
            updatedAt: timestamp,
            reports: {},
            activeReportByUnit: {},
            migration: { sourceVersion: null, completedAt: null, migratedReportIds: [] }
        };
    }

    function createReportId(unitId, dateIso, nonce) {
        const cleanUnit = String(unitId || 'unit').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'unit';
        const cleanDate = normalizeDateIso(dateIso, 'undated').replace(/[^0-9-]/g, '') || 'undated';
        return `rpt_${cleanUnit}_${cleanDate}_${hash(nonce || `${Date.now()}_${Math.random()}`)}`;
    }

    function createReportRecord(unitId, dateIso, data = {}, options = {}) {
        if (!unitId) throw new TypeError('Unit laporan wajib tersedia');
        const now = new Date(options.now || Date.now()).toISOString();
        const normalizedDate = normalizeDateIso(dateIso, now.slice(0, 10));
        const id = options.id || createReportId(unitId, normalizedDate, options.nonce);
        return {
            id,
            unitId: String(unitId),
            dateIso: normalizedDate,
            status: normalizeStatus(options.status),
            title: String(options.title || '').trim(),
            createdAt: options.createdAt || now,
            updatedAt: options.updatedAt || now,
            source: options.source || 'v8.1',
            data: clone(data || {})
        };
    }

    function normalizeArchive(value, now = new Date()) {
        const archive = value && typeof value === 'object' ? clone(value) : createEmptyArchive(now);
        archive.app = 'MBG Daily Report';
        archive.schemaVersion = SCHEMA_VERSION;
        archive.reports = archive.reports && typeof archive.reports === 'object' ? archive.reports : {};
        archive.activeReportByUnit = archive.activeReportByUnit && typeof archive.activeReportByUnit === 'object' ? archive.activeReportByUnit : {};
        archive.migration = archive.migration && typeof archive.migration === 'object'
            ? archive.migration
            : { sourceVersion: null, completedAt: null, migratedReportIds: [] };
        archive.migration.migratedReportIds = Array.isArray(archive.migration.migratedReportIds) ? archive.migration.migratedReportIds : [];
        Object.entries(archive.reports).forEach(([id, report]) => {
            if (!report || typeof report !== 'object' || !report.unitId || !report.data || typeof report.data !== 'object') {
                delete archive.reports[id];
                return;
            }
            report.id = id;
            report.dateIso = normalizeDateIso(report.dateIso || report.data.tanggalVal, '');
            report.status = normalizeStatus(report.status);
        });
        return archive;
    }

    function upsertReport(archiveValue, reportValue, now = new Date()) {
        const archive = normalizeArchive(archiveValue, now);
        const report = createReportRecord(reportValue.unitId, reportValue.dateIso, reportValue.data, {
            ...reportValue,
            id: reportValue.id,
            createdAt: reportValue.createdAt,
            updatedAt: new Date(now).toISOString()
        });
        archive.reports[report.id] = report;
        archive.activeReportByUnit[report.unitId] = report.id;
        archive.updatedAt = report.updatedAt;
        return archive;
    }

    function migrateLegacy(archiveValue, legacyUnits, now = new Date()) {
        const archive = normalizeArchive(archiveValue, now);
        if (archive.migration?.completedAt) return { archive, createdIds: [] };
        const createdIds = [];
        Object.entries(legacyUnits || {}).forEach(([unitId, data]) => {
            if (!data || typeof data !== 'object') return;
            const dateIso = normalizeDateIso(data.tanggalVal, new Date(now).toISOString().slice(0, 10));
            const id = createReportId(unitId, dateIso, `legacy|${unitId}|${dateIso}|${hash(JSON.stringify(data))}`);
            if (!archive.reports[id]) {
                archive.reports[id] = createReportRecord(unitId, dateIso, data, {
                    id,
                    status: 'draft',
                    source: 'legacy-v8.0.5',
                    now,
                    createdAt: data.updatedAt || new Date(now).toISOString(),
                    updatedAt: data.updatedAt || new Date(now).toISOString()
                });
                createdIds.push(id);
            }
            if (!archive.activeReportByUnit[unitId]) archive.activeReportByUnit[unitId] = id;
        });
        archive.migration = {
            sourceVersion: '8.0.5',
            completedAt: new Date(now).toISOString(),
            migratedReportIds: [...new Set([...(archive.migration.migratedReportIds || []), ...createdIds])]
        };
        archive.updatedAt = new Date(now).toISOString();
        return { archive, createdIds };
    }

    function listReports(archiveValue, unitId) {
        const archive = normalizeArchive(archiveValue);
        return Object.values(archive.reports)
            .filter(report => !unitId || report.unitId === unitId)
            .sort((a, b) => String(b.dateIso).localeCompare(String(a.dateIso)) || Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
    }

    function duplicateReport(archiveValue, reportId, options = {}) {
        const archive = normalizeArchive(archiveValue, options.now);
        const source = archive.reports[reportId];
        if (!source) throw new Error('Laporan sumber tidak ditemukan');
        const dateIso = normalizeDateIso(options.dateIso, source.dateIso);
        const copy = createReportRecord(source.unitId, dateIso, source.data, {
            now: options.now,
            nonce: options.nonce,
            status: 'draft',
            source: `duplicate:${source.id}`,
            title: options.title || source.title
        });
        archive.reports[copy.id] = copy;
        archive.activeReportByUnit[source.unitId] = copy.id;
        archive.updatedAt = copy.updatedAt;
        return { archive, report: copy };
    }

    function splitWasteMetrics(institutions, schoolPortions, b3Portions, options = {}) {
        const measured = (institutions || []).filter(item => item && Number.isFinite(Number(item.total)));
        const schoolWasteKg = measured.filter(item => !item.isPosyandu).reduce((sum, item) => sum + Number(item.total), 0);
        const b3WasteKg = measured.filter(item => item.isPosyandu).reduce((sum, item) => sum + Number(item.total), 0);
        const communal = Boolean(options.communal);
        const measuredTotal = schoolWasteKg + b3WasteKg;
        const reportedTotal = Number(options.totalWasteKg);
        const hasPartition = !communal || (Number.isFinite(reportedTotal) && Math.abs(measuredTotal - reportedTotal) <= 0.01);
        return {
            schoolWasteKg,
            b3WasteKg,
            totalWasteKg: schoolWasteKg + b3WasteKg,
            schoolGramsPerPortion: hasPartition && schoolPortions > 0 ? schoolWasteKg * 1000 / schoolPortions : null,
            b3GramsPerRecipient: hasPartition && b3Portions > 0 ? b3WasteKg * 1000 / b3Portions : null,
            hasPartition
        };
    }

    function validateAssetRecord(asset) {
        if (!asset || typeof asset !== 'object' || !/^[a-z0-9_.:-]{1,160}$/i.test(String(asset.key || ''))) return false;
        if (typeof asset.dataUrl !== 'string' || asset.dataUrl.length > 16 * 1024 * 1024) return false;
        if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(asset.dataUrl)) return true;
        if (String(asset.key).startsWith('docs_')) {
            try {
                const parsed = JSON.parse(asset.dataUrl);
                return [1, 4, 6].includes(parsed.mode) && Array.isArray(parsed.photos) && parsed.photos.every(src =>
                    /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(String(src || '')) || /^placeholder-[a-z-]+\.svg$/i.test(String(src || ''))
                );
            } catch (error) { return false; }
        }
        return false;
    }

    function validateBackupPayload(payload, allowedUnits = []) {
        if (!payload || payload.app !== 'MBG Daily Report') throw new Error('Format backup tidak dikenali');
        const units = new Set(allowedUnits);
        if (payload.archive) {
            if (!payload.archive.reports || typeof payload.archive.reports !== 'object' || Array.isArray(payload.archive.reports)) {
                throw new Error('Struktur laporan dalam backup tidak valid');
            }
            Object.entries(payload.archive.reports).forEach(([id, report]) => {
                if (!report || typeof report !== 'object' || Array.isArray(report) || !report.unitId || !report.data || typeof report.data !== 'object' || Array.isArray(report.data)) {
                    throw new Error(`Rekaman laporan tidak valid: ${id}`);
                }
            });
            const archive = normalizeArchive(payload.archive);
            Object.values(archive.reports).forEach(report => {
                if (units.size && !units.has(report.unitId)) throw new Error(`Unit backup tidak dikenal: ${report.unitId}`);
                if (JSON.stringify(report.data).length > 2 * 1024 * 1024) throw new Error(`Data laporan terlalu besar: ${report.id}`);
                for (const field of ['distVal', 'wasteVal', 'menuVal', 'kedatanganVal', 'readyVal', 'logisticsVal', 'fruitVal', 'tanggalVal', 'theme']) {
                    if (report.data[field] !== undefined && typeof report.data[field] !== 'string') throw new Error(`Tipe data laporan tidak valid: ${field}`);
                }
            });
        } else if (!payload.units || typeof payload.units !== 'object') {
            throw new Error('Backup tidak memuat arsip atau data unit');
        }
        if (payload.assets && (!Array.isArray(payload.assets) || !payload.assets.every(validateAssetRecord))) {
            throw new Error('Backup memuat aset yang tidak aman atau rusak');
        }
        return true;
    }

    return {
        SCHEMA_VERSION,
        REPORT_STATUSES,
        normalizeDateIso,
        normalizeStatus,
        createEmptyArchive,
        createReportId,
        createReportRecord,
        normalizeArchive,
        upsertReport,
        migrateLegacy,
        listReports,
        duplicateReport,
        splitWasteMetrics,
        validateAssetRecord,
        validateBackupPayload
    };
});
