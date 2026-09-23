(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.MBGCore = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function parseMenuItems(text) {
        if (!text) return [];
        return String(text).split('\n')
            .map(line => line.replace(/^[\s•\-*\d.)]+/, '').trim())
            .filter(Boolean);
    }

    function parseKgValue(value) {
        if (!value) return 0;
        const normalized = String(value).trim().replace(',', '.').replace(/[^0-9.-]/g, '');
        const parsed = Number.parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function toMaterialTitleCase(value) {
        const exceptions = new Map([
            ['rms', 'RMS'], ['uht', 'UHT'], ['haccp', 'HACCP'], ['bgn', 'BGN'],
            ['ml', 'ml'], ['kg', 'kg'], ['gr', 'gr'], ['pcs', 'pcs'], ['dus', 'dus']
        ]);
        const capitalizePart = part => {
            const lower = part.toLocaleLowerCase('id-ID');
            if (exceptions.has(lower)) return exceptions.get(lower);
            if (!lower || /^@?\d/.test(part) || /\d/.test(part)) return part;
            return lower.charAt(0).toLocaleUpperCase('id-ID') + lower.slice(1);
        };
        return String(value || '').trim().replace(/[._]+/g, ' ').split(/\s+/).map(word => {
            const lower = word.toLocaleLowerCase('id-ID');
            if (exceptions.has(lower)) return exceptions.get(lower);
            if (/^@?\d/.test(word) || /\d/.test(word)) return word;
            return word.split('-').map(capitalizePart).join('-');
        }).join(' ');
    }

    function classifyIngredientCategory(value) {
        const name = String(value || '').toLocaleLowerCase('id-ID')
            .replace(/[._-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!name) return 'unknown';

        // Frasa khusus harus diperiksa sebelum kata umum seperti "jeruk".
        if (/(daun jeruk|daun salam|jeruk nipis|air jeruk|perasan jeruk)/i.test(name)) return 'bumbu';
        if (/(wortel|kol|sayur|labu|pokcoy|pakcoy|bayam|kangkung|tomat|buncis|jagung|timun|terong|sawi|toge|tauge|brokoli|kembang kol)/i.test(name)) return 'sayur';
        if (/(tempe|tahu|edamame|tofu|jamur|kacang)/i.test(name)) return 'protein_nabati';
        if (/(dada|paha|ayam|chicken|daging|sapi|beef|ikan|dori|fish|telur|egg|kornet|nugget|sosis|bakso|udang|cumi|rolade|fillet|giling)/i.test(name)) return 'protein_hewani';
        if (/(beras|rms|nasi|kentang|singkong|ubi|bihun|mie)/i.test(name)) return 'karbo';
        if (/(tepung|terigu|roti|panir|serbaguna|maizena|tapioka|tapioca|baking)/i.test(name)) return 'tepung';
        if (/(minyak|resto|margarin|margarine|truffle|wijen|blueband|butter|mentega|lemak)/i.test(name)) return 'minyak';
        if (/(cream|susu|uht|keju|cheese|milk|pasteurisasi)/i.test(name)) return 'dairy';
        if (/(kecap|saus|sauce|tiram|saori|chili|sambal|mayo|mayonnaise|cuka)/i.test(name)) return 'saus';
        if (/(jeruk|pisang|apel|melon|semangka|pepaya|kelengkeng|salak|anggur|pear|pir|mangga|manggis|mangis|mangosteen|naga|jambu|duku|leci|buah)/i.test(name)) return 'buah';
        if (/(bawang|lada|merica|garam|gula|kaldu|parsley|ketumbar|kunyit|jahe|lengkuas|sereh|serai|pala|cengkeh|kayu manis|basil|oregano|thyme|rosemary|paprika|cabai)/i.test(name)) return 'bumbu';
        return 'unknown';
    }

    function stripEmbeddedDateHeaders(text, type) {
        const patterns = {
            materials: /^\s*Kedatangan\s+bahan\s+baku[^\n]*(?:\n+)?/i,
            fruit: /^\s*laporan\s+kedatangan\s+buah[^\n]*(?:\n+)?/i,
            distribution: /^\s*Pengiriman\s+hari\s+ini[^\n]*(?:\n+)?/i,
            waste: /^\s*(?:📅\s*)?Tanggal\s*:[^\n]*(?:\n+)?/im
        };
        return String(text || '').replace(patterns[type] || /$^/, '').replace(/^\s*\n/, '').trim();
    }

    function normalizeName(name) {
        return String(name || '').toLowerCase()
            .replace(/\bskm\b/g, 'sukamaju')
            .replace(/^(sdn|smp|smpn|sma|sman|smk|smkn|py\.?|posyandu|tk|ra|paud|paudqu|yys|yayasan|ponpes|pesantren|rw|kelurahan)\s+/i, '')
            .replace(/0+(\d+)/g, '$1')
            .replace(/[^a-z0-9]/g, '');
    }

    function normalizeInstitutionIdentity(name) {
        const source = String(name || '').toLowerCase().replace(/[\u00A0\u200B\uFEFF]/g, ' ').trim();
        const rwMatch = source.match(/\brw[\s.\-:/]*0*(\d+)\b/i);
        const withoutAliases = source
            .replace(/^\s*(?:py|posyandu|pos)\s*[.\-:]?\s*/i, '')
            .replace(/\(\s*(?:rw[\s.\-:/]*0*\d+|\d+(?:\s*\+\s*\d+)*)\s*\)/gi, ' ')
            .replace(/\brw[\s.\-:/]*0*\d+\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return {
            key: normalizeName(withoutAliases),
            rw: rwMatch ? String(Number(rwMatch[1])) : ''
        };
    }

    function institutionsMatch(leftName, rightName) {
        const left = normalizeInstitutionIdentity(leftName);
        const right = normalizeInstitutionIdentity(rightName);
        if (!left.key || !right.key || left.key !== right.key) return false;
        if (left.rw && right.rw) return left.rw === right.rw;
        return true;
    }

    function isSchoolInstitution(rawName) {
        const value = String(rawName || '').trim().toLowerCase();
        if (/(posyandu|pos\s+(anggrek|bougenville|alamanda|kamboja|anyelir|kenanga|melati|mawar)|py\.?|balita|bumil|busui|ibu hamil|ibu menyusui)/i.test(value)) return false;
        if (/^(sd|sdn|smp|smpn|sma|sman|smk|smkn|sekolah|madrasah|mts|mi|ponpes|pesantren)\b/i.test(value)) return true;
        if (/(sdn|smpn|sman|smkn|ponpes|pesantren)/i.test(value)) return true;
        if (/\b(paud|paudqu|yys|yayasan|kb|ra|tk)\b/i.test(value)) return true;
        return true;
    }

    function analysisHash(value) {
        let hash = 2166136261;
        const input = String(value || '');
        for (let i = 0; i < input.length; i += 1) {
            hash ^= input.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function pickAnalysisVariant(options, seed, salt) {
        if (!Array.isArray(options) || options.length === 0) return '';
        return options[analysisHash(`${seed}|${salt || ''}`) % options.length];
    }

    function safeFilename(value, fallback = 'Laporan MBG') {
        const clean = String(value || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();
        return clean || fallback;
    }

    function validateIdentity(sppgKey, signatories) {
        const issues = [];
        if (sppgKey === 'sppg1' && String(signatories?.akuntan || '').trim() !== 'Putri Sribarokah') {
            issues.push({ level: 'error', message: 'Nama akuntan SPPG Cilodong Sukamaju harus “Putri Sribarokah”.' });
        }
        return issues;
    }

    function buildAutosaveCheckpoint(unitId, data, reason = 'periodic', now = new Date()) {
        if (!unitId || !data || typeof data !== 'object') throw new TypeError('Checkpoint autosave tidak valid');
        const timestamp = now instanceof Date ? now : new Date(now);
        if (Number.isNaN(timestamp.getTime())) throw new TypeError('Waktu checkpoint tidak valid');
        return {
            schemaVersion: 1,
            unitId: String(unitId),
            savedAt: timestamp.toISOString(),
            reason: String(reason || 'periodic'),
            data
        };
    }

    function recoverSavedData(primaryRaw, checkpointRaw) {
        const parseObject = raw => {
            if (!raw) return null;
            try {
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                return parsed && typeof parsed === 'object' ? parsed : null;
            } catch (error) {
                return null;
            }
        };
        const primary = parseObject(primaryRaw);
        const checkpoint = parseObject(checkpointRaw);
        const checkpointData = checkpoint?.data && typeof checkpoint.data === 'object' ? checkpoint.data : null;
        if (!primary && !checkpointData) return { data: null, source: null };
        if (!primary) return { data: checkpointData, source: 'checkpoint' };
        if (!checkpointData) return { data: primary, source: 'primary' };
        const primaryTime = Date.parse(primary.updatedAt || '') || 0;
        const checkpointTime = Date.parse(checkpoint.savedAt || '') || 0;
        return checkpointTime > primaryTime
            ? { data: checkpointData, source: 'checkpoint' }
            : { data: primary, source: 'primary' };
    }



    function createEmptyDistributionState() {
        return {
            pagi: { time: '09.00', rows: [] },
            siang: { time: '11.00', rows: [] },
            b3: { time: '09.00', rows: [] },
            sourceRaw: ''
        };
    }

    function normalizeDistributionState(value, fallbackValue = null) {
        const isRecord = candidate => candidate && typeof candidate === 'object' && !Array.isArray(candidate);
        const hasDistributionSection = candidate => isRecord(candidate)
            && ['pagi', 'siang', 'morning', 'afternoon', 'b3'].some(key => Object.prototype.hasOwnProperty.call(candidate, key));
        const source = hasDistributionSection(value)
            ? value
            : (hasDistributionSection(fallbackValue) ? fallbackValue : createEmptyDistributionState());
        const cloneRows = rows => Array.isArray(rows)
            ? rows.filter(isRecord).map(row => ({ ...row }))
            : [];
        const normalizeSection = (primaryKey, legacyKey, defaultTime) => {
            const section = source[primaryKey] ?? (legacyKey ? source[legacyKey] : undefined);
            if (Array.isArray(section)) return { time: defaultTime, rows: cloneRows(section) };
            if (!isRecord(section)) return { time: defaultTime, rows: [] };
            return {
                time: String(section.time || defaultTime),
                rows: cloneRows(section.rows)
            };
        };

        return {
            pagi: normalizeSection('pagi', 'morning', '09.00'),
            siang: normalizeSection('siang', 'afternoon', '11.00'),
            b3: normalizeSection('b3', null, '09.00'),
            sourceRaw: String(source.sourceRaw || '')
        };
    }

    return {
        escapeHtml,
        parseMenuItems,
        parseKgValue,
        toMaterialTitleCase,
        classifyIngredientCategory,
        stripEmbeddedDateHeaders,
        normalizeName,
        normalizeInstitutionIdentity,
        institutionsMatch,
        isSchoolInstitution,
        analysisHash,
        pickAnalysisVariant,
        safeFilename,
        validateIdentity,
        buildAutosaveCheckpoint,
        recoverSavedData,
        createEmptyDistributionState,
        normalizeDistributionState
    };
});
