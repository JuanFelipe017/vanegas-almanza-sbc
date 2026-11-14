// Interfaz del sistema experto: lee el formulario, llama a la API Flask y dibuja el resultado
// sobre la placa de circuito. Toda la lógica de inferencia vive en el backend (src/motor_inferencia.py).
"use strict";

const $ = (sel) => document.querySelector(sel);
const CAMPOS_NUMERICOS = ["fps", "uso_gpu", "uso_cpu", "temperatura", "uso_ram", "ping"];
const CAMPOS_RADIO = ["calidad_graficos", "fps_caen", "tirones", "almacenamiento", "conexion"];
// data-motion lo fija el <head> según prefers-reduced-motion o la elección guardada del usuario.
const reducirMovimiento = () => document.documentElement.dataset.motion === "off";

let BASE = null;            // respuesta de /api/base
let ultimosDatos = null;    // formulario de la última consulta (para "¿Por qué no?")
let ultimoResultado = null; // respuesta de la última consulta (para "¿Por qué?")
let casoActual = null;      // caso de prueba cargado (se olvida si el usuario edita el formulario)

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (fc) => Math.round(fc * 100);
const fc2 = (x) => Number(x).toFixed(2);
const notacion = (pred, valor, equipo) => `${valor ? "" : "¬"}${pred}(${equipo})`;
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Ritmo de la animación: cada iteración del motor dura PASO ms en la placa.
const INICIO = 350, PASO = 1000;
const tIter = (it) => INICIO + (it - 1) * PASO;

// ------------------------------------------------------------------ Animaciones (botón)
function pintarBotonEfectos() {
  const on = !reducirMovimiento();
  $("#btn-efectos").setAttribute("aria-pressed", on);
  $("#efectos-estado").textContent = on ? "Sí" : "No";
}

function alternarEfectos() {
  const nuevo = reducirMovimiento() ? "on" : "off";
  document.documentElement.dataset.motion = nuevo;
  try { localStorage.setItem("sbc-motion", nuevo); } catch {}
  pintarBotonEfectos();
  toast(nuevo === "on" ? "Animaciones activadas" : "Animaciones desactivadas");
}

// ------------------------------------------------------------------ API
async function api(url, cuerpo) {
  const opciones = cuerpo === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
  };
  let resp;
  try {
    resp = await fetch(url, opciones);
  } catch {
    throw ["No se pudo conectar con el servidor. ¿Está corriendo «python src/app.py»?"];
  }
  const json = await resp.json().catch(() => ({ errores: [`Respuesta inválida del servidor (${resp.status}).`] }));
  if (!resp.ok || json.ok === false) throw json.errores || [`Error ${resp.status}`];
  return json;
}

// ------------------------------------------------------------------ Formulario
function leerFormulario() {
  const datos = { equipo: $("#equipo").value.trim() };
  CAMPOS_NUMERICOS.forEach((c) => { datos[c] = $("#" + c).value.trim(); });
  CAMPOS_RADIO.forEach((c) => { datos[c] = document.querySelector(`input[name="${c}"]:checked`)?.value || ""; });
  return datos;
}

function marcarCampo(input, mensaje) {
  const error = $("#err-" + input.id);
  if (mensaje) {
    input.setAttribute("aria-invalid", "true");
    error.textContent = mensaje;
    error.hidden = false;
  } else {
    input.removeAttribute("aria-invalid");
    error.textContent = "";
    error.hidden = true;
  }
}

// Devuelve [{campo, mensaje}]; campo es null para errores generales.
function validarFormulario(datos) {
  const errores = [];
  CAMPOS_NUMERICOS.forEach((c) => {
    const input = $("#" + c);
    marcarCampo(input, null);
    if (datos[c] === "") return;
    const v = Number(datos[c]);
    const min = Number(input.min), max = Number(input.max);
    if (!Number.isFinite(v) || v < min || v > max) {
      const etiqueta = document.querySelector(`label[for="${c}"]`).firstChild.textContent.trim();
      const mensaje = `Escriba un número entre ${min} y ${max}.`;
      marcarCampo(input, mensaje);
      errores.push({ campo: c, mensaje: `${etiqueta}: ${mensaje.toLowerCase()}` });
    }
  });
  const algunDato = CAMPOS_NUMERICOS.some((c) => datos[c] !== "") || CAMPOS_RADIO.some((c) => datos[c] !== "");
  if (!algunDato && !errores.length) {
    errores.push({ campo: null, mensaje: "Ingrese al menos una lectura o un síntoma para poder diagnosticar." });
  }
  return errores;
}

function mostrarErrores(errores) {
  const caja = $("#errores");
  if (!errores.length) { caja.hidden = true; caja.innerHTML = ""; return; }
  caja.innerHTML = errores.length === 1 ? esc(errores[0].mensaje)
    : `Revise estos datos:<ul>${errores.map((e) => `<li>${esc(e.mensaje)}</li>`).join("")}</ul>`;
  caja.hidden = false;
}

// Vista previa del predicado que generará cada campo (solo visual: decide entrada.py).
function actualizarChip(chip, valor) {
  const antes = chip.textContent;
  chip.classList.remove("is-true", "is-false");
  if (valor === null) chip.textContent = `${chip.dataset.pred} ?`;
  else {
    chip.textContent = `${chip.dataset.pred} = ${valor ? "V" : "F"}`;
    chip.classList.add(valor ? "is-true" : "is-false");
  }
  if (antes && antes !== chip.textContent) {
    chip.classList.remove("is-pop"); void chip.offsetWidth; chip.classList.add("is-pop");
  }
}

function actualizarMetrica(campo) {
  const caja = campo.closest(".metric");
  const { op, umbral, pred } = caja.dataset;
  const chip = caja.querySelector(".pred");
  chip.dataset.pred = pred;
  const v = campo.value.trim() === "" ? NaN : Number(campo.value);
  const fueraDeRango = v < Number(campo.min) || v > Number(campo.max);
  if (!Number.isFinite(v) || fueraDeRango) { actualizarChip(chip, null); caja.classList.remove("on"); return; }
  const u = Number(umbral);
  const verdadero = op === "<" ? v < u : op === ">=" ? v >= u : v > u;
  actualizarChip(chip, verdadero);
  caja.classList.toggle("on", verdadero);   // pista de oro desde el chip hasta el borde del módulo
}

function actualizarSegmento(grupo) {
  const chip = grupo.closest(".sym__row").querySelector(".pred");
  chip.dataset.pred = grupo.dataset.pred;
  const valor = grupo.querySelector("input:checked")?.value || "";
  actualizarChip(chip, valor === "" ? null : grupo.dataset.true.split(",").includes(valor));
}

function refrescarIndicadores() {
  CAMPOS_NUMERICOS.forEach((c) => actualizarMetrica($("#" + c)));
  document.querySelectorAll(".segmented[data-pred]").forEach(actualizarSegmento);
}

function llenarFormulario(datos, equipo) {
  limpiarFormulario(false);
  $("#equipo").value = equipo || "";
  CAMPOS_NUMERICOS.forEach((c) => { if (datos[c] !== undefined) $("#" + c).value = datos[c]; });
  CAMPOS_RADIO.forEach((c) => {
    const radio = document.querySelector(`input[name="${c}"][value="${datos[c] ?? ""}"]`);
    if (radio) radio.checked = true;
  });
  refrescarIndicadores();
}

function limpiarFormulario(tambienResultados = true) {
  $("#formulario").reset();
  CAMPOS_NUMERICOS.forEach((c) => marcarCampo($("#" + c), null));
  mostrarErrores([]);
  refrescarIndicadores();
  casoActual = null;
  if (!tambienResultados) return;
  $("#caso").value = "";
  $("#caso-desc").textContent = "";
  ultimosDatos = ultimoResultado = null;
  $("#resultados").classList.remove("is-stale");
  $("#veredicto").classList.remove("is-stale", "is-on", "is-none");
  if (BASE) construirPlaca(null);
  $("#placa-vacio").hidden = false;
  $("#cadena-wrap").hidden = true;
  $("#extra").hidden = true;
  $("#motor-meta").textContent = `en espera · ${BASE ? BASE.reglas.length : 15} reglas`;
  $("#tab-count-diag").textContent = "";
  $("#vd-cuerpo").innerHTML = `<p class="vd__espera"><i class="led led--off" aria-hidden="true"></i>En espera de un diagnóstico.</p>`;
  $("#porque").innerHTML = `<p class="hint">Elija una conclusión (en el veredicto o en el encadenamiento) para ver qué reglas y lecturas la sostienen.</p>`;
  $("#porque-no-select").innerHTML = `<option value="">Primero haga un diagnóstico</option>`;
  $("#porque-no-select").disabled = true;
  $("#btn-porque-no").disabled = true;
  $("#porque-no-resultado").innerHTML = "";
}

function toast(mensaje, tipo = "ok") {
  // En celular el aviso taparía los resultados; el resultado ya se anuncia en #anuncio.
  if (tipo !== "error" && matchMedia("(max-width: 760px)").matches) return;
  const t = $("#toast");
  t.hidden = true;                       // al volver a mostrarse, @starting-style repite la entrada
  t.textContent = mensaje;
  t.className = `toast toast--${tipo}`;
  requestAnimationFrame(() => { t.hidden = false; });
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { t.hidden = true; }, 3400);
}

function cargando(activo) {
  const btn = $("#btn-diagnosticar");
  btn.disabled = activo;
  btn.classList.toggle("is-loading", activo);
  btn.querySelector(".btn__text").textContent = activo ? "Razonando…" : "Diagnosticar";
  $("#resultados").setAttribute("aria-busy", activo);
}

// ------------------------------------------------------------------ Diagnóstico
async function diagnosticar(evento) {
  evento?.preventDefault();
  const datos = leerFormulario();
  const errores = validarFormulario(datos);
  mostrarErrores(errores);
  if (errores.length) {
    // El resultado anterior ya no corresponde a lo que está escrito: se atenúa.
    if (ultimoResultado) { $("#resultados").classList.add("is-stale"); $("#veredicto").classList.add("is-stale"); }
    const primero = errores.find((e) => e.campo);
    (primero ? $("#" + primero.campo) : $("#errores")).focus();
    return;
  }

  cargando(true);
  try {
    const r = await api("/api/diagnosticar", datos);
    ultimosDatos = datos;
    ultimoResultado = r;
    mostrarResultado(r);
    const top = r.diagnosticos[0] || r.recomendaciones[0];
    $("#anuncio").textContent = r.sin_conclusion
      ? "Sin conclusión: con estos datos ninguna regla se cumple."
      : `${r.diagnosticos.length} diagnósticos y ${r.recomendaciones.length} recomendaciones en ${r.iteraciones} iteraciones. Veredicto: ${top.titulo}, certeza ${pct(top.certeza)} %.`;
    // Sin aviso flotante: el resultado ya se ve en la placa, en el veredicto y en la línea de estado del motor.
    if (matchMedia("(max-width: 900px)").matches) {
      $("#resultados").scrollIntoView({ behavior: reducirMovimiento() ? "auto" : "smooth", block: "start" });
    }
  } catch (errs) {
    mostrarErrores([].concat(errs).map((m) => ({ campo: null, mensaje: String(m) })));
    $("#errores").focus();
  } finally {
    cargando(false);
  }
}

function mostrarResultado(r) {
  $("#resultados").classList.remove("is-stale");
  $("#veredicto").classList.remove("is-stale");

  // La placa de fondo también recibe la señal.
  document.body.classList.remove("is-run"); void document.body.offsetWidth; document.body.classList.add("is-run");

  $("#placa-vacio").hidden = true;
  construirPlaca(r);
  const origen = casoActual ? `Caso ${casoActual.id}` : "Consulta manual";
  const meta = `${origen} · ${r.reglas_aplicadas.length} reglas disparadas · ${r.iteraciones} iteraciones`;
  $("#motor-meta").textContent = meta;
  $("#cadena-meta").textContent = r.punto_fijo ? "punto fijo" : "límite de iteraciones";
  $("#cadena").innerHTML = cadenaHTML(r);
  $("#cadena-wrap").hidden = false;
  pintarVeredicto(r);

  $("#tab-count-diag").textContent = r.sin_conclusion ? "· sin conclusión"
    : `· ${r.diagnosticos.length} ${r.diagnosticos.length === 1 ? "diagnóstico" : "diagnósticos"}`;
  $("#log").textContent = r.log.join("\n");
  $("#extra").hidden = false;

  const select = $("#porque-no-select");
  select.innerHTML = r.no_alcanzadas.length
    ? r.no_alcanzadas.map((p) => `<option value="${p}">${esc(BASE.conclusiones[p].titulo)} (${p})</option>`).join("")
    : `<option value="">Se alcanzaron todas las conclusiones</option>`;
  select.disabled = !r.no_alcanzadas.length;
  $("#btn-porque-no").disabled = !r.no_alcanzadas.length;
  $("#porque-no-resultado").innerHTML = "";

  const primera = r.diagnosticos[0] || r.recomendaciones[0];
  if (primera) seleccionar(primera.predicado);
  else $("#porque").innerHTML = `<p class="hint">No hay conclusiones que explicar. Use <b>¿Por qué no…?</b> para ver qué condición faltó en cada regla.</p>`;
}

// ------------------------------------------------------------------ La placa de inferencia (SVG)
// Tres columnas de componentes: hechos observables → diagnósticos → recomendaciones.
// Cada condición de cada regla es una pista de oro; las reglas disparadas se encienden
// iteración por iteración y un pulso de señal las recorre.
// Chips de dos líneas (nombre y "FC 0.80 · R2") para que se lean en el proyector.
const PLACA = { W: 698, TOP: 40, PASO_FILA: 46, H_NODO: 38,
  col: { hechos: { x: 0, w: 170 }, diagnostico: { x: 246, w: 180 }, recomendacion: { x: 502, w: 196 } } };

function columnaDe(p) {
  if (BASE.predicados[p]) return "hechos";
  return BASE.conclusiones[p]?.tipo === "diagnostico" ? "diagnostico" : "recomendacion";
}

// Pista con esquinas a 45°: sale horizontal, baja por su carril y entra horizontal al destino.
function pista(x1, y1, carril, y2, x2) {
  const s = 6;
  if (Math.abs(y2 - y1) < 2 * s) return `M${x1} ${y1}H${carril}V${y2}H${x2}`;
  const d = Math.sign(y2 - y1);
  return `M${x1} ${y1}H${carril - s}L${carril} ${y1 + d * s}V${y2 - d * s}L${carril + s} ${y2}H${x2}`;
}

// Pista que cruza por encima de la columna de diagnósticos (hecho → recomendación).
function pistaBus(x1, y1, c1, c2, y2, x2) {
  const s = 6, bus = 26;
  return `M${x1} ${y1}H${c1 - s}L${c1} ${y1 - s}V${bus + s}L${c1 + s} ${bus}H${c2 - s}L${c2} ${bus + s}V${y2 - s}L${c2 + s} ${y2}H${x2}`;
}

function construirPlaca(r) {
  const svg = $("#placa");
  const { W, TOP, PASO_FILA, H_NODO, col } = PLACA;
  const listas = {
    hechos: Object.keys(BASE.predicados),
    diagnostico: Object.keys(BASE.conclusiones).filter((p) => BASE.conclusiones[p].tipo === "diagnostico"),
    recomendacion: Object.keys(BASE.conclusiones).filter((p) => BASE.conclusiones[p].tipo === "recomendacion"),
  };
  const filas = listas.hechos.length;
  const alto = TOP + filas * PASO_FILA + 4;
  svg.setAttribute("viewBox", `0 0 ${W} ${alto}`);

  const pos = {};
  Object.entries(listas).forEach(([c, nodos]) => {
    const desplaz = ((filas - nodos.length) * PASO_FILA) / 2;
    nodos.forEach((p, i) => { pos[p] = { x: col[c].x, w: col[c].w, y: TOP + desplaz + i * PASO_FILA, c }; });
  });
  const centro = (p) => pos[p].y + H_NODO / 2;

  // Estado del resultado
  const hechos = Object.fromEntries((r?.hechos_iniciales || []).map((h) => [h.predicado, h]));
  const disparo = {};    // regla -> paso (primera vez)
  (r?.reglas_aplicadas || []).forEach((p) => { if (!disparo[p.regla]) disparo[p.regla] = p; });
  const finales = Object.fromEntries([...(r?.diagnosticos || []), ...(r?.recomendaciones || [])].map((c) => [c.predicado, c]));
  const llegada = {};    // conclusión -> iteración en que se concluyó por primera vez
  (r?.reglas_aplicadas || []).forEach((p) => { if (!(p.conclusion in llegada)) llegada[p.conclusion] = p.iteracion; });

  // Carriles: cada regla tiene su propio carril vertical en el hueco que cruza.
  const carriles = {};
  ["diagnostico", "recomendacion"].forEach((tipo) => {
    const reglas = BASE.reglas.filter((rg) => BASE.conclusiones[rg.conclusion].tipo === tipo);
    const ini = tipo === "diagnostico" ? col.hechos.w + 14 : col.diagnostico.x + col.diagnostico.w + 14;
    const hueco = (tipo === "diagnostico" ? col.diagnostico.x - col.hechos.w : col.recomendacion.x - col.diagnostico.x - col.diagnostico.w) - 28;
    reglas.forEach((rg, i) => { carriles[rg.nombre] = ini + (reglas.length > 1 ? (hueco * i) / (reglas.length - 1) : hueco / 2); });
  });
  const carrilHueco1 = (i) => col.hechos.w + 14 + i * 5;   // carriles del bus (hecho → recomendación)

  let pistas = "", pulsos = "", etiquetas = "", vias = "", nodos = "", bus = 0;
  BASE.reglas.forEach((rg) => {
    const destino = rg.conclusion;
    if (!pos[destino]) return;
    const paso = disparo[rg.nombre];
    const d = paso ? tIter(paso.iteracion) : 0;
    const on = paso ? " on" : "";
    const x2 = pos[destino].x, y2 = centro(destino), carril = carriles[rg.nombre];
    rg.condiciones.forEach(([p, valor]) => {
      if (!pos[p]) return;
      const x1 = pos[p].x + pos[p].w, y1 = centro(p);
      const cruza = pos[p].c === "hechos" && pos[destino].c === "recomendacion";
      const dPath = cruza ? pistaBus(x1, y1, carrilHueco1(bus++), carril, y2, x2) : pista(x1, y1, carril, y2, x2);
      pistas += `<path class="tr${valor ? "" : " neg"}${on}" style="--d:${d}ms" d="${dPath}"/>`;
      if (paso) pulsos += `<path class="pl" pathLength="100" style="--d:${d}ms" d="${dPath}"/>`;
    });
    vias += `<circle class="via${on}" style="--d:${d}ms" cx="${carril}" cy="${y2}" r="3"/>`;
    etiquetas += `<text class="rl${on}" style="--d:${d}ms" x="${carril}" y="${y2 - 9}" text-anchor="middle">${rg.nombre}</text>`;
  });

  // Combinación MYCIN por conclusión (se muestra en la segunda línea del chip).
  const combinada = {};
  (r?.reglas_aplicadas || []).filter((p) => p.combinada).forEach((p) => { combinada[p.conclusion] = p; });

  Object.entries(pos).forEach(([p, n], i) => {
    let clase = "node", val = "", sub = "", d = 0;
    if (n.c === "hechos") {
      const h = hechos[p];
      d = i * 35;
      if (r && !h) { clase += " u"; val = "?"; }
      else if (h) { clase += h.valor ? " v" : " f"; val = h.valor ? "V" : "F"; }
    } else if (finales[p]) {
      const c = finales[p], k = combinada[p];
      clase += n.c === "diagnostico" ? " on-d" : " on-r";
      d = tIter(llegada[p]) + 550;
      sub = k ? `FC ${fc2(c.certeza)} · ${fc2(k.certeza_previa)} ⊕ ${fc2(k.certeza_paso)}` : `FC ${fc2(c.certeza)} · ${c.reglas.join("+")}`;
    }
    const yNombre = sub ? n.y + 16 : n.y + 24;
    nodos += `<g class="${clase}" style="--d:${d}ms" data-p="${p}">
      <rect class="cuerpo" x="${n.x}" y="${n.y}" width="${n.w}" height="${H_NODO}" rx="4"/>
      <circle class="led" cx="${n.x + 13}" cy="${n.y + H_NODO / 2}" r="5"/>
      <text x="${n.x + 25}" y="${yNombre}">${p}</text>
      ${sub ? `<text class="sub" x="${n.x + 25}" y="${n.y + 31}">${sub}</text>` : ""}
      ${val ? `<text class="val" x="${n.x + n.w - 10}" y="${n.y + 24}" text-anchor="end">${val}</text>` : ""}</g>`;
  });

  // Serigrafía y huellas de componentes en los espacios libres de la placa (decorativo).
  const libre = TOP + 6, abajo = alto - 70;
  const huellas = [[col.diagnostico.x + 8, libre], [col.recomendacion.x + 40, libre], [col.diagnostico.x + 8, abajo], [col.recomendacion.x + 40, abajo]]
    .map(([x, y], i) => `<g class="huella" aria-hidden="true"><rect x="${x}" y="${y}" width="8" height="10"/><rect x="${x + 16}" y="${y}" width="8" height="10"/>
      <rect class="huella__marco" x="${x - 4}" y="${y - 4}" width="32" height="18"/><text x="${x + 36}" y="${y + 9}">${["R22", "C14", "D5", "Q3"][i]}</text>
      ${i === 2 ? `<rect class="huella__led" x="${x + 70}" y="${y + 2}" width="8" height="6"/>` : ""}</g>`).join("");

  const titulos = `<text class="col-t" x="${col.hechos.x}" y="14">Hechos observables</text>
    <text class="col-t" x="${col.diagnostico.x}" y="14">Diagnósticos</text>
    <text class="col-t" x="${col.recomendacion.x}" y="14">Recomendaciones</text>`;
  const defs = `<defs><pattern id="trama-nodo" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="1.6" height="5" fill="#3b1d6e"/></pattern></defs>`;
  svg.innerHTML = `${defs}${titulos}<g>${huellas}</g><g>${pistas}</g><g>${vias}</g><g>${nodos}</g><g>${etiquetas}</g><g>${pulsos}</g>`;
  pintarRiel(r);

  const disparadas = (r?.reglas_aplicadas || []).map((p) => p.regla).join(", ") || "ninguna";
  svg.setAttribute("aria-label", r
    ? `Placa de inferencia. Reglas disparadas: ${disparadas}. El detalle está en el encadenamiento hacia adelante.`
    : "Placa de inferencia en espera.");
}

// Riel de LEDs bajo la placa: una luz por iteración y la de punto fijo.
function pintarRiel(r) {
  const riel = $("#riel");
  if (!r) {
    riel.innerHTML = [1, 2, 3].map((i) => `<span class="riel__led"><i></i>Iter ${i}</span>`).join("") + `<span class="riel__led"><i></i>Punto fijo</span>`;
    return;
  }
  const ultima = Math.max(0, ...r.reglas_aplicadas.map((p) => p.iteracion));
  let html = "";
  for (let it = 1; it <= r.iteraciones; it++) {
    const activa = it <= ultima;
    html += `<span class="riel__led${activa ? " on" : ""}" style="--d:${tIter(it)}ms"><i></i>Iter ${it}</span>`;
  }
  html += `<span class="riel__led fin${r.punto_fijo ? " on" : ""}" style="--d:${tIter(ultima + 1) - 300}ms"><i></i>${r.punto_fijo ? "Punto fijo" : "Límite"}</span>`;
  riel.innerHTML = html;
}

// ------------------------------------------------------------------ Encadenamiento (líneas seleccionables)
function cadenaHTML(r) {
  const reglasDe = (p) => [...r.diagnosticos, ...r.recomendaciones].find((c) => c.predicado === p)?.reglas || [];
  const verdaderos = r.hechos_iniciales.filter((h) => h.valor).map((h) => h.predicado);
  const falsos = r.hechos_iniciales.filter((h) => !h.valor).map((h) => "¬" + h.predicado);
  const sinDato = Object.keys(BASE.predicados).filter((p) => !r.hechos_iniciales.some((h) => h.predicado === p));
  let html = `<div class="it is-new" style="--d:0ms"><b>Hechos</b><div class="it__nota">${[...verdaderos, ...falsos].join(" · ") || "ninguno"}${sinDato.length ? `<br>sin dato: ${sinDato.join(", ")}` : ""}</div></div>`;
  const iteraciones = [...new Set(r.reglas_aplicadas.map((p) => p.iteracion))];
  iteraciones.forEach((it) => {
    const d = tIter(it);
    const lineas = r.reglas_aplicadas.filter((p) => p.iteracion === it).map((p) => {
      const tipo = BASE.conclusiones[p.conclusion].tipo === "diagnostico" ? "d" : "r";
      const si = p.condiciones.map((c) => `${c.valor ? "" : "¬"}${c.predicado}`).join(" ∧ ");
      let linea = `<button type="button" class="cl cl--${tipo}" data-concl="${p.conclusion}" aria-pressed="false">
        <b>${p.regla}</b><span>${si} → ${p.conclusion}</span><span class="fc">${fc2(p.certeza_paso)}</span></button>`;
      if (p.combinada) {
        linea += `<button type="button" class="cl cl--${tipo} cl--comb" data-concl="${p.conclusion}" aria-pressed="false">
          <b>⊕</b><span>${reglasDe(p.conclusion).join("+")}: ${fc2(p.certeza_previa)} + ${fc2(p.certeza_paso)}·(1 − ${fc2(p.certeza_previa)})</span><span class="fc">${fc2(p.certeza_resultante)}</span></button>`;
      }
      return linea;
    }).join("");
    html += `<div class="it is-new" style="--d:${d}ms"><b>Iter ${it}</b><div class="it__lineas">${lineas}</div></div>`;
  });
  const fin = r.reglas_aplicadas.length ? "Ninguna regla nueva se dispara: punto fijo alcanzado." : "Ninguna regla se cumple con estos hechos.";
  html += `<div class="it is-new" style="--d:${tIter((iteraciones.at(-1) || 0) + 1)}ms"><b>Iter ${r.iteraciones}</b><div class="it__nota">${fin}</div></div>`;
  return html;
}

// ------------------------------------------------------------------ Veredicto
function pintarVeredicto(r) {
  const vd = $("#veredicto");
  const ultima = Math.max(0, ...r.reglas_aplicadas.map((p) => p.iteracion));
  vd.style.setProperty("--dv", `${tIter(ultima + 1) - 200}ms`);
  vd.classList.remove("is-on", "is-none"); void vd.offsetWidth;

  if (r.sin_conclusion) {
    vd.classList.add("is-none");
    $("#vd-cuerpo").innerHTML = `
      <p class="vd__nada"><i class="led led--none" aria-hidden="true"></i>Sin conclusión</p>
      <p class="hint">Con estos datos ninguna de las ${BASE.reglas.length} reglas se cumple. No se detecta un problema dentro del alcance del sistema, o faltan datos: use <b>¿Por qué no…?</b></p>`;
    return;
  }
  vd.classList.add("is-on");
  const top = r.diagnosticos[0] || r.recomendaciones[0];
  const accion = r.diagnosticos.length ? r.recomendaciones[0] : null;
  const otras = [...r.diagnosticos, ...r.recomendaciones].filter((c) => c !== top && c !== accion);
  let html = `
    <div>
      <p class="vd__titulo"><i class="led" aria-hidden="true"></i><span>${esc(top.titulo)}</span></p>
      <p class="vd__meta">${top.predicado} · FC ${fc2(top.certeza)} · ${top.reglas.join("+")}</p>
      <div class="barra" role="img" aria-label="Certeza ${pct(top.certeza)} %"><i style="--w:${pct(top.certeza)}%"></i></div>
    </div>`;
  if (accion) {
    html += `<div class="blk">
      <p class="vd__accion"><i class="led led--r" aria-hidden="true"></i><span>${esc(accion.titulo)}</span></p>
      <p class="vd__meta">Acción principal · ${accion.predicado} · FC ${fc2(accion.certeza)} · ${accion.reglas.join(" ⊕ ")}</p></div>`;
  } else if (r.diagnosticos.length) {
    html += `<div class="blk"><p class="hint">Hay diagnóstico, pero faltan datos para recomendar una acción (por ejemplo, la calidad gráfica).</p></div>`;
  }
  if (otras.length) {
    html += `<div class="blk"><h3>Otras conclusiones</h3><ul class="otras">${otras.map((c) => `
      <li><button type="button" class="otra" data-concl="${c.predicado}" aria-pressed="false">${esc(c.titulo)}<span>${fc2(c.certeza)} ${c.reglas.join("+")}</span></button></li>`).join("")}</ul></div>`;
  }
  $("#vd-cuerpo").innerHTML = html;
}

// ------------------------------------------------------------------ ¿Por qué?
function seleccionar(pred) {
  if (!ultimoResultado) return;
  const c = [...ultimoResultado.diagnosticos, ...ultimoResultado.recomendaciones].find((x) => x.predicado === pred);
  if (!c) return;
  const lineas = [...document.querySelectorAll(`.cl[data-concl="${pred}"]`)];
  document.querySelectorAll(".cl").forEach((b) => b.setAttribute("aria-pressed", b === lineas.at(-1)));
  document.querySelectorAll(".otra").forEach((b) => b.setAttribute("aria-pressed", b.dataset.concl === pred));
  $("#porque").innerHTML = `
    <p class="why__tit">${esc(c.titulo)}</p>
    <p class="why__det">${esc(c.detalle)}</p>
    <ul class="tree">${nodoHTML(c.arbol)}</ul>`;
}

function nodoHTML(nodo) {
  const r = ultimoResultado;
  const texto = esc(notacion(nodo.predicado, nodo.valor, r.equipo));
  if (nodo.tipo === "observado") {
    const lectura = r.hechos_iniciales.find((h) => h.predicado === nodo.predicado)?.lectura;
    return `<li>${texto} <span class="tag">· observado${lectura ? `: ${esc(lectura)}` : ""}</span></li>`;
  }
  if (nodo.tipo !== "derivado") return `<li class="no">${texto} <span class="tag">· no se pudo concluir</span></li>`;
  const soportes = nodo.soportes.map((s) => `
    <li>${esc(s.regla)} <span class="tag">· FC del paso = ${s.certeza_paso}, se cumple:</span>
      <ul>${s.condiciones.map(nodoHTML).join("")}</ul></li>`).join("");
  return `<li>${texto} <span class="tag">· FC = ${nodo.certeza}</span><ul>${soportes}</ul></li>`;
}

// ------------------------------------------------------------------ ¿Por qué no?
async function porqueNo() {
  const conclusion = $("#porque-no-select").value;
  if (!conclusion || !ultimosDatos) return;
  const caja = $("#porque-no-resultado");
  try {
    const r = await api("/api/porque", { datos: ultimosDatos, conclusion });
    if (r.alcanzada) { caja.innerHTML = `<div class="whynot"><pre>${esc(r.texto)}</pre></div>`; return; }
    const estados = { cumple: "se cumple", falso: "es falso", desconocido: "dato no informado", no_concluido: "no se concluyó" };
    caja.innerHTML = `<div class="whynot">
      <p>No se concluyó <b>${esc(r.titulo)}</b>. Reglas que podrían concluirlo:</p>
      ${r.faltantes.map((f) => `
        <div class="whynot__rule"><span class="badge">${f.regla}</span> <span class="mono">${esc(f.logica)}</span>
          <ul>${f.condiciones.map((c) => `<li class="st-${c.estado}">${esc(c.texto)} · ${estados[c.estado]}</li>`).join("")}</ul>
        </div>`).join("")}
    </div>`;
  } catch (errs) {
    caja.innerHTML = `<div class="alert">${esc([].concat(errs).join(" "))}</div>`;
  }
}

// ------------------------------------------------------------------ Pestaña base de conocimiento
function pintarBase() {
  const t = BASE.tipo_predicados;
  $("#tipo-predicados").textContent = `Aridad ${t.aridad} · Dominio: ${t.dominio} · Rango: ${t.rango}`;
  $("#tabla-predicados tbody").innerHTML = Object.entries(BASE.predicados).map(([p, d]) => `
    <tr><td class="code">${p}(x)</td><td>${esc(d.descripcion)}</td><td class="code">${esc(d.umbral)}</td><td>${esc(d.categoria)}</td></tr>`).join("");

  // Agrupar por categoría (en el orden en que aparece cada una), conservando el orden de las reglas.
  const categorias = [...new Set(BASE.reglas.map((r) => r.categoria))];
  $("#tabla-reglas tbody").innerHTML = categorias.map((cat) =>
    `<tr class="cat"><td colspan="5">${esc(cat)}</td></tr>` +
    BASE.reglas.filter((r) => r.categoria === cat).map((r) => `
      <tr><td class="code"><b>${r.nombre}</b></td><td class="code">${esc(r.logica)}</td>
      <td class="code">${esc(r.si_entonces)}</td><td class="code">${r.certeza.toFixed(2)}</td><td>${esc(r.justificacion)}</td></tr>`).join("")
  ).join("");

  const estado = $("#estado-ciclos");
  estado.textContent = BASE.ciclos.length ? `${BASE.ciclos.length} ciclo(s) detectado(s)` : `${BASE.reglas.length} reglas · sin ciclos`;
  estado.className = `badge ${BASE.ciclos.length ? "badge--warn" : "badge--ok"}`;

  const diag = Object.values(BASE.conclusiones).filter((c) => c.tipo === "diagnostico").length;
  $("#kb-stats").textContent = `${BASE.reglas.length} reglas · ${Object.keys(BASE.predicados).length} predicados · `
    + `${diag} diagnósticos · ${Object.keys(BASE.conclusiones).length - diag} recomendaciones`;

  $("#tab-count-base").textContent = `· ${BASE.reglas.length} reglas`;
  $("#hud-estado").textContent = BASE.ciclos.length ? "Base con ciclos" : "Motor listo";
  document.querySelector(".led-estado").classList.add("is-on");
  $("#motor-meta").textContent = `en espera · ${BASE.reglas.length} reglas`;

  $("#caso").innerHTML = `<option value="">Elegir un caso…</option>` +
    BASE.casos.map((c) => `<option value="${c.id}">Caso ${c.id}: ${esc(c.nombre)}</option>`).join("");
}

function cargarCaso() {
  const caso = BASE?.casos.find((c) => String(c.id) === $("#caso").value);
  if (!caso) { toast("Elija primero un caso de la lista", "error"); $("#caso").focus(); return; }
  llenarFormulario(caso.datos, caso.equipo);
  casoActual = caso;
  $("#caso").value = caso.id;
  $("#caso-desc").textContent = caso.descripcion;
  diagnosticar();
}

// ------------------------------------------------------------------ Pestañas (patrón ARIA con flechas)
function cambiarPestana(nombre, enfocar = false) {
  document.querySelectorAll(".tab").forEach((t) => {
    const activa = t.dataset.tab === nombre;
    t.classList.toggle("is-active", activa);
    t.setAttribute("aria-selected", activa);
    t.tabIndex = activa ? 0 : -1;
    if (activa && enfocar) t.focus();
  });
  document.querySelectorAll(".tab-panel").forEach((p) => { p.hidden = p.id !== `tab-${nombre}`; });
}

function teclasPestanas(e) {
  const tabs = [...document.querySelectorAll(".tab")];
  const actual = tabs.indexOf(e.target);
  const destino = { ArrowRight: actual + 1, ArrowLeft: actual - 1, Home: 0, End: tabs.length - 1 }[e.key];
  if (destino === undefined) return;
  e.preventDefault();
  cambiarPestana(tabs[(destino + tabs.length) % tabs.length].dataset.tab, true);
}

// ------------------------------------------------------------------ Eventos
document.addEventListener("DOMContentLoaded", async () => {
  $("#formulario").addEventListener("submit", diagnosticar);
  $("#btn-limpiar").addEventListener("click", () => { limpiarFormulario(); toast("Formulario reiniciado"); });
  $("#btn-cargar").addEventListener("click", cargarCaso);
  $("#caso").addEventListener("change", () => {
    const caso = BASE?.casos.find((c) => String(c.id) === $("#caso").value);
    $("#caso-desc").textContent = caso ? caso.descripcion : "";
  });
  // Si el usuario edita el formulario, ya no es exactamente el caso de prueba.
  $("#formulario").addEventListener("input", (e) => { if (e.target.id !== "caso") casoActual = null; });
  $("#btn-porque-no").addEventListener("click", porqueNo);
  $("#btn-efectos").addEventListener("click", alternarEfectos);
  pintarBotonEfectos();
  CAMPOS_NUMERICOS.forEach((c) => $("#" + c).addEventListener("input", (e) => {
    actualizarMetrica(e.target);
    if (e.target.hasAttribute("aria-invalid")) marcarCampo(e.target, null);
  }));
  document.querySelectorAll(".segmented[data-pred]").forEach((g) => g.addEventListener("change", () => actualizarSegmento(g)));
  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => cambiarPestana(t.dataset.tab));
    t.addEventListener("keydown", teclasPestanas);
  });
  document.addEventListener("click", (e) => {
    const linea = e.target.closest(".cl, .otra");
    if (linea) seleccionar(linea.dataset.concl);
  });
  refrescarIndicadores();

  try {
    BASE = await api("/api/base");
    pintarBase();
    construirPlaca(null);
  } catch (errs) {
    $("#hud-estado").textContent = "Sin conexión";
    mostrarErrores([].concat(errs).map((m) => ({ campo: null, mensaje: String(m) })));
  }
});
