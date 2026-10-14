// Official fuel prices of every gas station in Spain (Ministerio para la Transición Ecológica, Geoportal de Hidrocarburos).
// Public REST API, no key needed, refreshed every 30 minutes. Same rules as https://cuantogasta.github.io/gasolina/
export const API = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes';

// Output key -> field name in the API («Precio …»). Matching ignores accents and case.
export const FUELS = {
    gasoline95E5: 'Precio Gasolina 95 E5',
    gasoline95E10: 'Precio Gasolina 95 E10',
    gasoline95E5Premium: 'Precio Gasolina 95 E5 Premium',
    gasoline95E25: 'Precio Gasolina 95 E25',
    gasoline95E85: 'Precio Gasolina 95 E85',
    gasoline98E5: 'Precio Gasolina 98 E5',
    gasoline98E10: 'Precio Gasolina 98 E10',
    renewableGasoline: 'Precio Gasolina Renovable',
    dieselA: 'Precio Gasoleo A',
    dieselPremium: 'Precio Gasoleo Premium',
    dieselB: 'Precio Gasoleo B',
    renewableDiesel: 'Precio Diésel Renovable',
    biodiesel: 'Precio Biodiesel',
    bioethanol: 'Precio Bioetanol',
    lpg: 'Precio Gases licuados del petróleo',
    cng: 'Precio Gas Natural Comprimido',
    lng: 'Precio Gas Natural Licuado',
    bioCng: 'Precio Biogas Natural Comprimido',
    bioLng: 'Precio Biogas Natural Licuado',
    hydrogen: 'Precio Hidrogeno',
    adblue: 'Precio Adblue',
    ammonia: 'Precio Amoniaco',
    methanol: 'Precio Metanol',
};

// Provinces by INE code (the API's IDProvincia).
export const PROVINCES = {
    '01': 'Araba/Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería', '05': 'Ávila', '06': 'Badajoz', '07': 'Illes Balears',
    '08': 'Barcelona', '09': 'Burgos', 10: 'Cáceres', 11: 'Cádiz', 12: 'Castellón', 13: 'Ciudad Real', 14: 'Córdoba',
    15: 'A Coruña', 16: 'Cuenca', 17: 'Girona', 18: 'Granada', 19: 'Guadalajara', 20: 'Gipuzkoa', 21: 'Huelva',
    22: 'Huesca', 23: 'Jaén', 24: 'León', 25: 'Lleida', 26: 'La Rioja', 27: 'Lugo', 28: 'Madrid', 29: 'Málaga',
    30: 'Murcia', 31: 'Navarra', 32: 'Ourense', 33: 'Asturias', 34: 'Palencia', 35: 'Las Palmas', 36: 'Pontevedra',
    37: 'Salamanca', 38: 'Santa Cruz de Tenerife', 39: 'Cantabria', 40: 'Segovia', 41: 'Sevilla', 42: 'Soria',
    43: 'Tarragona', 44: 'Teruel', 45: 'Toledo', 46: 'Valencia', 47: 'Valladolid', 48: 'Bizkaia', 49: 'Zamora',
    50: 'Zaragoza', 51: 'Ceuta', 52: 'Melilla',
};

// Autonomous communities by the API's IDCCAA.
export const REGIONS = {
    '01': 'Andalucía', '02': 'Aragón', '03': 'Asturias', '04': 'Illes Balears', '05': 'Canarias', '06': 'Cantabria',
    '07': 'Castilla-La Mancha', '08': 'Castilla y León', '09': 'Cataluña', 10: 'Comunitat Valenciana', 11: 'Extremadura',
    12: 'Galicia', 13: 'Comunidad de Madrid', 14: 'Región de Murcia', 15: 'Navarra', 16: 'País Vasco', 17: 'La Rioja',
    18: 'Ceuta', 19: 'Melilla',
};

/** Lowercase, no accents, single spaces: for matching user text against official names. */
export const fold = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const LOWER = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'i', 'e', 'en', 'a', 'o', 'da', 'do', 'das', 'dos', 'd', 'l']);
/** «CALLE MAYOR» -> «Calle Mayor», keeping Spanish particles in lowercase. */
export function titleCase(s) {
    return String(s ?? '').toLowerCase().split(/(\s+|-|\/)/).map((w, i) => {
        if (!w.trim() || w === '-' || w === '/') return w;
        if (i > 0 && LOWER.has(w)) return w;
        return w.charAt(0).toUpperCase() + w.slice(1);
    }).join('').replace(/\b(L|D)'(\w)/g, (_, a, b) => `${a}'${b.toUpperCase()}`);
}

/** «Coruña (A)» -> «A Coruña»; «Escala (L')» -> «L'Escala». */
export function municipalityName(s) {
    const m = String(s ?? '').trim().match(/^(.*)\s+\(([^)]+)\)$/);
    if (!m) return String(s ?? '').trim();
    const art = m[2].trim();
    return art.endsWith("'") ? `${art}${m[1]}` : `${art} ${m[1]}`;
}

/** «CALLE CALLE DE LADERA, 34» -> «Calle de Ladera, 34». */
export function cleanAddress(s) {
    return titleCase(String(s ?? '').trim())
        .replace(/^(Calle|Avenida|Avda\.?|Carretera|Ctra\.?|Plaza|Paseo|Camino)\s+(Calle|Avenida|Avda\.?|Carretera|Ctra\.?|Plaza|Paseo|Camino)\b/i, '$2')
        .replace(/\s+,/g, ',').replace(/[,\s]+$/, '').replace(/\s{2,}/g, ' ');
}

// Brands are grouped by their trade name (the «Rótulo» field is free text).
const BRANDS = ['REPSOL', 'MOEVE', 'CEPSA', 'GALP', 'BALLENOIL', 'PLENERGY', 'SHELL', 'PETROPRIX', 'PETRONOR', 'CARREFOUR', 'BP', 'AVIA',
    'Q8', 'ESCLATOIL', 'BONAREA', 'PLENOIL', 'ALCAMPO', 'EROSKI', 'DISA', 'CAMPSA', 'GASEXPRESS', 'MEROIL', 'AUTONETOIL', 'VALCARCE',
    'PCAN', 'PETROCAT', 'TAMOIL', 'LOW COST REPOST', 'COSTCO', 'E.LECLERC', 'HAM', 'NATURGY', 'SIMON GRUP', 'ENERGY CARBURANTES'];
const BRAND_NAMES = {
    REPSOL: 'Repsol', MOEVE: 'Moeve', CEPSA: 'Cepsa', GALP: 'Galp', BALLENOIL: 'Ballenoil', PLENERGY: 'Plenergy', SHELL: 'Shell',
    PETROPRIX: 'Petroprix', PETRONOR: 'Petronor', CARREFOUR: 'Carrefour', BP: 'BP', AVIA: 'Avia', Q8: 'Q8', ESCLATOIL: 'Esclatoil',
    BONAREA: 'bonÀrea', PLENOIL: 'Plenoil', ALCAMPO: 'Alcampo', EROSKI: 'Eroski', DISA: 'Disa', CAMPSA: 'Campsa', GASEXPRESS: 'GasExpress',
    MEROIL: 'Meroil', AUTONETOIL: 'Autonetoil', VALCARCE: 'Valcarce', PCAN: 'PCAN', PETROCAT: 'Petrocat', TAMOIL: 'Tamoil',
    'LOW COST REPOST': 'Low Cost Repost', COSTCO: 'Costco', 'E.LECLERC': 'E.Leclerc', HAM: 'HAM', NATURGY: 'Naturgy',
    'SIMON GRUP': 'Simon Grup', 'ENERGY CARBURANTES': 'Energy Carburantes',
};
const NO_BRAND = /^(NINGUN[OA]|SIN (ROTULO|RÓTULO|MARCA|NOMBRE|DETERMINAR|ASIGNAR)|NO HAY|LIBRE|S\/?[RN]|N\/?A|NO|SI|-+|\.+)$/;
/** Trade brand from the free-text sign («REPSOL CENTRO» -> «Repsol»); «Unbranded» for independent stations. */
export function brandOf(sign) {
    const r = String(sign ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (!r || NO_BRAND.test(r)) return 'Unbranded';
    if (r.startsWith('BON') && r.includes('AREA')) return BRAND_NAMES.BONAREA;
    if (r.includes('CEPSA')) return BRAND_NAMES.CEPSA;
    if (r.includes('MOEVE')) return BRAND_NAMES.MOEVE;
    const m = BRANDS.find((b) => r === b || r.startsWith(`${b} `) || r.startsWith(`${b}-`));
    return m ? BRAND_NAMES[m] : titleCase(r);
}

const num = (s) => {
    if (s === undefined || s === null || s === '') return null;
    const v = parseFloat(String(s).replace(',', '.'));
    return Number.isFinite(v) && v > 0 && v < 20 ? v : null;
};
const pad2 = (k) => String(k).padStart(2, '0');

/** «14/10/2026 17:56:54» -> { date: '2026-10-14', time: '17:56' } */
export function apiDate(s) {
    const m = String(s ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    return m ? { date: `${m[3]}-${m[2]}-${m[1]}`, time: `${m[4].padStart(2, '0')}:${m[5]}` } : { date: null, time: null };
}

/** Great-circle distance in km. */
export function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const rad = (d) => (d * Math.PI) / 180;
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

/** One clean, flat record per station from an API row. */
export function toStation(e, fecha) {
    const byFolded = {};
    for (const [k, v] of Object.entries(e)) byFolded[fold(k)] = v;
    const prices = {};
    for (const [key, field] of Object.entries(FUELS)) {
        const v = num(byFolded[fold(field)]);
        if (v !== null) prices[key] = v;
    }
    const lat = parseFloat(String(e.Latitud ?? '').replace(',', '.'));
    const lon = parseFloat(String(e['Longitud (WGS84)'] ?? '').replace(',', '.'));
    const provinceCode = pad2(e.IDProvincia);
    const regionCode = pad2(e.IDCCAA);
    const hours = String(e.Horario ?? '').trim();
    return {
        stationId: String(e.IDEESS),
        name: titleCase(String(e['Rótulo'] ?? '').trim()) || 'Gas station',
        brand: brandOf(e['Rótulo']),
        address: cleanAddress(e['Dirección']),
        postalCode: String(e['C.P.'] ?? '').trim(),
        locality: municipalityName(titleCase(e.Localidad ?? '')),
        municipality: municipalityName(e.Municipio ?? ''),
        municipalityId: String(e.IDMunicipio ?? ''),
        province: PROVINCES[provinceCode] || titleCase(e.Provincia ?? ''),
        provinceCode,
        region: REGIONS[regionCode] || null,
        regionCode,
        latitude: Number.isFinite(lat) ? lat : null,
        longitude: Number.isFinite(lon) ? lon : null,
        openingHours: hours,
        open24h: /24\s*H/i.test(hours) || /L-D:\s*00:00-23:59/.test(hours),
        saleType: (e['Tipo Venta'] || 'P') === 'P' ? 'public' : 'restricted',
        fuels: Object.keys(prices),
        ...prices,
        pricesDate: fecha.date,
        pricesTime: fecha.time,
    };
}

export async function download(url, attempts = 4) {
    let last;
    for (let i = 0; i < attempts; i++) {
        try {
            const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'spain-fuel-prices-actor (+https://cuantogasta.github.io/gasolina/)' }, signal: AbortSignal.timeout(90000) });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const j = await r.json();
            if (j.ResultadoConsulta !== 'OK') throw new Error(`API result: ${j.ResultadoConsulta}`);
            return j;
        } catch (err) {
            last = err;
            await new Promise((res) => setTimeout(res, 3000 * (i + 1)));
        }
    }
    throw last;
}
