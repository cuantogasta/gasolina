// CuántoGasta Gasolina: búsqueda «cerca de mí», orden de tablas y calculadora. Sin dependencias.
const BASE = '__BASE__';
const nf3 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const nf2 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COLS = { g95: 2, die: 3, g98: 4, glp: 5 };
const NOMBRES = { g95: 'Gasolina 95', die: 'Diésel', g98: 'Gasolina 98', glp: 'GLP' };

// ---------------------------------------------------------------- cerca de mí
// La zona elegida (ubicación redondeada o pueblo) se recuerda solo en este navegador para
// mostrar las gasolineras cercanas al volver. No se envía a ningún sitio.
const ZONA = 'cg-gas-zona', PREF = 'cg-gas-pref';
const local = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};
const cargar = async (f) => { const r = await fetch(`${BASE}/datos/${f}`); if (!r.ok) throw new Error(r.status); return r.json(); };
let datosP = null, zonasP = null;
const cargarDatos = () => (datosP ||= cargar('gasolineras.json').catch((e) => { datosP = null; throw e; }));
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const cargarZonas = () => (zonasP ||= cargar('zonas.json').then((z) => ({ ...z, idx: z.m.map((m) => norm(m[0])) })).catch((e) => { zonasP = null; throw e; }));
const mediaDe = (v) => v.reduce((a, b) => a + b, 0) / v.length;

function km(a, b) {
  const R = Math.PI / 180;
  const h = Math.sin((b[0] - a[0]) * R / 2) ** 2 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * Math.sin((b[1] - a[1]) * R / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** Sugerencias para lo que escribe el usuario: códigos postales o pueblos (primero los que empiezan así). */
function buscarZonas(z, texto) {
  const n = norm(texto);
  if (!n) return [];
  const deCp = (k, sub = 'Código postal') => ({ nombre: `CP ${k}`, sub, lat: z.cp[k][0], lon: z.cp[k][1] });
  if (/^\d{5}$/.test(n)) {
    if (z.cp[n]) return [deCp(n)];
    for (const largo of [4, 3, 2]) { // código postal sin gasolinera: el centro de los códigos vecinos
      const v = Object.keys(z.cp).filter((k) => k.startsWith(n.slice(0, largo)));
      if (v.length) return [{ nombre: `CP ${n}`, sub: 'Código postal (zona aproximada)', lat: mediaDe(v.map((k) => z.cp[k][0])), lon: mediaDe(v.map((k) => z.cp[k][1])) }];
    }
    return [];
  }
  if (/^\d+$/.test(n)) return Object.keys(z.cp).filter((k) => k.startsWith(n)).slice(0, 8).map((k) => deCp(k));
  const nivel = [[], [], []];
  z.idx.forEach((t, i) => {
    if (t.startsWith(n)) nivel[0].push(z.m[i]);
    else if (t.includes(` ${n}`)) nivel[1].push(z.m[i]);
    else if (n.length > 2 && t.includes(n)) nivel[2].push(z.m[i]);
  });
  return nivel.flatMap((v) => v.sort((a, b) => a[0].length - b[0].length)).slice(0, 8).map((m) => ({ nombre: m[0], sub: m[1], lat: m[2], lon: m[3] }));
}

function pintar(box, d, zona) {
  const comb = box.querySelector('[data-comb][aria-pressed="true"]')?.dataset.comb || 'g95';
  const radioElegido = Number(box.querySelector('[data-radio]').value);
  const orden = box.querySelector('[data-orden]').value;
  const col = COLS[comb];
  const out = box.querySelector('.near-out');
  const todas = d.e.filter((e) => e[col] > 0).map((e) => ({ e, d: km([zona.lat, zona.lon], e) }));
  let radio = radioElegido, zonaLista = todas.filter((x) => x.d <= radio);
  for (const r of [10, 25, 50, 100]) { // con muy pocas gasolineras cerca, se amplía el radio
    if (zonaLista.length >= 3 || r <= radio) continue;
    radio = r; zonaLista = todas.filter((x) => x.d <= radio);
  }
  if (!zonaLista.length) {
    out.innerHTML = `<p class="near-msg">No hay gasolineras con ${NOMBRES[comb]} a menos de ${radio} km de ${esc(zona.nombre)}.</p>`;
    return;
  }
  const porPrecio = [...zonaLista].sort((a, b) => a.e[col] - b.e[col] || a.d - b.d);
  const lista = (orden === 'distancia' ? [...zonaLista].sort((a, b) => a.d - b.d) : porPrecio).slice(0, 15);
  const mejor = porPrecio[0];
  const media = mediaDe(zonaLista.map((x) => x.e[col]));
  const ruta = (e) => `https://www.google.com/maps/dir/?api=1&destination=${e[0]},${e[1]}`;
  const ahorro = (media - mejor.e[col]) * 50;
  out.innerHTML = `${radio !== radioElegido ? `<p class="near-msg">Hay pocas gasolineras con ${NOMBRES[comb]} a menos de ${radioElegido} km: se muestran las de hasta ${radio} km.</p>` : ''}
<div class="near-best"><span class="near-best-p">${nf3.format(mejor.e[col])} €</span><div><strong>La ${NOMBRES[comb].toLowerCase()} más barata de tu zona: <a href="${BASE}${esc(mejor.e[9])}">${esc(mejor.e[6])}</a></strong><br><small>${esc(mejor.e[7])} · ${esc(mejor.e[8])} · a ${nf1.format(mejor.d)} km${ahorro >= 0.5 ? ` · ${nf2.format(ahorro)} € menos que la media de la zona en 50 litros` : ''}</small></div><a class="btn btn-small" href="${ruta(mejor.e)}" rel="noopener" target="_blank">Cómo llegar</a></div>
<p class="muted">${orden === 'distancia' ? 'Las más cercanas' : 'Las más baratas'} de las ${zonaLista.length} gasolineras con ${NOMBRES[comb]} a menos de ${radio} km. Media de la zona: ${nf3.format(media)} €/l. Precios del ${d.fecha.split('-').reverse().join('/')} a las ${d.hora}.</p>
<div class="table-wrap"><table class="data st-table"><thead><tr><th class="pos">#</th><th>Gasolinera</th><th class="num">${NOMBRES[comb]}</th><th class="num d">Distancia</th><th></th></tr></thead><tbody>${lista.map((x, i) => `<tr${x === mejor ? ' class="best-row"' : ''}><td class="pos">${i + 1}</td><td><strong><a href="${BASE}${esc(x.e[9])}">${esc(x.e[6])}</a></strong><br><small>${esc(x.e[7])} · ${esc(x.e[8])}<span class="d-movil"> · a ${nf1.format(x.d)} km</span></small></td><td class="num${x === mejor ? ' good' : ''}">${nf3.format(x.e[col])} €</td><td class="num d">${nf1.format(x.d)} km</td><td><a class="btn btn-small btn-ghost" href="${ruta(x.e)}" rel="noopener" target="_blank" aria-label="Cómo llegar a ${esc(x.e[6])}">Ir</a></td></tr>`).join('')}</tbody></table></div>`;
}

function iniciarBuscador(box) {
  const $ = (s) => box.querySelector(s);
  const out = $('.near-out'), btn = $('[data-buscar]'), q = $('[data-q]'), sug = $('.near-sug');
  const elegir = $('.near-elegir'), actual = $('.near-actual'), ctrl = $('.near-ctrl');
  let zona = null, sugs = [], activo = -1, aviso = '';
  const mensaje = (t) => { out.replaceChildren(); const p = document.createElement('p'); p.className = 'near-msg'; p.textContent = t; out.appendChild(p); };

  // preferencias recordadas: combustible, radio y orden
  const pref = local.get(PREF) || {};
  if (pref.comb && COLS[pref.comb]) box.querySelectorAll('[data-comb]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.comb === pref.comb)));
  if ([5, 10, 25, 50].includes(pref.radio)) $('[data-radio]').value = String(pref.radio);
  if (pref.orden === 'distancia') $('[data-orden]').value = 'distancia';
  const guardarPref = () => local.set(PREF, { comb: $('[data-comb][aria-pressed="true"]')?.dataset.comb, radio: Number($('[data-radio]').value), orden: $('[data-orden]').value });

  async function mostrar() {
    if (!zona) return;
    $('[data-zona]').textContent = zona.tipo === 'texto' && zona.sub && !zona.nombre.startsWith('CP ') ? `${zona.nombre} (${zona.sub})` : zona.nombre;
    actual.hidden = false; ctrl.hidden = false; elegir.hidden = true;
    try { pintar(box, await cargarDatos(), zona); } catch { mensaje('No se pudieron cargar los precios. Inténtalo de nuevo en un momento.'); }
  }
  const usarZona = (z) => { zona = z; local.set(ZONA, z); mostrar(); };

  function ubicar(silencioso) {
    if (!navigator.geolocation) { if (!silencioso) mensaje('Tu navegador no permite usar la ubicación. Escribe tu pueblo o tu código postal.'); return; }
    if (!silencioso) { mensaje('Buscando tu ubicación…'); btn.disabled = true; }
    const datos = cargarDatos();
    navigator.geolocation.getCurrentPosition(async (p) => {
      btn.disabled = false;
      const z = { tipo: 'gps', nombre: 'tu ubicación', lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) };
      try { // nombre de la zona: el municipio de la gasolinera más próxima
        const d = await datos;
        let cerca = null, min = Infinity;
        for (const e of d.e) { const k = km([z.lat, z.lon], e); if (k < min) { min = k; cerca = e; } }
        if (cerca && min < 15) z.nombre = `tu ubicación (${cerca[8]})`;
      } catch { /* sin nombre */ }
      usarZona(z);
    }, (err) => {
      btn.disabled = false;
      if (!silencioso) mensaje(`${err.code === 1 ? 'No has dado permiso para usar la ubicación.' : 'No se pudo obtener tu ubicación.'} Escribe tu pueblo o tu código postal.`);
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
  }

  function pintarSug() {
    const items = sugs.map((s, i) => {
      const li = document.createElement('li');
      li.id = `${sug.id}-${i}`; li.setAttribute('role', 'option'); li.setAttribute('aria-selected', String(i === activo));
      const b = document.createElement('strong'); b.textContent = s.nombre;
      const sm = document.createElement('small'); sm.textContent = s.sub;
      li.append(b, sm);
      li.addEventListener('mousedown', (ev) => { ev.preventDefault(); elegirSug(i); });
      return li;
    });
    if (!sugs.length && aviso) { const li = document.createElement('li'); li.className = 'vacio'; li.textContent = aviso; items.push(li); }
    sug.replaceChildren(...items);
    sug.hidden = !items.length;
    q.setAttribute('aria-expanded', String(sugs.length > 0));
    if (activo >= 0) q.setAttribute('aria-activedescendant', `${sug.id}-${activo}`); else q.removeAttribute('aria-activedescendant');
  }
  function elegirSug(i) {
    const s = sugs[i];
    if (!s) return;
    q.value = ''; sugs = []; aviso = ''; activo = -1; pintarSug();
    usarZona({ tipo: 'texto', nombre: s.nombre, sub: s.sub, lat: +s.lat.toFixed(3), lon: +s.lon.toFixed(3) });
  }
  q.addEventListener('focus', () => { cargarZonas().catch(() => {}); });
  q.addEventListener('input', async () => {
    const texto = q.value;
    let z;
    try { z = await cargarZonas(); } catch { sugs = []; aviso = 'No se pudo cargar la lista de pueblos. Inténtalo de nuevo.'; pintarSug(); return; }
    if (texto !== q.value) return; // ya ha escrito otra cosa
    sugs = buscarZonas(z, texto);
    activo = sugs.length ? 0 : -1;
    aviso = !sugs.length && norm(texto).length >= 3 ? 'No lo encontramos: prueba con tu código postal o con un pueblo cercano que tenga gasolinera.' : '';
    pintarSug();
  });
  q.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' && sugs.length) { activo = (activo + 1) % sugs.length; pintarSug(); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp' && sugs.length) { activo = (activo - 1 + sugs.length) % sugs.length; pintarSug(); ev.preventDefault(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); elegirSug(Math.max(activo, 0)); }
    else if (ev.key === 'Escape') { sugs = []; aviso = ''; activo = -1; pintarSug(); }
  });
  q.addEventListener('blur', () => { sugs = []; aviso = ''; activo = -1; pintarSug(); });

  btn.addEventListener('click', () => ubicar(false));
  $('[data-cambiar]').addEventListener('click', () => { elegir.hidden = false; q.focus(); });
  $('[data-olvidar]').addEventListener('click', () => {
    local.set(ZONA, null); zona = null;
    actual.hidden = true; ctrl.hidden = true; elegir.hidden = false; out.replaceChildren();
  });
  box.querySelectorAll('[data-comb]').forEach((b) => b.addEventListener('click', () => {
    box.querySelectorAll('[data-comb]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    guardarPref(); mostrar();
  }));
  for (const s of ['[data-radio]', '[data-orden]']) $(s).addEventListener('change', () => { guardarPref(); mostrar(); });
  $('[data-ir]')?.addEventListener('change', (ev) => { if (ev.target.value) location.href = ev.target.value; });

  // al abrir la página: la zona recordada al instante y, si ya hay permiso de ubicación, la posición actual
  const z0 = local.get(ZONA);
  if (z0 && Number.isFinite(z0.lat) && Number.isFinite(z0.lon) && typeof z0.nombre === 'string') { zona = z0; mostrar(); }
  if ((!z0 || z0.tipo === 'gps') && navigator.permissions?.query) {
    navigator.permissions.query({ name: 'geolocation' }).then((st) => { if (st.state === 'granted') ubicar(true); }).catch(() => {});
  }
}
document.querySelectorAll('.near').forEach(iniciarBuscador);

// ---------------------------------------------------------------- ordenar tablas de un municipio
for (const chips of document.querySelectorAll('.sort-chips')) {
  const tabla = chips.closest('section').querySelector('table[data-ordenable] tbody');
  chips.querySelectorAll('[data-ordenar]').forEach((b) => b.addEventListener('click', () => {
    chips.querySelectorAll('[data-ordenar]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const k = b.dataset.ordenar;
    [...tabla.rows].sort((a, c) => Number(a.dataset[k]) - Number(c.dataset[k])).forEach((r) => tabla.appendChild(r));
  }));
}

// ---------------------------------------------------------------- calculadora de viaje
const calc = document.getElementById('calc-viaje');
if (calc) {
  const $ = (s) => calc.querySelector(s);
  const precioIn = $('[data-precio]');
  $('[data-comb]').addEventListener('change', (ev) => {
    const p = ev.target.selectedOptions[0].dataset.precio;
    if (p) precioIn.value = p;
    calcular();
  });
  function calcular() {
    const kmv = Number($('[data-km]').value) * ($('[data-vuelta]').checked ? 2 : 1);
    const consumo = Number($('[data-consumo]').value);
    const precio = Number(precioIn.value);
    const personas = Math.max(1, Number($('[data-personas]').value) || 1);
    if (!(kmv > 0 && consumo > 0 && precio > 0)) return;
    const litros = (kmv * consumo) / 100;
    const total = litros * precio;
    $('[data-out-total]').textContent = `${nf2.format(total)} €`;
    $('[data-out-litros]').textContent = `${nf1.format(litros)} litros para ${nf1.format(kmv).replace(',0', '')} km`;
    $('[data-out-persona]').textContent = `${nf2.format(total / personas)} €`;
    $('[data-out-km]').textContent = `${nf2.format((total / kmv) * 100)} €/100 km`;
  }
  calc.addEventListener('input', calcular);
  calcular();
}
