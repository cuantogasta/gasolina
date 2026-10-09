// CuántoGasta Gasolina: búsqueda «cerca de mí», orden de tablas y calculadora. Sin dependencias.
const BASE = '__BASE__';
const nf3 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const nf2 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COLS = { g95: 2, die: 3, g98: 4, glp: 5 };
const NOMBRES = { g95: 'Gasolina 95', die: 'Diésel', g98: 'Gasolina 98', glp: 'GLP' };

// ---------------------------------------------------------------- cerca de mí
let datos = null;
async function cargarDatos() {
  if (!datos) datos = await (await fetch(`${BASE}/datos/gasolineras.json`)).json();
  return datos;
}
function km(a, b) {
  const R = Math.PI / 180;
  const h = Math.sin((b[0] - a[0]) * R / 2) ** 2 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * Math.sin((b[1] - a[1]) * R / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
function pintar(box, pos) {
  const comb = box.querySelector('[data-comb][aria-pressed="true"]')?.dataset.comb || 'g95';
  const radio = Number(box.querySelector('[data-radio]').value);
  const col = COLS[comb];
  const out = box.querySelector('.near-out');
  const lista = datos.e.map((e) => ({ e, d: km(pos, e) })).filter((x) => x.d <= radio && x.e[col] > 0).sort((a, b) => a.e[col] - b.e[col] || a.d - b.d).slice(0, 15);
  if (!lista.length) {
    out.innerHTML = `<p class="near-msg">No hay gasolineras con ${NOMBRES[comb]} a menos de ${radio} km. Prueba con un radio mayor.</p>`;
    return;
  }
  const media = lista.reduce((a, x) => a + x.e[col], 0) / lista.length;
  const mapa = (e) => `https://www.google.com/maps/search/?api=1&query=${e[0]},${e[1]}`;
  out.innerHTML = `<p class="muted">Las ${lista.length} gasolineras más baratas con ${NOMBRES[comb]} a menos de ${radio} km. Precios del ${datos.fecha.split('-').reverse().join('/')} a las ${datos.hora}.</p>
<div class="table-wrap"><table class="data st-table"><thead><tr><th>#</th><th>Gasolinera</th><th class="num">${NOMBRES[comb]}</th><th class="num">Distancia</th><th></th></tr></thead><tbody>${lista.map((x, i) => `<tr><td class="pos">${i + 1}</td><td><strong><a href="${BASE}${esc(x.e[9])}">${esc(x.e[6])}</a></strong><br><small>${esc(x.e[7])} · ${esc(x.e[8])}</small></td><td class="num${i === 0 ? ' good' : ''}">${nf3.format(x.e[col])} €</td><td class="num d">${nf1.format(x.d)} km</td><td><a class="btn btn-small btn-ghost" href="${mapa(x.e)}" rel="noopener" target="_blank">Ir</a></td></tr>`).join('')}</tbody></table></div>
<p class="muted">Repostar 50 litros en la primera en vez de la última de la lista ahorra ${nf2.format((lista.at(-1).e[col] - lista[0].e[col]) * 50)} €. Media de la zona: ${nf3.format(media)} €/l.</p>`;
}
for (const box of document.querySelectorAll('.near')) {
  let pos = null;
  const out = box.querySelector('.near-out');
  const btn = box.querySelector('[data-buscar]');
  const repintar = () => { if (pos && datos) pintar(box, pos); };
  box.querySelectorAll('[data-comb]').forEach((b) => b.addEventListener('click', () => {
    box.querySelectorAll('[data-comb]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    repintar();
  }));
  box.querySelector('[data-radio]').addEventListener('change', repintar);
  box.querySelector('[data-ir]')?.addEventListener('change', (ev) => { if (ev.target.value) location.href = ev.target.value; });
  btn.addEventListener('click', () => {
    if (!navigator.geolocation) { out.innerHTML = '<p class="near-msg">Tu navegador no permite usar la ubicación. Elige tu provincia abajo.</p>'; return; }
    out.innerHTML = '<p class="near-msg">Buscando tu ubicación…</p>';
    btn.disabled = true;
    const datosP = cargarDatos();
    navigator.geolocation.getCurrentPosition(async (p) => {
      pos = [p.coords.latitude, p.coords.longitude];
      try { await datosP; pintar(box, pos); } catch { out.innerHTML = '<p class="near-msg">No se pudieron cargar los precios. Inténtalo de nuevo.</p>'; }
      btn.disabled = false;
    }, (err) => {
      out.innerHTML = `<p class="near-msg">${err.code === 1 ? 'Has denegado el permiso de ubicación.' : 'No se pudo obtener tu ubicación.'} Puedes elegir tu provincia en el desplegable.</p>`;
      btn.disabled = false;
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
  });
}

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
