// Spain Fuel Prices: official prices of every gas station in Spain, filtered, sorted and ready to use.
import { Actor, log } from 'apify';
import { API, FUELS, PROVINCES, download, fold, haversineKm, toStation, apiDate } from './data.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const {
    provinces = [],
    municipality = '',
    postalCode = '',
    brand = '',
    fuelTypes = [],
    latitude = null,
    longitude = null,
    radiusKm = null,
    sortBy = 'none',
    maxResults = 0,
    date = '',
    includeRestrictedSale = false,
} = input;

const fail = async (msg) => { log.error(msg); await Actor.fail(msg); };

// ---------------------------------------------------------------- validate input
const badFuel = fuelTypes.find((f) => !FUELS[f]);
if (badFuel) await fail(`Unknown fuel type "${badFuel}". Valid values: ${Object.keys(FUELS).join(', ')}`);
const provCodes = provinces.map((p) => String(p).padStart(2, '0'));
const badProv = provCodes.find((p) => !PROVINCES[p]);
if (badProv) await fail(`Unknown province code "${badProv}". Use INE codes 01-52 (e.g. 28 = Madrid).`);
const hasPoint = latitude !== null && latitude !== '' && longitude !== null && longitude !== '';
if ((radiusKm || sortBy === 'distance') && !hasPoint) await fail('Distance filters need both "latitude" and "longitude".');
let histDate = null;
if (date) {
    const m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) await fail('"date" must be YYYY-MM-DD.');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
    if (`${m[1]}-${m[2]}-${m[3]}` >= today) log.info('Date is today or in the future: returning the current live prices.');
    else histDate = `${m[3]}-${m[2]}-${m[1]}`;
}

// ---------------------------------------------------------------- download
const base = histDate ? `${API}/EstacionesTerrestresHist` : `${API}/EstacionesTerrestres`;
const urls = provCodes.length
    ? provCodes.map((p) => (histDate ? `${base}/FiltroProvincia/${histDate}/${p}` : `${base}/FiltroProvincia/${p}`))
    : [histDate ? `${base}/${histDate}` : `${base}/`];
log.info(histDate ? `Downloading official closing prices of ${date}…` : 'Downloading live official prices…', { requests: urls.length });

let stations = [];
let stamp = { date: null, time: null };
for (const url of urls) {
    const j = await download(url);
    const f = apiDate(j.Fecha);
    if (!stamp.date || `${f.date} ${f.time}` > `${stamp.date} ${stamp.time}`) stamp = f;
    stations.push(...(j.ListaEESSPrecio || []).map((e) => toStation(e, f)));
}
log.info(`${stations.length} stations downloaded (prices of ${stamp.date} ${stamp.time ?? ''}).`);

// ---------------------------------------------------------------- filter
if (!includeRestrictedSale) stations = stations.filter((s) => s.saleType === 'public');
if (municipality) {
    const q = fold(municipality);
    stations = stations.filter((s) => fold(s.municipality).includes(q) || fold(s.locality).includes(q));
}
if (postalCode) {
    const codes = String(postalCode).split(/[\s,;]+/).filter(Boolean);
    stations = stations.filter((s) => codes.some((c) => s.postalCode.startsWith(c)));
}
if (brand) {
    const q = fold(brand);
    stations = stations.filter((s) => fold(s.brand).includes(q) || fold(s.name).includes(q));
}
if (fuelTypes.length) stations = stations.filter((s) => fuelTypes.some((f) => s[f] !== undefined));
if (hasPoint) {
    const lat = Number(latitude); const lon = Number(longitude);
    for (const s of stations) {
        s.distanceKm = s.latitude !== null && s.longitude !== null ? Math.round(haversineKm(lat, lon, s.latitude, s.longitude) * 100) / 100 : null;
    }
    if (radiusKm) stations = stations.filter((s) => s.distanceKm !== null && s.distanceKm <= Number(radiusKm));
}

// ---------------------------------------------------------------- sort and limit
const priceKey = fuelTypes[0] || 'gasoline95E5';
if (sortBy === 'price') stations.sort((a, b) => (a[priceKey] ?? Infinity) - (b[priceKey] ?? Infinity));
else if (sortBy === 'distance') stations.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));

let limit = Number(maxResults) > 0 ? Number(maxResults) : stations.length;
const maxPaid = Number(process.env.ACTOR_MAX_PAID_DATASET_ITEMS || 0);
if (maxPaid > 0 && maxPaid < limit) { log.info(`Limited to ${maxPaid} results by the run's maximum paid items.`); limit = maxPaid; }
const out = stations.slice(0, limit).map((s) => ({
    ...s,
    source: 'Ministerio para la Transición Ecológica (Geoportal de Hidrocarburos)',
    sourceUrl: 'https://geoportalgasolineras.es/',
}));

// ---------------------------------------------------------------- save
for (let i = 0; i < out.length; i += 1000) await Actor.pushData(out.slice(i, i + 1000));

// Summary with averages and the cheapest station per fuel (free, in the key-value store).
const summary = { pricesDate: stamp.date, pricesTime: stamp.time, stations: out.length, fuels: {} };
for (const key of Object.keys(FUELS)) {
    const withFuel = out.filter((s) => s[key] !== undefined);
    if (!withFuel.length) continue;
    const cheapest = withFuel.reduce((a, b) => (b[key] < a[key] ? b : a));
    summary.fuels[key] = {
        stations: withFuel.length,
        averagePrice: Math.round((withFuel.reduce((t, s) => t + s[key], 0) / withFuel.length) * 1000) / 1000,
        minPrice: cheapest[key],
        maxPrice: Math.max(...withFuel.map((s) => s[key])),
        cheapestStation: { stationId: cheapest.stationId, name: cheapest.name, address: cheapest.address, municipality: cheapest.municipality, province: cheapest.province },
    };
}
await Actor.setValue('SUMMARY', summary);
log.info(`Done: ${out.length} stations saved. Summary with averages and cheapest stations in the key-value store (SUMMARY).`);

await Actor.exit();
