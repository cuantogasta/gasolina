// Genera la web estática de CuántoGasta Gasolina en dist/ (se publica en https://cuantogasta.github.io/gasolina/).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { COMBUSTIBLES, PROVINCIAS, slug, nombreMarca, NOMBRE_MARCA, media } from './datos.mjs';
import { icon } from './content/iconos.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const SITE = CFG.siteUrl.replace(/\/$/, '');
const BASE = CFG.base; // «/gasolina»
const MAIN = CFG.mainSite.replace(/\/$/, '');
const { fecha: FECHA, hora: HORA, estaciones: EST } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'estaciones.json'), 'utf8'));
const HIST = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'historico.json'), 'utf8'));
const FECHAS = Object.keys(HIST).sort().filter((d) => d <= FECHA);
const AYER = FECHAS.filter((d) => d < FECHA).at(-1);

// ---------------------------------------------------------------- utilidades
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nf = (d) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt = (n, d = 2) => nf(d).format(n);
const litro = (p) => `${fmt(p, 3)} €`;
const cts = (x) => (Math.abs(x) < 0.0005 ? 'sin cambios' : `${x > 0 ? '+' : '−'}${fmt(Math.abs(x * 100), 1)} cts`);
const ctsAbs = (x) => `${fmt(Math.abs(x * 100), 1)} céntimos`;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const fechaLarga = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${y}`; };
const fechaCorta = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MESES[m - 1].slice(0, 3)}`; };
const diaSemana = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
const u = (p) => BASE + p;
const sitemap = [];
const C = Object.fromEntries(COMBUSTIBLES.map((c) => [c.id, c]));

function write(p, content, { sitemapEntry = true, priority } = {}) {
  const isFile = /\.[a-z0-9]+$/i.test(p);
  const file = isFile ? path.join(DIST, p) : path.join(DIST, p, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  if (sitemapEntry && !isFile) sitemap.push({ loc: SITE + u(p), priority });
}

const amazonUrl = (q) => { const x = new URL('https://www.amazon.es/s'); x.searchParams.set('k', q); if (CFG.amazonTag) x.searchParams.set('tag', CFG.amazonTag); return x.toString(); };
const amazonAttrs = 'rel="sponsored nofollow noopener" target="_blank"';
const mapsUrl = (e) => `https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lon}`;

// ---------------------------------------------------------------- índices
const provSlug = (code) => slug(PROVINCIAS[code]);
const municipios = new Map(); // clave prov|slug
for (const e of EST) {
  const key = `${e.prov}|${slug(e.mun)}`;
  if (!municipios.has(key)) municipios.set(key, { prov: e.prov, nombre: e.mun, slug: slug(e.mun), est: [] });
  municipios.get(key).est.push(e);
}
for (const m of municipios.values()) {
  m.path = `/${provSlug(m.prov)}/${m.slug}/`;
  const lat = media(m.est.map((e) => e.lat).filter(Number.isFinite));
  const lon = media(m.est.map((e) => e.lon).filter(Number.isFinite));
  m.lat = lat; m.lon = lon;
}
const munDe = (e) => municipios.get(`${e.prov}|${slug(e.mun)}`);
const provincias = Object.keys(PROVINCIAS).map((code) => ({
  code, nombre: PROVINCIAS[code], slug: provSlug(code), path: `/${provSlug(code)}/`,
  est: EST.filter((e) => e.prov === code), muns: [...municipios.values()].filter((m) => m.prov === code).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
}));

function stats(est, comb) {
  const v = est.filter((e) => e.p[comb]).sort((a, b) => a.p[comb] - b.p[comb]);
  if (!v.length) return null;
  return { avg: media(v.map((e) => e.p[comb])), min: v[0], max: v.at(-1), n: v.length, orden: v };
}
const NAC = Object.fromEntries(COMBUSTIBLES.map((c) => [c.id, stats(EST, c.id)]));
// Canarias, Ceuta y Melilla tienen otra fiscalidad: las listas de «las más baratas» usan la península y Baleares.
const FUERA = new Set(['35', '38', '51', '52']);
const EST_PEN = EST.filter((e) => !FUERA.has(e.prov));
const PEN = Object.fromEntries(COMBUSTIBLES.map((c) => [c.id, stats(EST_PEN, c.id)]));
for (const p of provincias) p.s = { g95: stats(p.est, 'g95'), die: stats(p.est, 'die') };
const histNac = (comb, d) => HIST[d]?.nac?.[comb] ?? null;
const variacion = (comb, dias) => { const ref = FECHAS.filter((d) => d < FECHA).at(-dias); const a = HIST[FECHA]?.nac?.[comb] ?? NAC[comb]?.avg; const b = ref ? histNac(comb, ref) : null; return a && b ? a - b : null; };

// Distancia en km (haversine)
const RAD = Math.PI / 180;
function km(a, b) {
  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
// rejilla de 0,1° para buscar gasolineras cercanas
const rejilla = new Map();
const celda = (lat, lon) => `${Math.floor(lat * 10)}|${Math.floor(lon * 10)}`;
for (const e of EST) {
  if (!Number.isFinite(e.lat) || !Number.isFinite(e.lon)) continue;
  const k = celda(e.lat, e.lon);
  if (!rejilla.has(k)) rejilla.set(k, []);
  rejilla.get(k).push(e);
}
function cercanas(punto, radioKm, filtro = () => true) {
  const out = [];
  const r = Math.ceil(radioKm / 9);
  const la = Math.floor(punto.lat * 10), lo = Math.floor(punto.lon * 10);
  for (let i = -r; i <= r; i++) for (let j = -r - 1; j <= r + 1; j++) {
    for (const e of rejilla.get(`${la + i}|${lo + j}`) || []) {
      if (!filtro(e)) continue;
      const d = km(punto, e);
      if (d <= radioKm) out.push({ e, d });
    }
  }
  return out;
}

// ---------------------------------------------------------------- recursos
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'assets', 'fonts'), { recursive: true });
const ASSET_V = {};
for (const f of ['style.css', 'app.js']) {
  let src = fs.readFileSync(path.join(ROOT, 'src', 'assets', f), 'utf8');
  src = src.replaceAll('/assets/fonts/', `${BASE}/assets/fonts/`).replaceAll('__BASE__', BASE);
  ASSET_V[f] = hash(src);
  fs.writeFileSync(path.join(DIST, 'assets', f), src);
}
fs.copyFileSync(path.join(ROOT, 'src', 'assets', 'fonts', 'jakarta-latin.woff2'), path.join(DIST, 'assets', 'fonts', 'jakarta-latin.woff2'));
for (const f of ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon.ico', 'og.png']) {
  const src = path.join(ROOT, 'src', 'assets', f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DIST, f === 'og.png' ? 'assets/og.png' : f));
}
const LOGO = '<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#0f766e"/><path d="M9 25V9.5A2.5 2.5 0 0 1 11.5 7h6A2.5 2.5 0 0 1 20 9.5V25" fill="#fde047"/><rect x="11.5" y="10" width="6" height="5" rx="1" fill="#0f766e"/><path d="M8 25h13" stroke="#fde047" stroke-width="2" stroke-linecap="round"/><path d="M20 13h1.6a1.6 1.6 0 0 1 1.6 1.6v5.4a1.3 1.3 0 0 0 2.6 0V12l-2.4-2.4" fill="none" stroke="#fde047" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
fs.writeFileSync(path.join(DIST, 'favicon.svg'), LOGO.replace('<svg class="logo" ', '<svg xmlns="http://www.w3.org/2000/svg" '));
const BRAND = 'Cuánto<b>Gasta</b> <span class="brand-sub">Gasolina</span>';

// ---------------------------------------------------------------- plantilla
const NAV = [['/', 'Precio hoy'], ['/cerca-de-mi/', 'Cerca de mí'], ['/marcas/', 'Marcas'], ['/mejor-dia-para-repostar/', 'Mejor día'], ['/calculadora-coste-viaje/', 'Calculadora']];
const ORG = { '@type': 'Organization', name: 'CuántoGasta', url: `${MAIN}/`, logo: { '@type': 'ImageObject', url: `${SITE}${u('/icon-512.png')}` } };

function layout({ title, desc, p, body, crumbs = [], jsonld = [], pageData = null }) {
  const url = SITE + u(p);
  const fullTitle = title.length > 54 ? title : `${title} | CuántoGasta`;
  const ld = [...jsonld];
  if (crumbs.length) {
    ld.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [['/', 'Gasolina'], ...crumbs].map(([href, name], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + u(href) })) });
  }
  const crumbHtml = crumbs.length ? `<nav class="crumbs" aria-label="Migas de pan"><a href="${u('/')}">Gasolina</a>${crumbs.map(([href, name], i) => (i === crumbs.length - 1 ? `<span aria-current="page">${esc(name)}</span>` : `<a href="${u(href)}">${esc(name)}</a>`)).join('')}</nav>` : '';
  const nav = NAV.map(([href, label]) => `<a href="${u(href)}"${href === p ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!doctype html>
<html lang="es-ES">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<meta property="og:type" content="website">
<meta property="og:site_name" content="CuántoGasta Gasolina">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}${u('/assets/og.png')}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="es_ES">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0f766e">
<link rel="preload" href="${u('/assets/fonts/jakarta-latin.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${u('/assets/style.css')}?v=${ASSET_V['style.css']}">
<link rel="icon" href="${u('/favicon.svg')}" type="image/svg+xml">
<link rel="icon" href="${u('/favicon.ico')}" sizes="32x32">
<link rel="apple-touch-icon" href="${u('/apple-touch-icon.png')}">
${CFG.adsenseClient ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(CFG.adsenseClient)}" crossorigin="anonymous"></script>\n` : ''}${ld.map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n')}
</head>
<body>
<a class="skip" href="#main">Saltar al contenido</a>
<header class="site-header"><div class="wrap hdr">
<a class="brand" href="${u('/')}" aria-label="CuántoGasta Gasolina: inicio">${LOGO}<span>${BRAND}</span></a>
<nav class="main-nav" aria-label="Principal">${nav}</nav>
</div></header>
<main id="main" class="wrap">
${crumbHtml}
${body}
</main>
${footer()}
${pageData ? `<script type="application/json" id="page-data">${JSON.stringify(pageData)}</script>\n` : ''}<script type="module" src="${u('/assets/app.js')}?v=${ASSET_V['app.js']}"></script>
${CFG.cloudflareToken ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${esc(CFG.cloudflareToken)}"}'></script>\n` : ''}</body>
</html>
`;
}

function footer() {
  const grandes = ['madrid', 'barcelona', 'valencia', 'sevilla', 'malaga', 'alicante', 'murcia', 'zaragoza'];
  return `<footer class="site-footer"><div class="wrap">
<div class="foot-cols">
<div class="foot-brand"><a class="brand" href="${u('/')}">${LOGO}<span>${BRAND}</span></a><p>El precio de la gasolina y el diésel hoy en las ${fmt(EST.length, 0).replace(',', '.')} gasolineras de España, con datos oficiales. ${CFG.adsenseClient ? 'Gratis y sin registro.' : 'Gratis, sin registro y sin cookies.'}</p>
<ul class="trust-list"><li>${icon('shield')} Datos del Ministerio para la Transición Ecológica</li><li>${icon('clock')} Actualizado el ${fechaCorta(FECHA)} a las ${HORA}</li></ul></div>
<div><strong>Precios hoy</strong><ul>${COMBUSTIBLES.map((c) => `<li><a href="${u(`/${c.slug}/`)}">${c.nombre}</a></li>`).join('')}<li><a href="${u('/historico/')}">Histórico de precios</a></li></ul></div>
<div><strong>Provincias</strong><ul>${grandes.map((s) => provincias.find((p) => p.slug === s)).filter(Boolean).map((p) => `<li><a href="${u(p.path)}">${esc(p.nombre)}</a></li>`).join('')}</ul></div>
<div><strong>Más</strong><ul><li><a href="${u('/cerca-de-mi/')}">Gasolineras cerca de mí</a></li><li><a href="${u('/marcas/')}">Ranking de marcas</a></li><li><a href="${u('/calculadora-coste-viaje/')}">Calculadora de viaje</a></li><li><a href="${u('/widget-gratis/')}">Widget gratis para tu web</a></li><li><a href="${MAIN}/">Precio de la luz hoy</a></li><li><a href="${u('/sobre/')}">Método y fuentes</a></li><li><a href="${MAIN}/aviso-legal/">Aviso legal</a> · <a href="${MAIN}/privacidad/">Privacidad</a></li></ul></div>
</div>
<p class="legal">Precios de venta al público de las estaciones de servicio de España (fuente: <a href="https://geoportalgasolineras.es/" rel="noopener">Geoportal de Hidrocarburos</a>, Ministerio para la Transición Ecológica y el Reto Demográfico). Los precios incluyen impuestos y los comunica cada gasolinera; pueden cambiar a lo largo del día. Información orientativa.${CFG.amazonTag ? ' En calidad de Afiliado de Amazon, obtengo ingresos por las compras adscritas que cumplen los requisitos aplicables.' : ''}</p>
</div></footer>`;
}

// ---------------------------------------------------------------- componentes
const pageHead = ({ ico = 'pump', eyebrow, h1, sub }) => `<header class="page-head"><span class="head-ico">${icon(ico)}</span><div>${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}<h1>${esc(h1)}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}<p class="meta">${icon('clock')} Precios del ${fechaLarga(FECHA)} a las ${HORA} · Fuente: Ministerio para la Transición Ecológica</p></div></header>`;

function faqBlock(items, titulo = 'Preguntas frecuentes') {
  return {
    html: `<section class="faq sec"><h2>${titulo}</h2>${items.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join('')}</section>`,
    ld: { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })) },
  };
}

function tile(label, valor, sub, main = false) {
  return `<div class="tile${main ? ' tile-main' : ''}"><span>${label}</span><strong>${valor}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;
}

function estacionNombre(e) {
  if (NOMBRE_MARCA[e.marca]) return nombreMarca(e.marca); // marcas conocidas, también las de dos letras (BP, Q8)
  if (e.marca === 'Sin marca' || /^(n[º°o]\.?\s*\d|\d|-)/i.test(e.rotulo) || e.rotulo.length < 3) return `Gasolinera de ${e.loc || e.mun}`;
  return /^(E\.?S\.?|Estacion|Gasolinera)\b/i.test(e.rotulo) ? e.rotulo : nombreMarca(e.marca);
}

function filaEstacion(e, pos, combs, { conMunicipio = false, distancia = null, destacar = null } = {}) {
  const mun = munDe(e);
  const nombre = `<a href="${u(mun.path)}#e${e.id}">${esc(estacionNombre(e))}</a>`;
  const donde = `${esc(e.dir)}${conMunicipio ? ` · <a href="${u(mun.path)}">${esc(e.mun)}</a>` : ''}`;
  return `<tr${destacar && e.id === destacar ? ' class="best-row"' : ''}><td class="pos">${pos}</td><td><strong>${nombre}</strong><br><small>${donde}${distancia !== null ? ` · a ${fmt(distancia, 1)} km` : ''}</small></td>${combs.map((c) => `<td class="num">${e.p[c] ? litro(e.p[c]) : '—'}</td>`).join('')}</tr>`;
}

function tablaEstaciones(lista, combs, opts = {}) {
  return `<div class="table-wrap"><table class="data st-table"><thead><tr><th>#</th><th>Gasolinera</th>${combs.map((c) => `<th class="num">${C[c].nombre}</th>`).join('')}</tr></thead><tbody>${lista.map((x, i) => filaEstacion(x.e || x, i + 1, combs, { ...opts, distancia: x.d ?? null })).join('')}</tbody></table></div>`;
}

/** Gráfico de líneas sin dependencias: SVG que se estira al ancho y etiquetas en HTML (no se deforman). */
function grafico(series, { alto = 220 } = {}) {
  const todas = series.flatMap((s) => s.puntos.map((p) => p.v)).filter((v) => v !== null);
  if (todas.length < 2) return '';
  let min = Math.min(...todas), max = Math.max(...todas);
  const marg = (max - min) * 0.12 || 0.01; min -= marg; max += marg;
  const W = 1000, Hh = 300;
  const t0 = Date.parse(series[0].puntos[0].d), t1 = Date.parse(series[0].puntos.at(-1).d);
  const xd = (d) => (t1 === t0 ? 0 : ((Date.parse(d) - t0) / (t1 - t0)) * W);
  const y = (v) => Hh - ((v - min) / (max - min)) * Hh;
  // un tramo por cada racha de días seguidos: si faltan días, la línea se corta en vez de unir puntos lejanos
  const tramos = (puntos) => {
    const out = []; let cur = []; let prev = null;
    for (const pt of puntos) {
      if (pt.v === null) continue;
      if (prev && Date.parse(pt.d) - Date.parse(prev) > 3 * 864e5) { out.push(cur); cur = []; }
      cur.push(pt); prev = pt.d;
    }
    if (cur.length) out.push(cur);
    return out;
  };
  const lineas = series.map((s) => tramos(s.puntos).map((tr) => `<polyline class="${s.cls}" points="${tr.map((p) => `${xd(p.d).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')}"/>`).join('')).join('');
  const rejillaY = [0.25, 0.5, 0.75].map((f) => `<line x1="0" x2="${W}" y1="${Hh * f}" y2="${Hh * f}"/>`).join('');
  const primeros = series[0].puntos;
  const fechaMedia = new Date((t0 + t1) / 2).toISOString().slice(0, 10);
  return `<div class="lchart"><div class="lc-y"><span>${litro(max - marg)}</span><span>${litro(min + marg)}</span></div>
<svg class="lc-svg" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" style="height:${alto}px" role="img" aria-label="Evolución del precio">${rejillaY}${lineas}</svg>
<div class="lc-x"><span>${fechaCorta(primeros[0].d)}</span><span>${fechaCorta(fechaMedia)}</span><span>${fechaCorta(primeros.at(-1).d)}</span></div>
<div class="lc-legend">${series.map((s) => `<span><i class="${s.cls}"></i>${s.nombre}</span>`).join('')}</div></div>`;
}

function serieNac(comb, dias = 180) {
  return FECHAS.slice(-dias).map((d) => ({ d, v: HIST[d].nac?.[comb] ?? null }));
}
function serieProv(code, comb, dias = 180) {
  return FECHAS.slice(-dias).map((d) => ({ d, v: HIST[d].prov?.[code]?.[comb] ?? null }));
}

function ranking(items, { valor, etiqueta, href, max: maxV, min: minV }) {
  const vals = items.map(valor);
  const lo = minV ?? Math.min(...vals), hi = maxV ?? Math.max(...vals);
  return `<div class="rk">${items.map((it) => {
    const v = valor(it);
    const w = hi === lo ? 100 : 18 + ((v - lo) / (hi - lo)) * 82;
    const nom = href ? `<a href="${href(it)}">${esc(etiqueta(it))}</a>` : esc(etiqueta(it));
    return `<div class="rk-row"><span class="rk-name">${nom}</span><span class="rk-bar"><i style="width:${w.toFixed(1)}%"></i></span><b>${litro(v)}</b></div>`;
  }).join('')}</div>`;
}

const PRODUCTOS = [
  { q: 'compresor aire portatil coche', t: 'Compresor portátil para las ruedas', d: 'Con la presión baja el coche gasta hasta un 3 % más. Revísala una vez al mes sin buscar gasolinera.', ico: 'gota' },
  { q: 'lector obd2 bluetooth', t: 'Lector OBD2 Bluetooth', d: 'Muestra en el móvil el consumo real de tu coche y te ayuda a conducir más eficiente.', ico: 'chart' },
  { q: 'soporte movil coche rejilla', t: 'Soporte de móvil para el coche', d: 'Para seguir la ruta a la gasolinera más barata sin quitar las manos del volante.', ico: 'pin' },
];
const productos = () => `<section class="affiliate sec"><div class="sec-head"><p class="eyebrow">${icon('leaf')} Gasta menos en cada depósito</p><h2>Tres compras que ayudan a ahorrar combustible</h2></div><div class="prod-grid">${PRODUCTOS.map((p) => `<a class="prod" href="${esc(amazonUrl(p.q))}" ${amazonAttrs}><span class="prod-ico">${icon(p.ico)}</span><strong>${esc(p.t)}</strong><span>${esc(p.d)}</span><em>Ver precios en Amazon ${icon('arrow')}</em></a>`).join('')}</div>${CFG.amazonTag ? '<p class="disclosure">Enlaces de afiliado: si compras a través de ellos, la web recibe una pequeña comisión sin coste extra para ti. Así se mantiene gratis.</p>' : ''}</section>`;

let nBuscador = 0;
const buscador = (titulo = 'Las gasolineras más baratas cerca de ti') => `<section class="card near" id="cerca">
<div class="calc-head"><span class="calc-ico">${icon('locate')}</span><div><h2>${titulo}</h2><p>Con tu ubicación, tu pueblo o tu código postal. La web recuerda tu zona solo en este dispositivo.</p></div></div>
<div class="near-elegir"><button class="btn" type="button" data-buscar>${icon('locate')}<span>Usar mi ubicación</span></button>
<div class="near-q"><input type="search" data-q placeholder="o escribe tu pueblo o código postal" aria-label="Tu pueblo, ciudad o código postal" autocomplete="off" enterkeyhint="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="zonas-${++nBuscador}"><ul class="near-sug" id="zonas-${nBuscador}" role="listbox" aria-label="Zonas" hidden></ul></div></div>
<div class="near-actual" hidden>${icon('pin')}<span>Cerca de <strong data-zona></strong></span><button type="button" class="near-link" data-cambiar>Cambiar zona</button><button type="button" class="near-link" data-olvidar>Olvidar</button></div>
<div class="near-ctrl" hidden><div class="chips" role="group" aria-label="Combustible">${COMBUSTIBLES.map((c, i) => `<button type="button" data-comb="${c.id}" aria-pressed="${i === 0}">${c.nombre}</button>`).join('')}</div>
<label>Radio <select data-radio><option value="5">5 km</option><option value="10" selected>10 km</option><option value="25">25 km</option><option value="50">50 km</option></select></label>
<label>Ordenar <select data-orden><option value="precio" selected>Más baratas</option><option value="distancia">Más cercanas</option></select></label></div>
<div class="near-out" aria-live="polite"></div>
<p class="near-alt">¿Prefieres ver una provincia entera? <select data-ir aria-label="Elige una provincia"><option value="">Elige provincia…</option>${provincias.map((p) => `<option value="${u(p.path)}">${esc(p.nombre)}</option>`).join('')}</select></p>
</section>`;

// ---------------------------------------------------------------- datos para el navegador
const compacto = EST.filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon)).map((e) => [
  +e.lat.toFixed(5), +e.lon.toFixed(5), e.p.g95 || 0, e.p.die || 0, e.p.g98 || 0, e.p.glp || 0, estacionNombre(e), e.dir, e.mun, `${munDe(e).path}#e${e.id}`]);
write('/datos/gasolineras.json', JSON.stringify({ fecha: FECHA, hora: HORA, base: BASE, e: compacto }));
// zonas para buscar por texto: municipios y localidades con gasolinera (centro de sus gasolineras) y códigos postales
{
  const r3 = (v) => +v.toFixed(3);
  const zonas = [];
  for (const m of municipios.values()) if (Number.isFinite(m.lat) && Number.isFinite(m.lon)) zonas.push([m.nombre, PROVINCIAS[m.prov], r3(m.lat), r3(m.lon)]);
  const locs = new Map(), cps = new Map();
  for (const e of EST) {
    if (!Number.isFinite(e.lat) || !Number.isFinite(e.lon)) continue;
    if (/^\d{5}$/.test(e.cp || '')) { if (!cps.has(e.cp)) cps.set(e.cp, []); cps.get(e.cp).push(e); }
    if (!e.loc || slug(e.loc) === slug(e.mun) || municipios.has(`${e.prov}|${slug(e.loc)}`)) continue;
    const k = `${e.prov}|${slug(e.loc)}`;
    if (!locs.has(k)) locs.set(k, { nombre: e.loc, mun: e.mun, prov: e.prov, est: [] });
    locs.get(k).est.push(e);
  }
  for (const l of locs.values()) zonas.push([`${l.nombre} (${l.mun})`, PROVINCIAS[l.prov], r3(media(l.est.map((e) => e.lat))), r3(media(l.est.map((e) => e.lon)))]);
  const cp = Object.fromEntries([...cps].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, [r3(media(v.map((e) => e.lat))), r3(media(v.map((e) => e.lon)))]]));
  write('/datos/zonas.json', JSON.stringify({ m: zonas, cp }));
}
write('/datos/resumen.json', JSON.stringify({ fecha: FECHA, hora: HORA, media: Object.fromEntries(COMBUSTIBLES.map((c) => [c.id, NAC[c.id] ? +NAC[c.id].avg.toFixed(3) : null])) }));

// ---------------------------------------------------------------- portada
{
  const g = NAC.g95, d = NAC.die;
  const gp = PEN.g95, dp = PEN.die;
  const vAy = (c) => variacion(c, 1);
  const provOrd = [...provincias].filter((p) => p.s.g95).sort((a, b) => a.s.g95.avg - b.s.g95.avg);
  const ahorro50 = (gp.orden.at(-1).p.g95 - gp.min.p.g95) * 50;
  const faq = faqBlock([
    ['¿Cuál es el precio de la gasolina hoy?', `Hoy, ${fechaLarga(FECHA)}, la gasolina 95 cuesta de media ${litro(g.avg)} el litro en España y el diésel ${litro(d.avg)}. Son medias de las ${fmt(EST.length, 0)} gasolineras que comunican sus precios al Ministerio.`],
    ['¿Dónde está la gasolinera más barata de España?', `En la península y Baleares, la gasolina 95 más barata está ahora en ${esc(estacionNombre(gp.min))} (${esc(gp.min.mun)}, ${esc(PROVINCIAS[gp.min.prov])}) a ${litro(gp.min.p.g95)} y el diésel más barato en ${esc(estacionNombre(dp.min))} (${esc(dp.min.mun)}, ${esc(PROVINCIAS[dp.min.prov])}) a ${litro(dp.min.p.die)}. En Canarias los impuestos son más bajos: allí la gasolina 95 llega a costar ${litro(g.min.p.g95)}.`],
    ['¿Cada cuánto se actualizan los precios?', `Las gasolineras están obligadas a comunicar cada cambio de precio al Ministerio para la Transición Ecológica. Esta web descarga los datos oficiales varias veces al día; la última actualización es del ${fechaLarga(FECHA)} a las ${HORA}.`],
    ['¿Cuánto puedo ahorrar eligiendo bien la gasolinera?', `Entre la gasolina 95 más barata y la más cara de la península hay hoy ${ctsAbs(gp.orden.at(-1).p.g95 - gp.min.p.g95)} por litro: ${fmt(ahorro50, 2)} € en un depósito de 50 litros. Dentro de una misma ciudad la diferencia suele ser de 10 a 20 céntimos por litro.`],
    ['¿Qué provincia tiene la gasolina más barata?', `Hoy la gasolina 95 más barata de media está en ${esc(provOrd[0].nombre)} (${litro(provOrd[0].s.g95.avg)}) y la más cara en ${esc(provOrd.at(-1).nombre)} (${litro(provOrd.at(-1).s.g95.avg)}). Canarias, Ceuta y Melilla tienen impuestos más bajos.`],
  ]);
  const body = `<section class="hero-home gas-hero"><div>
<p class="eyebrow">${icon('pump')} Precio de la gasolina hoy · ${fechaLarga(FECHA)}</p>
<h1>Precio de la gasolina y el diésel hoy</h1>
<p class="lead">El precio en las ${fmt(EST.length, 0).replace(',', '.')} gasolineras de España, actualizado con datos oficiales. Encuentra la más barata cerca de ti y ahorra en cada depósito.</p>
<div class="hero-actions"><a class="btn btn-sun" href="#cerca">${icon('locate')}<span>Más baratas cerca de mí</span></a><a class="btn btn-glass" href="#provincias">Ver por provincia</a></div>
</div><div class="hero-prices">
${['g95', 'die'].map((c) => `<div class="hp"><span>${C[c].nombre}</span><strong>${litro(NAC[c].avg)}</strong><small>${vAy(c) !== null ? `${cts(vAy(c))} desde ayer` : 'media de España'}</small></div>`).join('')}
</div></section>
${buscador()}
<div class="tiles tiles-4">${COMBUSTIBLES.map((c) => NAC[c.id] ? `<a class="tile tile-link" href="${u(`/${c.slug}/`)}"><span>${c.nombre}</span><strong>${litro(NAC[c.id].avg)}</strong><small>${PEN[c.id] ? `Mín. península ${litro(PEN[c.id].min.p[c.id])} · ` : ''}${fmt(NAC[c.id].n, 0)} gasolineras</small></a>` : '').join('')}</div>
<section class="sec"><div class="sec-head"><p class="eyebrow">${icon('trend')} Evolución</p><h2>Así ha cambiado el precio en los últimos meses</h2><p>Media diaria de todas las gasolineras de España (€/litro).</p></div>
<div class="card chart-card">${grafico([{ nombre: 'Gasolina 95', cls: 's-g95', puntos: serieNac('g95') }, { nombre: 'Diésel', cls: 's-die', puntos: serieNac('die') }])}<p class="chart-note"><a href="${u('/historico/')}">Ver el histórico completo</a> · <a href="${u('/mejor-dia-para-repostar/')}">¿Qué día de la semana es más barato?</a></p></div></section>
<section class="sec"><div class="sec-head"><p class="eyebrow">${icon('euro')} En toda España</p><h2>Las gasolineras más baratas de España hoy</h2><p>Las más baratas de todo el país, en la península y Baleares; las de tu zona, <a href="#cerca">en el buscador de arriba</a>. En Canarias, Ceuta y Melilla los impuestos son más bajos y los precios no son comparables: consúltalos en su provincia.</p></div>
<div class="two-col"><div class="card"><h3>${icon('pump')} Gasolina 95</h3>${tablaEstaciones(PEN.g95.orden.slice(0, 10), ['g95'], { conMunicipio: true })}<p class="more"><a class="link-arrow" href="${u('/precio-gasolina-95/')}">Precio de la gasolina 95 ${icon('arrow')}</a></p></div>
<div class="card"><h3>${icon('pump')} Diésel</h3>${tablaEstaciones(PEN.die.orden.slice(0, 10), ['die'], { conMunicipio: true })}<p class="more"><a class="link-arrow" href="${u('/precio-diesel/')}">Precio del diésel ${icon('arrow')}</a></p></div></div></section>
<section class="sec" id="provincias"><div class="sec-head"><p class="eyebrow">${icon('pin')} Por provincia</p><h2>Precio medio de la gasolina 95 por provincia</h2><p>Pulsa en tu provincia para ver todas sus gasolineras, de la más barata a la más cara.</p></div>
<div class="card">${ranking(provOrd, { valor: (p) => p.s.g95.avg, etiqueta: (p) => p.nombre, href: (p) => u(p.path) })}</div></section>
<section class="sec"><div class="sec-head"><p class="eyebrow">${icon('tag')} Marcas</p><h2>¿Repsol, Cepsa o una low cost?</h2><p>Compara lo que cuesta de media repostar en cada marca.</p></div>
<p><a class="btn btn-ghost" href="${u('/marcas/')}">${icon('tag')}<span>Ver el ranking de marcas</span></a> <a class="btn btn-ghost" href="${u('/calculadora-coste-viaje/')}">${icon('calc')}<span>Calcular el coste de un viaje</span></a></p></section>
${productos()}
<aside class="callout">${icon('bolt')} <strong>¿Tienes coche eléctrico?</strong> Mira <a href="${MAIN}/cuanto-gasta/coche-electrico/">cuánto cuesta cargarlo en casa</a> con el precio de la luz de hoy.</aside>
${faq.html}`;
  write('/', layout({
    title: `Precio de la gasolina y el diésel hoy ${fechaCorta(FECHA)}: gasolineras más baratas`,
    desc: `Gasolina 95 a ${litro(g.avg)} y diésel a ${litro(d.avg)} de media hoy. Precios actualizados de las ${fmt(EST.length, 0)} gasolineras de España y las más baratas cerca de ti.`,
    p: '/', body,
    jsonld: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: 'CuántoGasta Gasolina', url: SITE + u('/'), inLanguage: 'es-ES', publisher: ORG }, faq.ld,
      { '@context': 'https://schema.org', '@type': 'Dataset', name: 'Precio de los carburantes en las gasolineras de España', description: 'Precios diarios de la gasolina 95, la gasolina 98, el diésel y el GLP en las estaciones de servicio de España.', url: SITE + u('/historico/'), creator: ORG, isBasedOn: 'https://geoportalgasolineras.es/', temporalCoverage: `${FECHAS[0]}/${FECHA}`, spatialCoverage: 'España' }],
  }), { priority: '1.0' });
}

// ---------------------------------------------------------------- páginas por combustible
for (const c of COMBUSTIBLES) {
  const s = NAC[c.id];
  if (!s) continue;
  const sp = PEN[c.id] || s; // mínimos y máximos de la península y Baleares
  const provOrd = c.id === 'g95' || c.id === 'die' ? [...provincias].filter((p) => p.s[c.id]).sort((a, b) => a.s[c.id].avg - b.s[c.id].avg) : [];
  const v1 = variacion(c.id, 1), v30 = variacion(c.id, 30);
  const marcas = Object.entries(HIST[FECHA]?.marcas || {}).filter(([, m]) => m[c.id]).sort((a, b) => a[1][c.id] - b[1][c.id]);
  const faq = faqBlock([
    [`¿Cuánto cuesta el litro de ${c.largo} hoy?`, `Hoy, ${fechaLarga(FECHA)}, el precio medio de la ${c.largo} en España es de ${litro(s.avg)} por litro, según los datos de ${fmt(s.n, 0)} gasolineras.${v30 !== null ? ` Hace un mes costaba ${litro(s.avg - v30)}.` : ''}`],
    [`¿Dónde está la ${c.nombre.toLowerCase()} más barata?`, `En la península y Baleares, la más barata ahora mismo está en ${esc(estacionNombre(sp.min))}, ${esc(sp.min.dir)} (${esc(sp.min.mun)}, ${esc(PROVINCIAS[sp.min.prov])}), a ${litro(sp.min.p[c.id])}. En Canarias, con impuestos más bajos, el mínimo es ${litro(s.min.p[c.id])}.`],
    ['¿Por qué cambia tanto el precio entre gasolineras?', 'Cada gasolinera fija su precio libremente. Influyen la marca, la ubicación (las de autopista y las de centro de ciudad suelen ser más caras), la competencia cercana y si es una gasolinera automática o low cost, que ahorra costes de personal.'],
    ['¿Qué impuestos lleva el combustible?', 'Más o menos la mitad del precio son impuestos: el impuesto especial sobre hidrocarburos, que es una cantidad fija por litro, y el IVA del 21 % sobre el total. En Canarias no se aplica IVA sino IGIC y otros tributos, por eso allí es más barato.'],
  ]);
  const body = `${pageHead({ eyebrow: `${icon('pump')} ${c.nombre}`, h1: `Precio de la ${c.nombre.toLowerCase()} hoy en España`, sub: `Media de ${fmt(s.n, 0)} gasolineras y las más baratas de cada provincia.` })}
<div class="tiles tiles-4">${tile('Precio medio hoy', litro(s.avg), '€ por litro', true)}${tile('Desde ayer', v1 !== null ? cts(v1) : '—', v1 !== null ? (v1 < 0 ? 'Ha bajado' : v1 > 0 ? 'Ha subido' : 'Sin cambios') : '')}${tile('En 30 días', v30 !== null ? cts(v30) : '—', 'Variación del precio medio')}${tile('La más barata (península)', litro(sp.min.p[c.id]), esc(sp.min.mun))}</div>
<p class="lead">Hoy la ${c.largo} cuesta de media <strong>${litro(s.avg)}</strong> el litro. Llenar un depósito de 50 litros sale por <strong>${fmt(s.avg * 50, 2)} €</strong> de media, pero en la gasolinera más barata de la península cuesta ${fmt(sp.min.p[c.id] * 50, 2)} € y en la más cara ${fmt(sp.max.p[c.id] * 50, 2)} €.</p>
${c.id !== 'glp' ? `<div class="card chart-card"><h2 class="h3">${icon('trend')} Evolución del precio medio</h2>${grafico([{ nombre: c.nombre, cls: `s-${c.id}`, puntos: serieNac(c.id) }])}</div>` : ''}
<section class="sec"><div class="sec-head"><h2>Las 20 gasolineras con la ${c.nombre.toLowerCase()} más barata</h2><p>Península y Baleares. Canarias, Ceuta y Melilla tienen impuestos más bajos: consulta sus precios en su provincia.</p></div>${tablaEstaciones(sp.orden.slice(0, 20), [c.id], { conMunicipio: true })}</section>
${provOrd.length ? `<section class="sec"><div class="sec-head"><h2>Precio medio por provincia</h2><p>De la más barata a la más cara.</p></div><div class="card">${ranking(provOrd, { valor: (p) => p.s[c.id].avg, etiqueta: (p) => p.nombre, href: (p) => u(p.path) })}</div></section>` : ''}
${marcas.length ? `<section class="sec"><div class="sec-head"><h2>Precio medio por marca</h2><p>Marcas con al menos 25 gasolineras.</p></div><div class="card">${ranking(marcas, { valor: ([, m]) => m[c.id], etiqueta: ([k, m]) => `${nombreMarca(k)} (${m.n})` })}<p class="more"><a class="link-arrow" href="${u('/marcas/')}">Ranking completo de marcas ${icon('arrow')}</a></p></div></section>` : ''}
${buscador(`${c.nombre} barata cerca de ti`)}
${productos()}
${faq.html}`;
  write(`/${c.slug}/`, layout({
    title: `Precio ${c.nombre.toLowerCase()} hoy: ${litro(s.avg)} de media (${fechaCorta(FECHA)})`,
    desc: `Precio de la ${c.largo} hoy en España: ${litro(s.avg)} de media. Las gasolineras más baratas, la evolución del precio y la media de cada provincia.`,
    p: `/${c.slug}/`, body, crumbs: [[`/${c.slug}/`, c.nombre]], jsonld: [faq.ld],
  }), { priority: '0.9' });
}

// ---------------------------------------------------------------- provincias
for (const p of provincias) {
  if (!p.est.length) continue;
  const g = p.s.g95, d = p.s.die;
  const difG = g ? g.avg - NAC.g95.avg : 0;
  const difD = d ? d.avg - NAC.die.avg : 0;
  const munOrd = p.muns.map((m) => ({ m, g95: stats(m.est, 'g95'), die: stats(m.est, 'die') }));
  const munBaratos = munOrd.filter((x) => x.g95).sort((a, b) => a.g95.avg - b.g95.avg).slice(0, 10);
  const textoComp = (dif, nombre) => (Math.abs(dif) < 0.005 ? `prácticamente igual que la media de España` : `${ctsAbs(dif)} ${dif < 0 ? 'menos' : 'más'} que la media de España`);
  const faq = faqBlock([
    [`¿Dónde está la gasolina más barata de ${p.nombre}?`, g ? `Hoy la gasolina 95 más barata de la provincia está en ${esc(estacionNombre(g.min))}, ${esc(g.min.dir)} (${esc(g.min.mun)}), a ${litro(g.min.p.g95)} el litro.` : 'No hay datos de gasolina 95 hoy.'],
    [`¿Y el diésel más barato de ${p.nombre}?`, d ? `El diésel más barato está en ${esc(estacionNombre(d.min))}, ${esc(d.min.dir)} (${esc(d.min.mun)}), a ${litro(d.min.p.die)} el litro.` : 'No hay datos de diésel hoy.'],
    [`¿Cuál es el precio medio de la gasolina en ${p.nombre}?`, `${g ? `La gasolina 95 cuesta de media ${litro(g.avg)}, ${textoComp(difG)}.` : ''} ${d ? `El diésel, ${litro(d.avg)} (${textoComp(difD)}).` : ''}`],
    [`¿Cuántas gasolineras hay en ${p.nombre}?`, `Hay ${fmt(p.est.length, 0)} gasolineras abiertas al público que comunican sus precios, repartidas en ${p.muns.length} municipios.`],
  ]);
  const body = `${pageHead({ ico: 'pin', eyebrow: `${icon('pin')} Provincia de ${esc(p.nombre)}`, h1: `Gasolineras más baratas en ${p.nombre} hoy`, sub: `Precio de la gasolina y el diésel en las ${fmt(p.est.length, 0)} gasolineras de la provincia.` })}
<div class="tiles tiles-4">${g ? tile('Gasolina 95 · media', litro(g.avg), `${cts(difG)} frente a España`, true) : ''}${d ? tile('Diésel · media', litro(d.avg), `${cts(difD)} frente a España`) : ''}${g ? tile('Gasolina 95 más barata', litro(g.min.p.g95), esc(g.min.mun)) : ''}${d ? tile('Diésel más barato', litro(d.min.p.die), esc(d.min.mun)) : ''}</div>
<p class="lead">En ${esc(p.nombre)} la gasolina 95 cuesta hoy de media <strong>${g ? litro(g.avg) : '—'}</strong>${g ? `, ${textoComp(difG)}` : ''}. Entre la gasolinera más barata y la más cara de la provincia hay ${g ? ctsAbs(g.max.p.g95 - g.min.p.g95) : '—'} por litro${g ? `: ${fmt((g.max.p.g95 - g.min.p.g95) * 50, 2)} € de diferencia en un depósito de 50 litros` : ''}.</p>
<div class="two-col">${g ? `<div class="card"><h2 class="h3">${icon('pump')} Gasolina 95 más barata</h2>${tablaEstaciones(g.orden.slice(0, 10), ['g95'], { conMunicipio: true })}</div>` : ''}${d ? `<div class="card"><h2 class="h3">${icon('pump')} Diésel más barato</h2>${tablaEstaciones(d.orden.slice(0, 10), ['die'], { conMunicipio: true })}</div>` : ''}</div>
${buscador()}
${FECHAS.length > 7 ? `<div class="card chart-card"><h2 class="h3">${icon('trend')} Evolución del precio medio en ${esc(p.nombre)}</h2>${grafico([{ nombre: 'Gasolina 95', cls: 's-g95', puntos: serieProv(p.code, 'g95') }, { nombre: 'Diésel', cls: 's-die', puntos: serieProv(p.code, 'die') }])}</div>` : ''}
${munBaratos.length > 3 ? `<section class="sec"><div class="sec-head"><h2>Municipios con la gasolina más barata</h2><p>Precio medio de la gasolina 95 en cada municipio.</p></div><div class="card">${ranking(munBaratos, { valor: (x) => x.g95.avg, etiqueta: (x) => x.m.nombre, href: (x) => u(x.m.path) })}</div></section>` : ''}
<section class="sec"><div class="sec-head"><h2>Gasolineras por municipio</h2><p>${p.muns.length} municipios de ${esc(p.nombre)} con gasolinera.</p></div>
<div class="table-wrap"><table class="data"><thead><tr><th>Municipio</th><th class="num">Gasolineras</th><th class="num">Gasolina 95</th><th class="num">Diésel</th></tr></thead><tbody>${munOrd.map((x) => `<tr><td><a href="${u(x.m.path)}">${esc(x.m.nombre)}</a></td><td class="num">${x.m.est.length}</td><td class="num">${x.g95 ? litro(x.g95.avg) : '—'}</td><td class="num">${x.die ? litro(x.die.avg) : '—'}</td></tr>`).join('')}</tbody></table></div></section>
${productos()}
${faq.html}`;
  write(p.path, layout({
    title: `Gasolineras baratas en ${p.nombre} hoy: precio gasolina y diésel`,
    desc: `Gasolina 95 a ${g ? litro(g.avg) : '—'} y diésel a ${d ? litro(d.avg) : '—'} de media hoy en ${p.nombre}. La más barata, a ${g ? litro(g.min.p.g95) : '—'} en ${g ? g.min.mun : ''}. Todas las gasolineras de la provincia.`,
    p: p.path, body, crumbs: [[p.path, p.nombre]], jsonld: [faq.ld],
  }), { priority: '0.8' });
}

// ---------------------------------------------------------------- municipios
let paginasMun = 0;
for (const m of municipios.values()) {
  const prov = provincias.find((p) => p.code === m.prov);
  const combs = COMBUSTIBLES.map((c) => c.id).filter((c) => m.est.some((e) => e.p[c]));
  const g = stats(m.est, 'g95'), d = stats(m.est, 'die');
  const orden = [...m.est].sort((a, b) => (a.p.g95 || a.p.die || 9) - (b.p.g95 || b.p.die || 9));
  // alternativas cercanas fuera del municipio, más baratas que la media local
  const ref = { lat: m.lat, lon: m.lon };
  let alternativas = [];
  if (Number.isFinite(m.lat) && g) {
    alternativas = cercanas(ref, 15, (e) => e.p.g95 && e.p.g95 < g.min.p.g95 && !(e.prov === m.prov && slug(e.mun) === m.slug))
      .sort((a, b) => a.e.p.g95 - b.e.p.g95).slice(0, 5);
  }
  const difProv = g && prov.s.g95 ? g.avg - prov.s.g95.avg : null;
  const n = m.est.length;
  { // datos del widget de este municipio: las 5 más baratas de cada combustible (si hay pocas, se completan con las de alrededor)
    const top = (c) => {
      let l = m.est.filter((e) => e.p[c]).sort((a, b) => a.p[c] - b.p[c]).map((e) => ({ e, d: null }));
      if (l.length < 3 && Number.isFinite(m.lat)) l = l.concat(cercanas(ref, 15, (e) => e.p[c] && !(e.prov === m.prov && slug(e.mun) === m.slug)).sort((a, b) => a.e.p[c] - b.e.p[c]).slice(0, 5 - l.length));
      return l.sort((x, y) => x.e.p[c] - y.e.p[c] || (x.d ?? 0) - (y.d ?? 0)).slice(0, 5).map(({ e, d }) => [estacionNombre(e), e.dir, e.p[c], d === null ? '' : `${e.mun} · a ${fmt(d, 1)} km`]);
    };
    write(`/datos/w${m.path.slice(0, -1)}.json`, JSON.stringify({ n: m.nombre, u: m.path, f: FECHA, h: HORA, g95: top('g95'), die: top('die') }));
  }
  const intro = n === 1
    ? `En ${esc(m.nombre)} hay una gasolinera: ${esc(estacionNombre(m.est[0]))}, en ${esc(m.est[0].dir)}.`
    : `En ${esc(m.nombre)} hay ${n} gasolineras.${g ? ` La gasolina 95 más barata está hoy en <strong>${esc(estacionNombre(g.min))}</strong> (${esc(g.min.dir)}) a <strong>${litro(g.min.p.g95)}</strong>${g.n > 1 ? `, ${ctsAbs(g.max.p.g95 - g.min.p.g95)} menos que la más cara` : ''}.` : ''}`;
  const faq = faqBlock([
    [`¿Cuál es la gasolinera más barata de ${m.nombre}?`, g ? `Para gasolina 95, ${esc(estacionNombre(g.min))} (${esc(g.min.dir)}), a ${litro(g.min.p.g95)}.${d ? ` Para diésel, ${esc(estacionNombre(d.min))} (${esc(d.min.dir)}), a ${litro(d.min.p.die)}.` : ''}` : d ? `Para diésel, ${esc(estacionNombre(d.min))} (${esc(d.min.dir)}), a ${litro(d.min.p.die)}.` : 'No hay precios disponibles hoy.'],
    [`¿Cuánto cuesta la gasolina en ${m.nombre}?`, `${g ? `La gasolina 95 cuesta de media ${litro(g.avg)}${difProv !== null ? `, ${Math.abs(difProv) < 0.005 ? 'igual que' : `${ctsAbs(difProv)} ${difProv < 0 ? 'menos' : 'más'} que`} la media de la provincia de ${esc(prov.nombre)}` : ''}.` : ''} ${d ? `El diésel, ${litro(d.avg)}.` : ''} Precios del ${fechaLarga(FECHA)} a las ${HORA}.`],
  ]);
  const body = `${pageHead({ ico: 'pin', eyebrow: `${icon('pin')} ${esc(m.nombre)} · ${esc(prov.nombre)}`, h1: `Gasolineras baratas en ${m.nombre}`, sub: `Precio de la gasolina y el diésel hoy en ${n === 1 ? 'la gasolinera' : `las ${n} gasolineras`} de ${esc(m.nombre)}.` })}
<div class="tiles tiles-4">${g ? tile('Gasolina 95 más barata', litro(g.min.p.g95), esc(estacionNombre(g.min)), true) : ''}${d ? tile('Diésel más barato', litro(d.min.p.die), esc(estacionNombre(d.min))) : ''}${g ? tile('Gasolina 95 · media', litro(g.avg), difProv !== null ? `${cts(difProv)} frente a la provincia` : '') : ''}${d ? tile('Diésel · media', litro(d.avg), prov.s.die ? `${cts(d.avg - prov.s.die.avg)} frente a la provincia` : '') : ''}</div>
<p class="lead">${intro}</p>
<section class="sec"><div class="sec-head row"><h2>${icon('pump')} ${n === 1 ? 'Precios de la gasolinera' : `Las ${n} gasolineras de ${esc(m.nombre)}`}</h2>${n > 1 && combs.length > 1 ? `<div class="chips sort-chips" role="group" aria-label="Ordenar por">${combs.map((c, i) => `<button type="button" data-ordenar="${c}" aria-pressed="${i === 0}">${C[c].nombre}</button>`).join('')}</div>` : ''}</div>
<div class="table-wrap"><table class="data st-table" data-ordenable><thead><tr><th>Gasolinera</th>${combs.map((c) => `<th class="num">${C[c].nombre}</th>`).join('')}<th></th></tr></thead><tbody>${orden.map((e) => `<tr id="e${e.id}"${combs.map((c) => ` data-${c}="${e.p[c] || 99}"`).join('')}><td><strong>${esc(estacionNombre(e))}</strong><br><small>${esc(e.dir)}${e.loc && e.loc !== e.mun ? ` · ${esc(e.loc)}` : ''}${e.horario ? ` · ${esc(e.horario)}` : ''}</small></td>${combs.map((c) => `<td class="num${g && c === 'g95' && e.p.g95 === g.min.p.g95 && n > 1 ? ' good' : d && c === 'die' && e.p.die === d.min.p.die && n > 1 ? ' good' : ''}">${e.p[c] ? litro(e.p[c]) : '—'}</td>`).join('')}<td><a class="btn btn-small btn-ghost" href="${mapsUrl(e)}" rel="noopener" target="_blank">${icon('route')}<span>Ir</span></a></td></tr>`).join('')}</tbody></table></div></section>
${alternativas.length ? `<section class="sec"><div class="sec-head"><h2>Más baratas cerca de ${esc(m.nombre)}</h2><p>Gasolineras a menos de 15 km con la gasolina 95 más barata que aquí.</p></div>${tablaEstaciones(alternativas, ['g95', 'die'], { conMunicipio: true })}</section>` : ''}
<p class="more"><a class="link-arrow" href="${u(prov.path)}">Todas las gasolineras de ${esc(prov.nombre)} ${icon('arrow')}</a></p>
${buscador()}
<aside class="callout">${icon('info')} <strong>¿Tienes una web o un blog de ${esc(m.nombre)}?</strong> Pon gratis en ella las gasolineras más baratas del municipio, actualizadas cada día: <a href="${u('/widget-gratis/')}?m=${m.path.slice(1, -1)}">consigue el widget</a>.</aside>
${faq.html}`;
  write(m.path, layout({
    title: `Gasolineras baratas en ${m.nombre} hoy: precio gasolina y diésel`,
    desc: `${g ? `Gasolina 95 desde ${litro(g.min.p.g95)}` : ''}${g && d ? ' y ' : ''}${d ? `diésel desde ${litro(d.min.p.die)}` : ''} hoy en ${m.nombre} (${prov.nombre}). Precios actualizados de ${n === 1 ? 'su gasolinera' : `sus ${n} gasolineras`}, de la más barata a la más cara.`,
    p: m.path, body, crumbs: [[prov.path, prov.nombre], [m.path, m.nombre]], jsonld: [faq.ld,
      { '@context': 'https://schema.org', '@type': 'ItemList', name: `Gasolineras en ${m.nombre}`, itemListElement: orden.slice(0, 20).map((e, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'GasStation', name: estacionNombre(e), address: { '@type': 'PostalAddress', streetAddress: e.dir, postalCode: e.cp, addressLocality: e.mun, addressRegion: prov.nombre, addressCountry: 'ES' }, geo: { '@type': 'GeoCoordinates', latitude: e.lat, longitude: e.lon } } })) }],
  }), { priority: n >= 5 ? '0.6' : '0.5' });
  paginasMun++;
}

// ---------------------------------------------------------------- marcas
{
  const M = HIST[FECHA]?.marcas || {};
  const filas = Object.entries(M).filter(([, m]) => m.g95 && m.die).sort((a, b) => a[1].g95 - b[1].g95);
  const GRANDES = ['REPSOL', 'MOEVE', 'CEPSA', 'BP', 'SHELL', 'GALP', 'PETRONOR'];
  const lowcost = filas.filter(([k, m]) => m.g95 < NAC.g95.avg - 0.05 && !GRANDES.includes(k));
  const grandes = filas.filter(([k]) => GRANDES.includes(k));
  const mediaGrupo = (lista, c) => media(lista.map(([, m]) => m[c]));
  const ahorroLow = grandes.length && lowcost.length ? mediaGrupo(grandes, 'g95') - mediaGrupo(lowcost, 'g95') : null;
  const faq = faqBlock([
    ['¿Qué marca de gasolinera es la más barata?', filas.length ? `Hoy la marca con la gasolina 95 más barata de media es ${nombreMarca(filas[0][0])} (${litro(filas[0][1].g95)}) y la más cara ${nombreMarca(filas.at(-1)[0])} (${litro(filas.at(-1)[1].g95)}). Solo se comparan marcas con al menos 25 gasolineras.` : ''],
    ['¿La gasolina de las low cost es peor?', 'No. Todas las gasolineras de España venden combustible que cumple las mismas especificaciones obligatorias y se suministra desde los mismos depósitos logísticos. Las diferencias están en los aditivos de las gamas premium y en el servicio: las low cost suelen ser automáticas y sin tienda, y por eso son más baratas.'],
    ['¿Cuánto se ahorra en una gasolinera low cost?', ahorroLow !== null ? `De media, ${ctsAbs(ahorroLow)} por litro de gasolina 95 frente a las grandes marcas: ${fmt(ahorroLow * 50, 2)} € en cada depósito de 50 litros, unos ${fmt(ahorroLow * 50 * 30, 0)} € al año si llenas el depósito 30 veces.` : ''],
  ]);
  const body = `${pageHead({ ico: 'tag', eyebrow: `${icon('tag')} Ranking de marcas`, h1: '¿Qué gasolinera es más barata? Ranking de marcas', sub: 'Precio medio de la gasolina 95 y el diésel en cada marca, con los datos oficiales de hoy.' })}
${ahorroLow !== null ? `<div class="tiles">${tile('Grandes marcas · gasolina 95', litro(mediaGrupo(grandes, 'g95')), grandes.map(([k]) => nombreMarca(k)).join(', '))}${tile('Low cost · gasolina 95', litro(mediaGrupo(lowcost, 'g95')), lowcost.slice(0, 5).map(([k]) => nombreMarca(k)).join(', '), true)}${tile('Ahorro por depósito', `${fmt(ahorroLow * 50, 2)} €`, '50 litros en una low cost')}</div>` : ''}
<div class="card"><h2 class="h3">${icon('pump')} Gasolina 95 · precio medio por marca</h2>${ranking(filas, { valor: ([, m]) => m.g95, etiqueta: ([k, m]) => `${nombreMarca(k)} (${m.n})` })}</div>
<div class="card"><h2 class="h3">${icon('pump')} Diésel · precio medio por marca</h2>${ranking([...filas].sort((a, b) => a[1].die - b[1].die), { valor: ([, m]) => m.die, etiqueta: ([k, m]) => `${nombreMarca(k)} (${m.n})` })}</div>
<p class="muted">Entre paréntesis, el número de gasolineras de cada marca. Se incluyen las marcas con 25 gasolineras o más.</p>
${buscador()}
${faq.html}`;
  write('/marcas/', layout({ title: 'Gasolineras más baratas por marca: ranking de hoy', desc: `¿Repsol, Cepsa, Ballenoil o Plenoil? Precio medio de la gasolina y el diésel en cada marca de gasolinera hoy${ahorroLow !== null ? `: las low cost ahorran ${ctsAbs(ahorroLow)} por litro` : ''}.`, p: '/marcas/', body, crumbs: [['/marcas/', 'Marcas']], jsonld: [faq.ld] }), { priority: '0.8' });
}

// ---------------------------------------------------------------- mejor día para repostar
{
  // Para quitar la tendencia, se compara cada día con la media de su semana (lunes a domingo).
  const cierres = FECHAS.filter((d) => HIST[d].fuente === 'cierre' && HIST[d].nac?.g95);
  const semanas = {};
  for (const d of cierres) {
    const dt = new Date(`${d}T12:00:00Z`);
    const lunes = new Date(dt); lunes.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
    (semanas[lunes.toISOString().slice(0, 10)] ||= []).push(d);
  }
  const desv = { g95: Array.from({ length: 7 }, () => []), die: Array.from({ length: 7 }, () => []) };
  let nSem = 0;
  for (const dias of Object.values(semanas)) {
    if (dias.length < 7) continue;
    nSem++;
    for (const c of ['g95', 'die']) {
      const m = media(dias.map((d) => HIST[d].nac[c]));
      for (const d of dias) desv[c][diaSemana(d)].push(HIST[d].nac[c] - m);
    }
  }
  const ordenDias = [1, 2, 3, 4, 5, 6, 0];
  const res = Object.fromEntries(['g95', 'die'].map((c) => [c, ordenDias.map((k) => ({ k, v: media(desv[c][k]) }))]));
  const mejor = (c) => [...res[c]].sort((a, b) => a.v - b.v)[0];
  const peor = (c) => [...res[c]].sort((a, b) => b.v - a.v)[0];
  const hay = nSem >= 4;
  const tabla = (c) => `<div class="table-wrap"><table class="data"><thead><tr><th>Día</th><th class="num">Diferencia con la media de la semana</th></tr></thead><tbody>${res[c].map(({ k, v }) => `<tr><td>${DIAS[k].charAt(0).toUpperCase() + DIAS[k].slice(1)}</td><td class="num ${v < 0 ? 'good' : 'bad'}">${v === null ? '—' : cts(v)}</td></tr>`).join('')}</tbody></table></div>`;
  const body = `${pageHead({ ico: 'calendar', eyebrow: `${icon('calendar')} Análisis con datos reales`, h1: '¿Qué día es más barato para echar gasolina?', sub: `Hemos analizado el precio medio de cada día en las gasolineras de España durante ${nSem} semanas.` })}
${hay ? `<div class="tiles">${tile('Mejor día · gasolina 95', DIAS[mejor('g95').k], `${cts(mejor('g95').v)} sobre la media semanal`, true)}${tile('Mejor día · diésel', DIAS[mejor('die').k], `${cts(mejor('die').v)} sobre la media semanal`)}${tile('Día más caro', DIAS[peor('g95').k], `gasolina 95: ${cts(peor('g95').v)}`)}</div>
<p class="lead">En las últimas ${nSem} semanas, el día con la gasolina 95 más barata ha sido el <strong>${DIAS[mejor('g95').k]}</strong> y el más caro el <strong>${DIAS[peor('g95').k]}</strong>. La diferencia es pequeña, de ${ctsAbs(peor('g95').v - mejor('g95').v)} por litro (${fmt((peor('g95').v - mejor('g95').v) * 50, 2)} € por depósito): elegir bien la gasolinera ahorra mucho más que elegir el día.</p>
<div class="two-col"><div class="card"><h2 class="h3">Gasolina 95</h2>${tabla('g95')}</div><div class="card"><h2 class="h3">Diésel</h2>${tabla('die')}</div></div>` : '<p class="lead">Aún no hay suficientes semanas de datos para el análisis. Vuelve en unos días.</p>'}
<section class="prose sec"><h2>Cómo lo calculamos</h2><p>Para cada semana completa calculamos el precio medio nacional de cada día y lo comparamos con la media de esa misma semana. Así se elimina el efecto de las subidas y bajadas del petróleo, y solo queda el patrón semanal. Usamos el precio oficial de cierre de cada día que publica el Ministerio para la Transición Ecológica.</p><p>El análisis se recalcula automáticamente cada día con los datos nuevos.</p></section>
${buscador()}`;
  write('/mejor-dia-para-repostar/', layout({ title: '¿Qué día es más barato echar gasolina? Análisis con datos', desc: hay ? `Con datos oficiales de ${nSem} semanas: el ${DIAS[mejor('g95').k]} es el día con la gasolina más barata y el ${DIAS[peor('g95').k]} el más caro. Cuánto se ahorra realmente.` : 'Análisis del día de la semana más barato para repostar en España con datos oficiales.', p: '/mejor-dia-para-repostar/', body, crumbs: [['/mejor-dia-para-repostar/', 'Mejor día para repostar']] }), { priority: '0.7' });
}

// ---------------------------------------------------------------- histórico
{
  const meses = {};
  for (const d of FECHAS) (meses[d.slice(0, 7)] ||= []).push(d);
  const filas = Object.entries(meses).sort().reverse().map(([ym, dias]) => {
    const [y, m] = ym.split('-').map(Number);
    return `<tr><td>${MESES[m - 1].charAt(0).toUpperCase() + MESES[m - 1].slice(1)} de ${y}</td>${['g95', 'die', 'g98', 'glp'].map((c) => { const v = media(dias.map((d) => HIST[d].nac?.[c]).filter(Boolean)); return `<td class="num">${v ? litro(v) : '—'}</td>`; }).join('')}<td class="num">${dias.length}</td></tr>`;
  }).join('');
  const body = `${pageHead({ ico: 'chart', eyebrow: `${icon('chart')} Histórico`, h1: 'Histórico del precio de la gasolina y el diésel', sub: 'Precio medio diario de todas las gasolineras de España.' })}
<div class="card chart-card">${grafico(COMBUSTIBLES.filter((c) => c.id !== 'glp').map((c) => ({ nombre: c.nombre, cls: `s-${c.id}`, puntos: serieNac(c.id, 400) })), { alto: 280 })}</div>
<section class="sec"><div class="sec-head"><h2>Precio medio por mes</h2></div><div class="table-wrap"><table class="data"><thead><tr><th>Mes</th><th class="num">Gasolina 95</th><th class="num">Diésel</th><th class="num">Gasolina 98</th><th class="num">GLP</th><th class="num">Días</th></tr></thead><tbody>${filas}</tbody></table></div></section>
<p class="muted">Los datos completos (medias diarias nacionales, por provincia y por marca) están disponibles en formato abierto: <a href="${u('/datos/historico.json')}">historico.json</a>.</p>`;
  write('/historico/', layout({ title: 'Histórico del precio de la gasolina y el diésel en España', desc: 'Evolución diaria y media mensual del precio de la gasolina 95, la gasolina 98, el diésel y el GLP en España, con datos oficiales.', p: '/historico/', body, crumbs: [['/historico/', 'Histórico']] }), { priority: '0.6' });
  write('/datos/historico.json', JSON.stringify(HIST));
}

// ---------------------------------------------------------------- calculadora
{
  const precios = Object.fromEntries(COMBUSTIBLES.map((c) => [c.id, NAC[c.id] ? +NAC[c.id].avg.toFixed(3) : null]));
  const body = `${pageHead({ ico: 'calc', eyebrow: `${icon('calc')} Calculadora`, h1: '¿Cuánto cuesta un viaje en coche?', sub: 'Calcula la gasolina o el diésel que gastarás y cuánto toca pagar a cada uno, con el precio de hoy.' })}
<section class="card calc" id="calc-viaje">
<div class="calc-grid">
<label>Distancia (km)<input type="number" inputmode="decimal" min="1" step="1" value="300" data-km></label>
<label>Consumo del coche (l/100 km)<input type="number" inputmode="decimal" min="1" step="0.1" value="6.5" data-consumo><small>Un turismo medio gasta 5-7 l/100 km</small></label>
<label>Combustible<select data-comb>${COMBUSTIBLES.map((c) => `<option value="${c.id}" data-precio="${precios[c.id] ?? ''}">${c.nombre}</option>`).join('')}</select></label>
<label>Precio por litro (€)<input type="number" inputmode="decimal" min="0.5" step="0.001" value="${precios.g95}" data-precio><small>Media de España hoy</small></label>
<label>Personas que pagan<input type="number" inputmode="numeric" min="1" step="1" value="1" data-personas></label>
<label class="check-label"><input type="checkbox" data-vuelta> Ida y vuelta</label>
</div>
<div class="calc-out"><div><span>Coste del viaje</span><strong data-out-total>—</strong><small data-out-litros></small></div><div><span>Por persona</span><strong data-out-persona>—</strong><small>gastos de combustible</small></div><div><span>Por kilómetro</span><strong data-out-km>—</strong><small>solo combustible</small></div></div>
</section>
<section class="sec"><div class="sec-head"><h2>¿Cuánto cuesta llenar el depósito hoy?</h2><p>Con el precio medio de España del ${fechaLarga(FECHA)}.</p></div>
<div class="table-wrap"><table class="data"><thead><tr><th>Depósito</th>${['g95', 'die'].map((c) => `<th class="num">${C[c].nombre}</th>`).join('')}<th class="num">Ahorro en la más barata</th></tr></thead><tbody>${[40, 50, 60, 70].map((l) => `<tr><td>${l} litros</td>${['g95', 'die'].map((c) => `<td class="num">${fmt(NAC[c].avg * l, 2)} €</td>`).join('')}<td class="num good">${fmt((NAC.g95.avg - PEN.g95.min.p.g95) * l, 2)} €</td></tr>`).join('')}</tbody></table></div></section>
<section class="prose sec"><h2>Cómo se calcula</h2><p>Litros = distancia × consumo ÷ 100. Coste = litros × precio por litro. Si el viaje es de ida y vuelta, se dobla la distancia. El consumo real depende de la velocidad, la carga y el tráfico: en autopista a 120 km/h un coche gasta entre un 15 y un 25 % más que a 100 km/h.</p></section>
${productos()}`;
  write('/calculadora-coste-viaje/', layout({ title: 'Calculadora del coste de un viaje en coche (gasolina y diésel)', desc: 'Calcula cuánto cuesta un viaje en coche y cuánto paga cada uno, con el precio de la gasolina y el diésel de hoy.', p: '/calculadora-coste-viaje/', body, crumbs: [['/calculadora-coste-viaje/', 'Calculadora de viaje']], pageData: { precios } }), { priority: '0.7' });
}

// ---------------------------------------------------------------- cerca de mí
write('/cerca-de-mi/', layout({
  title: 'Gasolineras más baratas cerca de mí (precios de hoy)',
  desc: 'Encuentra en un clic la gasolinera más barata cerca de tu ubicación, con los precios oficiales de hoy de gasolina 95, 98, diésel y GLP.',
  p: '/cerca-de-mi/', crumbs: [['/cerca-de-mi/', 'Cerca de mí']],
  body: `${pageHead({ ico: 'locate', eyebrow: `${icon('locate')} Cerca de ti`, h1: 'Gasolineras más baratas cerca de mí', sub: 'Usa tu ubicación o escribe tu pueblo o código postal y verás las gasolineras de tu zona ordenadas por precio.' })}
${buscador('Buscar gasolineras baratas cerca de ti')}
<section class="prose sec"><h2>Cómo funciona</h2><p>Tu navegador nos da tu posición aproximada y la web calcula, <strong>en tu propio dispositivo</strong>, la distancia a las ${fmt(EST.length, 0)} gasolineras de España. Tu ubicación no se envía a ningún sitio.</p><p>Si no quieres compartir la ubicación, escribe tu pueblo, tu ciudad o tu código postal: la web usa el centro de esa zona.</p><p>Para que la próxima vez veas tus gasolineras sin hacer nada, la web recuerda tu zona (redondeada a unos 100 metros) y el combustible elegido en el almacenamiento de tu navegador. No sale de tu dispositivo y puedes borrarla cuando quieras con «Olvidar».</p></section>`,
}), { priority: '0.8' });

// ---------------------------------------------------------------- sobre
write('/sobre/', layout({
  title: 'Método y fuentes de los precios de la gasolina', desc: 'De dónde salen los precios de la gasolina y el diésel de esta web, cada cuánto se actualizan y cómo se calculan las medias.',
  p: '/sobre/', crumbs: [['/sobre/', 'Método y fuentes']],
  body: `${pageHead({ ico: 'info', h1: 'Método y fuentes' })}<section class="prose">
<p>CuántoGasta Gasolina muestra el precio de venta al público de los carburantes en las estaciones de servicio de España. Es un proyecto independiente de <a href="${MAIN}/">CuántoGasta</a>, sin relación con ninguna petrolera.</p>
<h2>Fuente de los datos</h2><p>Los precios proceden del <a href="https://geoportalgasolineras.es/" rel="noopener">Geoportal de Hidrocarburos</a> del Ministerio para la Transición Ecológica y el Reto Demográfico. Todas las gasolineras están obligadas a comunicar sus precios cada vez que los cambian. La web descarga los datos oficiales varias veces al día; la última actualización es del ${fechaLarga(FECHA)} a las ${HORA}.</p>
<h2>Qué gasolineras se incluyen</h2><p>Solo las de venta al público: se excluyen las de venta restringida a socios o flotas, porque no están abiertas a cualquier conductor. También se descartan precios claramente erróneos (por debajo de 0,60 € o por encima de 3,50 € por litro).</p>
<h2>Cómo se calculan las medias</h2><p>Las medias son aritméticas: todas las gasolineras pesan igual, independientemente de lo que vendan. El histórico usa el precio oficial de cierre de cada día.</p>
<h2>Limitaciones</h2><p>El precio puede cambiar a lo largo del día y alguna gasolinera puede tardar en comunicarlo. Antes de un desplazamiento largo, comprueba el precio en el surtidor.</p>
<h2>Privacidad</h2><p>La web no usa cookies propias ni pide registro.${CFG.adsenseClient ? ' Se financia con publicidad de Google AdSense: Google puede usar cookies para mostrar anuncios, y antes de usar las que no son necesarias te pide permiso con su aviso de cookies.' : ''} La búsqueda «cerca de mí» calcula las distancias en tu navegador: tu ubicación no se envía a ningún servidor. Tu zona y el combustible elegido se recuerdan en el almacenamiento local de tu navegador para mostrarte tus gasolineras al volver; puedes borrarlos con «Olvidar». Más información en la <a href="${MAIN}/privacidad/">política de privacidad</a>.</p>
</section>`,
}), { priority: '0.3' });

// ---------------------------------------------------------------- 404, sitemap e IndexNow

// ---------------------------------------------------------------- widget para otras webs
// /widget/?m=provincia/municipio es una página mínima para un iframe (sin índice en Google) que lee los datos
// pequeños de /datos/w/provincia/municipio.json. /widget-gratis/ deja elegir el municipio y copiar el código:
// el enlace que va debajo del iframe apunta a la página del municipio y suma enlaces hacia la web.
{
  const css = `*{box-sizing:border-box}html,body{height:100%}body{margin:0;font:14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#10231f;background:#fff}
.w{height:100%;padding:12px 14px;border:1px solid #d5e4df;border-radius:12px;display:flex;flex-direction:column;gap:8px;overflow:hidden}
.t{margin:0;font-size:15px;font-weight:700;display:flex;justify-content:space-between;align-items:baseline;gap:8px}.t small{font-weight:500;color:#5b6f69;white-space:nowrap}
.tabs{display:flex;gap:6px}.tabs button{font:inherit;font-size:12px;font-weight:700;border:1.5px solid #d5e4df;background:none;color:inherit;padding:3px 10px;border-radius:999px;cursor:pointer}.tabs button[aria-pressed=true]{background:#0f766e;border-color:#0f766e;color:#fff}
ol{list-style:none;margin:0;padding:0;flex:1;overflow:hidden}li{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid #edf3f1}li:last-child{border:0}
li div{min-width:0}li strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}li small{display:block;color:#5b6f69;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
li b{white-space:nowrap;font-variant-numeric:tabular-nums}li:first-child b{color:#15803d}
.f{display:flex;justify-content:space-between;gap:8px;font-size:12px}.f a{color:#0f766e;font-weight:700;text-decoration:none}.f span{color:#5b6f69}.msg{color:#5b6f69}
@media (prefers-color-scheme:dark){body{background:#0f1b18;color:#e8efec}.w{border-color:#22312c}.t small,li small,.f span,.msg{color:#9db0aa}li{border-color:#1d2a26}li:first-child b{color:#4ade80}.f a{color:#5eead4}.tabs button{border-color:#22312c}.tabs button[aria-pressed=true]{background:#2dd4bf;border-color:#2dd4bf;color:#052e2a}}`;
  const js = `(()=>{const BASE='${BASE}',SITE='${SITE}';const $=(i)=>document.getElementById(i);
const m=new URLSearchParams(location.search).get('m')||'';const lista=$('lista');
const msg=(t)=>{lista.innerHTML='';const li=document.createElement('li');li.className='msg';li.textContent=t;lista.appendChild(li)};
if(!/^[a-z0-9-]+\\/[a-z0-9-]+$/.test(m)){msg('Elige tu municipio en '+SITE+BASE+'/widget-gratis/');return}
const f3=(x)=>x.toLocaleString('es-ES',{minimumFractionDigits:3,maximumFractionDigits:3})+' €';
fetch(BASE+'/datos/w/'+m+'.json').then((r)=>{if(!r.ok)throw 0;return r.json()}).then((d)=>{
$('tit').textContent='Gasolineras baratas en '+d.n;const [y,mm,dd]=d.f.split('-');$('fecha').textContent=Number(dd)+'/'+Number(mm)+' '+d.h;
$('todas').href=SITE+BASE+d.u;$('todas').textContent='Ver todas en '+d.n+' →';
const pinta=(c)=>{document.querySelectorAll('.tabs button').forEach((b)=>b.setAttribute('aria-pressed',String(b.dataset.c===c)));lista.innerHTML='';
if(!d[c].length){msg('No hay precios de este combustible hoy.');return}
for(const [nombre,dir,precio,lejos] of d[c]){const li=document.createElement('li');const div=document.createElement('div');const s=document.createElement('strong');s.textContent=nombre;const sm=document.createElement('small');sm.textContent=lejos||dir;div.append(s,sm);const b=document.createElement('b');b.textContent=f3(precio);li.append(div,b);lista.appendChild(li)}};
document.querySelectorAll('.tabs button').forEach((b)=>b.addEventListener('click',()=>pinta(b.dataset.c)));pinta(d.g95.length?'g95':'die');
}).catch(()=>msg('No se pudieron cargar los precios.'))})();`;
  write('/widget/', `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow">
<title>Gasolineras más baratas hoy · CuántoGasta</title><meta name="description" content="Widget con las gasolineras más baratas de un municipio y sus precios de hoy, para poner en cualquier web."><link rel="canonical" href="${SITE}${u('/')}"><style>${css}</style></head><body>
<main class="w"><h1 class="t"><span id="tit">Gasolineras más baratas</span> <small id="fecha"></small></h1>
<div class="tabs" role="group" aria-label="Combustible"><button type="button" data-c="g95" aria-pressed="true">Gasolina 95</button><button type="button" data-c="die" aria-pressed="false">Diésel</button></div>
<ol id="lista"></ol>
<div class="f"><a id="todas" href="${SITE}${u('/')}" target="_blank" rel="noopener">Ver todas →</a><span>Precios oficiales</span></div></main>
<script>${js}</script></body></html>`, { sitemapEntry: false });

  // página para elegir el municipio y copiar el código
  const lista = provincias.filter((p) => p.muns.length).map((p) => [p.slug, p.nombre, p.muns.map((m) => [m.slug, m.nombre])]);
  const body = `${pageHead({ ico: 'pump', eyebrow: `${icon('pump')} Gratis para tu web o blog`, h1: 'Widget de las gasolineras más baratas para tu web', sub: 'Muestra en tu web las 5 gasolineras más baratas de tu municipio con los precios de hoy. Se actualiza solo, es gratis y no necesita registro.' })}
<section class="card w-elegir" id="widget-elegir"><h2 class="h3">1. Elige tu municipio</h2>
<div class="near-ctrl"><label>Provincia <select id="w-prov"><option value="">Elige provincia…</option></select></label><label>Municipio <select id="w-mun" disabled><option value="">Elige municipio…</option></select></label></div></section>
<div class="two-col"><section class="card"><h2 class="h3">2. Así se verá</h2><div id="w-vista"><p class="muted">Elige un municipio para ver el widget.</p></div></section>
<section class="card"><h2 class="h3">3. Cópialo en tu web</h2><p>Pega este código donde quieras que aparezca (en WordPress, en un bloque «HTML personalizado»):</p>
<textarea id="w-codigo" readonly rows="7" style="width:100%;font:13px/1.4 ui-monospace,monospace;padding:10px;border-radius:10px;border:1.5px solid var(--line);background:var(--surface);color:var(--text)"></textarea>
<p><button class="btn" type="button" id="w-copiar" disabled>${icon('check')}<span>Copiar código</span></button></p></section></div>
<section class="prose sec"><h2>Preguntas frecuentes</h2>
<h3>¿Cuesta algo?</h3><p>No. Es gratis para cualquier web: ayuntamientos, periódicos locales, blogs, asociaciones o comercios. Solo te pedimos que mantengas el enlace de debajo.</p>
<h3>¿Cada cuánto se actualiza?</h3><p>Varias veces al día, con los precios oficiales que las gasolineras comunican al Ministerio para la Transición Ecológica.</p>
<h3>¿Hay algo parecido para la luz?</h3><p>Sí: el <a href="${MAIN}/widget/">widget del precio de la luz hoy por horas</a>.</p></section>
<script type="application/json" id="w-datos">${JSON.stringify(lista).replace(/</g, '\\u003c')}</script>
<script>(()=>{const L=JSON.parse(document.getElementById('w-datos').textContent);const SITE='${SITE}',BASE='${BASE}';
const pr=document.getElementById('w-prov'),mu=document.getElementById('w-mun'),cod=document.getElementById('w-codigo'),vista=document.getElementById('w-vista'),cop=document.getElementById('w-copiar');
for(const [s,n] of L)pr.add(new Option(n,s));
const esc=(t)=>t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const llenar=()=>{const p=L.find((x)=>x[0]===pr.value);mu.innerHTML='';mu.add(new Option('Elige municipio…',''));if(!p){mu.disabled=true;return}for(const [s,n] of p[2])mu.add(new Option(n,s));mu.disabled=false};
const mostrar=()=>{const p=L.find((x)=>x[0]===pr.value);const m=p&&p[2].find((x)=>x[0]===mu.value);if(!m){cod.value='';cop.disabled=true;return}
const id=p[0]+'/'+m[0];const src=SITE+BASE+'/widget/?m='+id;
cod.value='<iframe src="'+src+'" width="320" height="300" style="border:0;max-width:100%" title="Gasolineras más baratas en '+esc(m[1])+'" loading="lazy"></iframe>\\n<p style="font:12px/1.4 sans-serif;margin:4px 0 0">Precios de hoy: <a href="'+SITE+BASE+'/'+id+'/">gasolineras baratas en '+esc(m[1])+'</a> · CuántoGasta</p>';
vista.innerHTML='<iframe src="'+BASE+'/widget/?m='+id+'" width="320" height="300" style="border:0;max-width:100%" title="Vista previa del widget" loading="lazy"></iframe>';cop.disabled=false;
history.replaceState(null,'','?m='+id)};
pr.addEventListener('change',()=>{llenar();mostrar()});mu.addEventListener('change',mostrar);
cop.addEventListener('click',async()=>{cod.select();try{await navigator.clipboard.writeText(cod.value)}catch{document.execCommand('copy')}cop.querySelector('span').textContent='¡Copiado!'});
const q=(new URLSearchParams(location.search).get('m')||'').split('/');if(q.length===2){pr.value=q[0];llenar();mu.value=q[1];mostrar()}})();</script>`;
  write('/widget-gratis/', layout({
    title: 'Widget gratis de las gasolineras más baratas para tu web',
    desc: 'Pon gratis en tu web o blog las gasolineras más baratas de tu municipio con los precios de hoy. Se actualiza solo con los datos oficiales. Elige el municipio y copia el código.',
    p: '/widget-gratis/', body, crumbs: [['/widget-gratis/', 'Widget para tu web']],
  }), { priority: '0.5' });
}

write('/404.html', layout({ title: 'Página no encontrada', desc: 'La página que buscas no existe o ha cambiado de sitio. Busca las gasolineras más baratas de tu provincia o cerca de ti.', p: '/404.html', body: `${pageHead({ ico: 'info', h1: 'No encontramos esa página' })}<p class="lead">Puede que el municipio se haya movido. Prueba a buscar desde tu provincia:</p>${buscador()}` }), { sitemapEntry: false });
write('/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map((s) => `<url><loc>${s.loc}</loc><lastmod>${FECHA}</lastmod>${s.priority ? `<priority>${s.priority}</priority>` : ''}</url>`).join('\n')}\n</urlset>\n`, { sitemapEntry: false });
const diario = [u('/'), ...COMBUSTIBLES.map((c) => u(`/${c.slug}/`)), u('/marcas/'), u('/mejor-dia-para-repostar/'), ...provincias.map((p) => u(p.path))].map((x) => SITE + x);
write('/datos/indexnow-diario.json', JSON.stringify(diario), { sitemapEntry: false });

console.log(`Web generada: ${sitemap.length} páginas (${paginasMun} municipios, ${provincias.filter((p) => p.est.length).length} provincias) · datos del ${FECHA} ${HORA} · ${FECHAS.length} días de histórico`);
