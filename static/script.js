// Interfaz del sistema experto: lee el formulario, llama a la API Flask y muestra los resultados.
// Toda la lógica de inferencia vive en el backend (src/motor_inferencia.py); aquí solo se dibuja.
"use strict";

const $ = (sel) => document.querySelector(sel);
const CAMPOS_NUMERICOS = ["fps", "uso_gpu", "uso_cpu", "temperatura", "uso_ram", "ping"];
const CAMPOS_RADIO = ["calidad_graficos", "fps_caen", "tirones", "almacenamiento", "conexion"];
// data-motion lo fija el <head> según prefers-reduced-motion o la elección guardada del usuario.
const reducirMovimiento = () => document.documentElement.dataset.motion === "off";

function pintarBotonEfectos() {
  const on = !reducirMovimiento();
  $("#btn-efectos").setAttribute("aria-pressed", on);
  $("#efectos-estado").textContent = on ? "ON" : "OFF";
}

function alternarEfectos() {
  const nuevo = reducirMovimiento() ? "on" : "off";
  document.documentElement.dataset.motion = nuevo;
  try { localStorage.setItem("sbc-motion", nuevo); } catch {}
  pintarBotonEfectos();
  toast(nuevo === "on" ? "Efectos visuales activados" : "Efectos visuales desactivados");
}
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

let BASE = null;          // respuesta de /api/base
let ultimosDatos = null;  // formulario de la última consulta (para "¿Por qué no?")

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (fc) => Math.round(fc * 100);
const notacion = (pred, valor, equipo) => `${valor ? "" : "¬"}${pred}(${equipo})`;

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

function validarFormulario(datos) {
  const errores = [];
  CAMPOS_NUMERICOS.forEach((c) => {
    const input = $("#" + c);
    input.classList.remove("is-invalid");
    if (datos[c] === "") return;
    const v = Number(datos[c]);
    const min = Number(input.min), max = Number(input.max);
    if (!Number.isFinite(v) || v < min || v > max) {
      void input.offsetWidth;                       // reinicia la animación de "sacudir"
      input.classList.add("is-invalid");
      const etiqueta = document.querySelector(`label[for="${c}"]`).textContent;
      errores.push(`${etiqueta}: debe ser un número entre ${min} y ${max}.`);
    }
  });
  const algunDato = CAMPOS_NUMERICOS.some((c) => datos[c] !== "") || CAMPOS_RADIO.some((c) => datos[c] !== "");
  if (!algunDato && !errores.length) errores.push("Ingrese al menos una lectura o síntoma para poder diagnosticar.");
  return errores;
}

// Vista previa en vivo del predicado que generará cada campo (solo visual: decide entrada.py).
function actualizarChip(chip, valor) {
  const antes = chip.textContent;
  chip.classList.remove("is-true", "is-false");
  if (valor === null) chip.textContent = `${chip.dataset.pred} ?`;
  else {
    chip.textContent = `${chip.dataset.pred} = ${valor ? "V" : "F"}`;
    chip.classList.add(valor ? "is-true" : "is-false");
  }
  if (antes !== chip.textContent) {
    chip.classList.remove("is-pop"); void chip.offsetWidth; chip.classList.add("is-pop");
  }
}

function actualizarMedidor(campo) {
  const caja = campo.closest(".metric");
  const { op, umbral, max, pred } = caja.dataset;
  const chip = caja.querySelector(".pred");
  chip.dataset.pred = pred;
  const v = campo.value.trim() === "" ? NaN : Number(campo.value);
  const u = Number(umbral), m = Number(max);
  caja.style.setProperty("--u", `${Math.min(100, (u / m) * 100)}%`);
  const fueraDeRango = v < Number(campo.min) || v > Number(campo.max);
  if (!Number.isFinite(v) || fueraDeRango) {      // vacío o inválido: el servidor no lo usaría
    caja.style.setProperty("--p", 0);
    caja.classList.remove("is-true");
    actualizarChip(chip, null);
    return;
  }
  const verdadero = op === "<" ? v < u : op === ">=" ? v >= u : v > u;
  caja.style.setProperty("--p", Math.max(0, Math.min(1, v / m)));
  caja.classList.toggle("is-true", verdadero);
  actualizarChip(chip, verdadero);
}

function actualizarSegmento(grupo) {
  const chip = grupo.closest(".field").querySelector(".pred");
  chip.dataset.pred = grupo.dataset.pred;
  const valor = grupo.querySelector("input:checked")?.value || "";
  actualizarChip(chip, valor === "" ? null : grupo.dataset.true.split(",").includes(valor));
}

function refrescarIndicadores() {
  CAMPOS_NUMERICOS.forEach((c) => actualizarMedidor($("#" + c)));
  document.querySelectorAll(".segmented[data-pred]").forEach(actualizarSegmento);
}

function llenarFormulario(datos, equipo) {
  limpiarFormulario(false);
  $("#equipo").value = equipo || "";
  CAMPOS_NUMERICOS.forEach((c) => { if (datos[c] !== undefined) $("#" + c).value = datos[c]; });
  CAMPOS_RADIO.forEach((c) => {
    const valor = datos[c] ?? "";
    const radio = document.querySelector(`input[name="${c}"][value="${valor}"]`);
    if (radio) radio.checked = true;
  });
  refrescarIndicadores();
}

function limpiarFormulario(tambienResultados = true) {
  $("#formulario").reset();
  document.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
  mostrarErrores([]);
  refrescarIndicadores();
  if (tambienResultados) {
    $("#caso").value = "";
    $("#caso-desc").textContent = "";
    $("#contenido").hidden = true;
    $("#escaneo").hidden = true;
    $("#vacio").hidden = false;
    ultimosDatos = null;
  }
}

function mostrarErrores(errores) {
  const caja = $("#errores");
  if (!errores.length) { caja.hidden = true; caja.innerHTML = ""; return; }
  caja.innerHTML = errores.length === 1 ? esc(errores[0])
    : `Revise los datos:<ul>${errores.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`;
  caja.hidden = false;
}

function toast(mensaje, tipo = "ok") {
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
  if (errores.length) { toast("Hay datos por corregir", "error"); return; }

  cargando(true);
  $("#vacio").hidden = true;
  $("#contenido").hidden = true;
  $("#escaneo").hidden = false;
  try {
    // La animación del motor dura lo mínimo para verse; con movimiento reducido no se espera.
    const [r] = await Promise.all([api("/api/diagnosticar", datos), esperar(reducirMovimiento() ? 0 : 950)]);
    ultimosDatos = datos;
    $("#escaneo").hidden = true;
    mostrarResultado(r);
    const n = r.diagnosticos.length + r.recomendaciones.length;
    toast(r.sin_conclusion ? "Sin conclusión: faltan datos o no hay problema"
      : `${n} conclusiones en ${r.iteraciones} iteraciones`, r.sin_conclusion ? "error" : "ok");
  } catch (errs) {
    $("#escaneo").hidden = true;
    $("#vacio").hidden = false;
    mostrarErrores(Array.isArray(errs) ? errs : [String(errs)]);
    toast("No se pudo diagnosticar", "error");
  } finally {
    cargando(false);
  }
}

function contar(el, hasta, duracion = 700) {
  if (reducirMovimiento() || hasta === 0) { el.textContent = hasta; return; }
  const inicio = performance.now();
  const paso = (t) => {
    const k = Math.min(1, (t - inicio) / duracion);
    el.textContent = Math.round(hasta * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

function mostrarResultado(r) {
  $("#contenido").hidden = false;

  $("#resumen").innerHTML = `
    <div class="stat stat--diag reveal" style="--i:0"><span class="stat__value" data-n="${r.diagnosticos.length}">0</span><span class="stat__label">Diagnósticos</span></div>
    <div class="stat stat--rec reveal" style="--i:1"><span class="stat__value" data-n="${r.recomendaciones.length}">0</span><span class="stat__label">Recomendaciones</span></div>
    <div class="stat stat--rule reveal" style="--i:2"><span class="stat__value" data-n="${r.reglas_aplicadas.length}">0</span><span class="stat__label">Reglas aplicadas</span></div>
    <div class="stat reveal" style="--i:3"><span class="stat__value" data-n="${r.iteraciones}">0</span><span class="stat__label">${r.punto_fijo ? "Iter. · punto fijo" : "Iter. · límite"}</span></div>
    <span class="summary__equipo reveal" style="--i:4">x = ${esc(r.equipo)}</span>`;
  document.querySelectorAll("#resumen [data-n]").forEach((el) => contar(el, Number(el.dataset.n)));

  $("#sin-conclusion").hidden = !r.sin_conclusion;
  $("#bloque-diagnosticos").hidden = r.sin_conclusion;
  $("#bloque-recomendaciones").hidden = r.sin_conclusion;
  $("#diagnosticos").innerHTML = tarjetas(r.diagnosticos, "diag", r.equipo, "Ningún diagnóstico.");
  $("#recomendaciones").innerHTML = tarjetas(r.recomendaciones, "rec", r.equipo,
    "Hay diagnóstico, pero faltan datos para recomendar una acción (por ejemplo, la calidad gráfica).");
  animarAnillos();

  pintarMapa(r);

  $("#hechos").innerHTML = r.hechos_iniciales.map((h, i) => `
    <span class="chip reveal ${h.valor ? "" : "chip--false"}" style="--i:${i}" title="${esc(BASE?.predicados[h.predicado]?.descripcion)}">
      <span class="code">${esc(h.notacion)}</span><small>${esc(h.lectura)}</small>
    </span>`).join("");

  const lista = $("#cadena");
  lista.innerHTML = cadena(r);
  lista.classList.remove("is-drawn"); void lista.offsetWidth; lista.classList.add("is-drawn");

  $("#log").innerHTML = r.log.map((l, i) => `<span style="--i:${i}">${esc(l)}</span>`).join("");

  const select = $("#porque-no-select");
  select.innerHTML = r.no_alcanzadas.length
    ? r.no_alcanzadas.map((p) => `<option value="${p}">${esc(p)} — ${esc(BASE.conclusiones[p].titulo)}</option>`).join("")
    : `<option value="">Se alcanzaron todas las conclusiones</option>`;
  $("#btn-porque-no").disabled = !r.no_alcanzadas.length;
  $("#porque-no-resultado").innerHTML = "";
}

function tarjetas(lista, tipo, equipo, vacio) {
  if (!lista.length) return `<p class="empty-list">${esc(vacio)}</p>`;
  return lista.map((c, i) => `
    <article class="concl reveal ${tipo === "rec" ? "concl--rec" : ""}" style="--i:${i + 2}">
      <div class="concl__head">
        <div>
          <div class="concl__title">${tipo === "rec" ? `<span class="concl__num">${String(i + 1).padStart(2, "0")}</span>` : ""}${esc(c.titulo)}</div>
          <p class="concl__detail">${esc(c.detalle)}</p>
        </div>
        <div class="ring">
          <progress class="ring__p" max="100" value="0" data-v="${pct(c.certeza)}" aria-label="Certeza ${pct(c.certeza)} %"></progress>
          <span class="ring__txt" aria-hidden="true">${pct(c.certeza)}<small>%</small></span>
        </div>
      </div>
      <div class="concl__meta">
        <span class="code">${esc(c.notacion)}</span>
        ${c.reglas.map((rg) => `<span class="badge">${rg}</span>`).join("")}
        ${c.reglas.length > 1 ? `<span class="badge badge--comb">evidencia combinada</span>` : ""}
        <button type="button" class="btn btn--link" data-why aria-expanded="false">
          <svg class="ico ico--sm" aria-hidden="true"><use href="#i-tree"/></svg><span>¿Por qué?</span></button>
      </div>
      <div class="why" hidden><div class="why__inner">${arbolHTML(c.arbol, equipo)}</div></div>
    </article>`).join("");
}

// Anillos de certeza: se insertan en 0 y en el siguiente cuadro suben a su valor (transición de --value).
function animarAnillos() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll(".ring__p[data-v]").forEach((p) => {
      p.value = Number(p.dataset.v);
      p.style.setProperty("--value", p.dataset.v);
    });
  }));
}

// Árbol "¿Por qué?": conclusión -> regla(s) que la soportan -> condiciones (recursivo).
const arbolHTML = (nodo, equipo) => `<ul class="tree">${nodoHTML(nodo, equipo)}</ul>`;

function nodoHTML(nodo, equipo) {
  const texto = `<span class="code">${esc(notacion(nodo.predicado, nodo.valor, equipo))}</span>`;
  if (nodo.tipo === "observado") return `<li class="node-obs">${texto} — hecho observado (FC = 1.0)</li>`;
  if (nodo.tipo !== "derivado") return `<li class="node-no">${texto} — no se pudo concluir</li>`;
  const soportes = nodo.soportes.map((s) => `
      <li class="node-der"><span class="code">${esc(s.regla)}</span><span class="rule-tag">FC del paso = ${s.certeza_paso}</span>
        <ul>${s.condiciones.map((h) => nodoHTML(h, equipo)).join("")}</ul></li>`).join("");
  return `<li class="node-der">${texto}<span class="rule-tag">FC = ${nodo.certeza} · se concluyó porque se cumplen:</span>
      <ul>${soportes}</ul></li>`;
}

function alternarPorque(btn) {
  const caja = btn.closest(".concl").querySelector(".why");
  const abrir = btn.getAttribute("aria-expanded") !== "true";
  btn.setAttribute("aria-expanded", abrir);
  btn.querySelector("span").textContent = abrir ? "Ocultar explicación" : "¿Por qué?";
  if (abrir) {
    caja.hidden = false;
    void caja.offsetWidth;                     // aplica block-size: 0 antes de animar hasta auto
    caja.classList.add("is-open");
  } else {
    caja.classList.remove("is-open");
    if (reducirMovimiento()) { caja.hidden = true; return; }
    // Al terminar de cerrarse se oculta (sale del árbol de accesibilidad). Chrome puede reportar
    // "height" en lugar de "block-size"; el temporizador cubre navegadores sin la transición.
    const ocultar = () => { if (!caja.classList.contains("is-open")) caja.hidden = true; };
    caja.addEventListener("transitionend", function fin(e) {
      if (e.propertyName !== "block-size" && e.propertyName !== "height") return;
      caja.removeEventListener("transitionend", fin);
      ocultar();
    });
    setTimeout(ocultar, 600);
  }
}

function cadena(r) {
  if (!r.reglas_aplicadas.length) return `<li class="chain__end">No se aplicó ninguna regla: los hechos no alcanzan para un diagnóstico.</li>`;
  let html = "", iter = 0;
  const nombres = { 1: "diagnósticos", 2: "recomendaciones" };
  r.reglas_aplicadas.forEach((p, i) => {
    if (p.iteracion !== iter) {
      iter = p.iteracion;
      html += `<li class="chain__iter reveal" style="--i:${i}">Iteración ${iter}${nombres[iter] ? ` · ${nombres[iter]}` : ""}</li>`;
    }
    const si = p.condiciones.map((c) => notacion(c.predicado, c.valor, r.equipo)).join(" ∧ ");
    const paso = `${p.certeza_regla} × min(${p.condiciones.map((c) => c.certeza).join(", ")}) = `;
    const fc = p.combinada
      ? `${paso}${p.certeza_paso}<br>${p.certeza_previa} + ${p.certeza_paso}·(1 − ${p.certeza_previa}) = <strong>${p.certeza_resultante}</strong>`
      : `FC = ${paso}<strong>${p.certeza_paso}</strong>`;
    html += `<li class="chain__step reveal" style="--i:${i + 1}">
        <span class="chain__rule">${p.regla}</span>
        <div><div class="code">${esc(si)} → ${esc(notacion(p.conclusion, true, r.equipo))}</div>
          <div class="chain__desc">${esc(p.descripcion)}${p.combinada ? " · <em>combinación MYCIN</em>" : ""}</div></div>
        <span class="chain__fc">${fc}</span>
      </li>`;
  });
  html += `<li class="chain__end reveal" style="--i:${r.reglas_aplicadas.length + 1}">Iteración ${r.iteraciones}: ninguna regla nueva se activa → punto fijo, el motor se detiene.</li>`;
  return html;
}

// ------------------------------------------------------------------ Mapa de inferencia (SVG)
const MAPA = { nodos: {}, ancho: 940, alto: 0 };
const SVG_NS = "http://www.w3.org/2000/svg";

function construirMapa() {
  const svg = $("#mapa");
  const columnas = [
    { titulo: "Hechos observables", x: 4, nodos: Object.keys(BASE.predicados) },
    { titulo: "Diagnósticos", x: 364, nodos: Object.keys(BASE.conclusiones).filter((p) => BASE.conclusiones[p].tipo === "diagnostico") },
    { titulo: "Recomendaciones", x: 724, nodos: Object.keys(BASE.conclusiones).filter((p) => BASE.conclusiones[p].tipo === "recomendacion") },
  ];
  const W = 212, H = 28, GAP = 36, TOP = 42;
  const filas = Math.max(...columnas.map((c) => c.nodos.length));
  MAPA.alto = TOP + filas * GAP + 4;
  svg.setAttribute("viewBox", `0 0 ${MAPA.ancho} ${MAPA.alto}`);

  let aristas = "", nodos = "", titulos = "";
  columnas.forEach((col) => {
    const desplaz = ((filas - col.nodos.length) * GAP) / 2;
    titulos += `<text class="col-t" x="${col.x + 4}" y="20">${col.titulo}</text>`;
    col.nodos.forEach((p, i) => {
      const y = TOP + desplaz + i * GAP;
      MAPA.nodos[p] = { x: col.x, y, w: W, h: H };
      nodos += `<g class="node" data-p="${p}"><rect x="${col.x}" y="${y}" width="${W}" height="${H}" rx="7"/>
        <text x="${col.x + 10}" y="${y + 19}">${p}</text><text class="val" x="${col.x + W - 10}" y="${y + 19}" text-anchor="end"></text></g>`;
    });
  });

  // Una arista por cada condición de cada regla (predicado condición -> conclusión).
  BASE.reglas.forEach((r) => {
    r.condiciones.forEach(([p, valor]) => {
      const a = MAPA.nodos[p], b = MAPA.nodos[r.conclusion];
      if (!a || !b) return;
      const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, dx = (x2 - x1) * 0.5;
      const d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
      const tipo = BASE.conclusiones[r.conclusion].tipo === "diagnostico" ? "d" : "r";
      aristas += `<path class="edge${valor ? "" : " neg"}" d="${d}"/>
        <path class="edge-on ${tipo}" data-regla="${r.nombre}" d="${d}" pathLength="1"/>`;
    });
  });
  svg.innerHTML = `${titulos}<g>${aristas}</g><g>${nodos}</g>`;
}

function pintarMapa(r) {
  const svg = $("#mapa");
  if (!svg.childElementCount) return;
  svg.querySelectorAll(".node").forEach((n) => { n.setAttribute("class", "node"); n.querySelector(".val").textContent = ""; });
  svg.querySelectorAll(".edge-on").forEach((e) => e.classList.remove("is-on"));

  r.hechos_iniciales.forEach((h) => {
    const n = svg.querySelector(`.node[data-p="${h.predicado}"]`);
    if (!n) return;
    n.classList.add(h.valor ? "v" : "f");
    n.querySelector(".val").textContent = h.valor ? "V" : "F";
  });

  const PASO = 520;   // ms entre niveles de la cadena
  void svg.getBoundingClientRect();
  r.reglas_aplicadas.forEach((p) => {
    const retraso = `${(p.iteracion - 1) * PASO}ms`;
    svg.querySelectorAll(`.edge-on[data-regla="${p.regla}"]`).forEach((e) => {
      e.style.setProperty("--d", retraso);
      e.classList.add("is-on");
    });
    const n = svg.querySelector(`.node[data-p="${p.conclusion}"]`);
    if (n) {
      n.style.setProperty("--d", `${(p.iteracion - 1) * PASO + 420}ms`);
      n.classList.add(BASE.conclusiones[p.conclusion].tipo === "diagnostico" ? "on-d" : "on-r");
      n.querySelector(".val").textContent = `${pct(p.certeza_resultante)}%`;
    }
  });
  const fired = r.reglas_aplicadas.map((p) => p.regla).join(", ") || "ninguna";
  svg.setAttribute("aria-label", `Mapa de inferencia. Reglas disparadas: ${fired}. El detalle está en la explicación del razonamiento.`);
}

// ------------------------------------------------------------------ ¿Por qué no?
async function porqueNo() {
  const conclusion = $("#porque-no-select").value;
  if (!conclusion || !ultimosDatos) return;
  const caja = $("#porque-no-resultado");
  try {
    const r = await api("/api/porque", { datos: ultimosDatos, conclusion });
    if (r.alcanzada) { caja.innerHTML = `<pre class="why__inner">${esc(r.texto)}</pre>`; return; }
    const estados = { cumple: "✓ se cumple", falso: "✗ es falso", desconocido: "? dato no informado", no_concluido: "✗ no se concluyó" };
    caja.innerHTML = `<div class="whynot">
      <p class="small">No se concluyó <strong>${esc(r.titulo)}</strong>. Reglas que podrían concluirlo:</p>
      ${r.faltantes.map((f, i) => `
        <div class="whynot__rule reveal" style="--i:${i}"><span class="badge">${f.regla}</span> <span class="code">${esc(f.logica)}</span>
          <ul>${f.condiciones.map((c) => `<li class="st-${c.estado}"><span class="code">${esc(c.texto)}</span> — ${estados[c.estado]}</li>`).join("")}</ul>
        </div>`).join("")}
    </div>`;
  } catch (errs) {
    caja.innerHTML = `<div class="alert alert--error">${esc([].concat(errs).join(" "))}</div>`;
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
      <tr><td><span class="badge">${r.nombre}</span></td><td class="code">${esc(r.logica)}</td>
      <td class="code">${esc(r.si_entonces)}</td><td>${r.certeza.toFixed(2)}</td><td>${esc(r.justificacion)}</td></tr>`).join("")
  ).join("");

  const estado = $("#estado-ciclos");
  estado.textContent = BASE.ciclos.length ? `⚠ ${BASE.ciclos.length} ciclo(s) detectado(s)` : `✓ ${BASE.reglas.length} reglas · sin ciclos`;
  estado.className = `badge ${BASE.ciclos.length ? "badge--warn" : "badge--ok"}`;

  const diag = Object.values(BASE.conclusiones).filter((c) => c.tipo === "diagnostico").length;
  $("#kb-stats").innerHTML = [
    ["stat--rule", BASE.reglas.length, "Reglas"], ["", Object.keys(BASE.predicados).length, "Predicados observables"],
    ["stat--diag", diag, "Diagnósticos posibles"], ["stat--rec", Object.keys(BASE.conclusiones).length - diag, "Recomendaciones posibles"],
  ].map(([cls, n, label], i) => `<div class="stat ${cls} reveal" style="--i:${i}"><span class="stat__value">${n}</span><span class="stat__label">${label}</span></div>`).join("");

  $("#hud-reglas").textContent = BASE.reglas.length;
  $("#hud-pred").textContent = Object.keys(BASE.predicados).length;
  $("#hud-estado").textContent = BASE.ciclos.length ? "Base con ciclos" : "Motor listo";
  document.querySelector(".led").classList.add("is-on");

  $("#caso").innerHTML = `<option value="">— Elegir un caso —</option>` +
    BASE.casos.map((c) => `<option value="${c.id}">Caso ${c.id}: ${esc(c.nombre)}</option>`).join("");
}

function cargarCaso() {
  const caso = BASE?.casos.find((c) => String(c.id) === $("#caso").value);
  if (!caso) { toast("Elija primero un caso de la lista", "error"); return; }
  llenarFormulario(caso.datos, caso.equipo);
  $("#caso").value = caso.id;
  $("#caso-desc").textContent = caso.descripcion;
  diagnosticar();
}

// Cambio de pestaña con View Transitions: el indicador se desliza y el contenido hace fundido.
function cambiarPestana(nombre) {
  const actualizar = () => {
    document.querySelectorAll(".tab").forEach((t) => {
      const activa = t.dataset.tab === nombre;
      t.classList.toggle("is-active", activa);
      t.setAttribute("aria-selected", activa);
      if (activa) t.append(document.querySelector(".tab__ind"));
    });
    document.querySelectorAll(".tab-panel").forEach((p) => { p.hidden = p.id !== `tab-${nombre}`; });
  };
  // El foco se queda en la pestaña pulsada (patrón ARIA de pestañas): nunca queda en un elemento oculto.
  if (!document.startViewTransition || reducirMovimiento()) { actualizar(); return; }
  document.startViewTransition(actualizar);
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
  $("#btn-porque-no").addEventListener("click", porqueNo);
  $("#btn-efectos").addEventListener("click", alternarEfectos);
  pintarBotonEfectos();
  CAMPOS_NUMERICOS.forEach((c) => $("#" + c).addEventListener("input", (e) => actualizarMedidor(e.target)));
  document.querySelectorAll(".segmented[data-pred]").forEach((g) => g.addEventListener("change", () => actualizarSegmento(g)));
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => cambiarPestana(t.dataset.tab)));
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-why]");
    if (btn) alternarPorque(btn);
  });
  // Foco de luz que sigue al puntero sobre las tarjetas (solo actualiza dos variables CSS).
  document.addEventListener("pointermove", (e) => {
    const card = e.target.closest?.(".card");
    if (!card) return;
    const caja = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - caja.left}px`);
    card.style.setProperty("--my", `${e.clientY - caja.top}px`);
  }, { passive: true });
  refrescarIndicadores();

  try {
    BASE = await api("/api/base");
    pintarBase();
    construirMapa();
  } catch (errs) {
    $("#hud-estado").textContent = "Sin conexión";
    mostrarErrores([].concat(errs));
  }
});
