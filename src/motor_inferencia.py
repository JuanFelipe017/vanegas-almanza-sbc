"""
Motor de inferencia con encadenamiento hacia adelante, factores de certeza y explicación.

Ciclo de reconocimiento-acción (match -> resolución -> act):
  1. MATCH: busca las reglas cuyas condiciones se cumplen con la memoria de trabajo actual
     (instanciación universal: la x de la regla se reemplaza por el equipo consultado).
  2. RESOLUCIÓN DE CONFLICTOS: todas las reglas activadas se disparan, en el orden de la base,
     usando los hechos que había al INICIO de la iteración (así se ve el nivel de la cadena).
     Refracción: cada regla se dispara una sola vez por consulta.
  3. ACT (Modus Ponens): agrega la conclusión con FC = FC_regla × min(FC_condiciones).
     Si la conclusión ya existía (otra regla la concluyó), combina las certezas con la
     fórmula de MYCIN: FC = FC1 + FC2 · (1 − FC1).
  4. Repite hasta un PUNTO FIJO (ninguna regla nueva se activa) o hasta MAX_ITERACIONES.

Protección contra ciclos infinitos (dos niveles):
  * En ejecución: la refracción garantiza que el motor termina en, como mucho,
    len(reglas) + 1 iteraciones; además hay un tope MAX_ITERACIONES.
  * Antes de ejecutar: detectar_ciclos() revisa el grafo de dependencias de la base
    (predicado condición -> predicado conclusión) y reporta ciclos como A -> B -> A.

Autores: Juan F. Vanegas Silva · Diego Felipe Almanza Ruiz
"""

import logging
from dataclasses import dataclass, field

logger = logging.getLogger("sbc.motor")

MAX_ITERACIONES = 50


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def _reglas_de(base_conocimiento):
    """Acepta la base completa (dict con 'reglas') o directamente la lista de reglas."""
    if isinstance(base_conocimiento, dict):
        return base_conocimiento["reglas"]
    return base_conocimiento


def fmt(predicado, valor=True, equipo="x"):
    """Notación de predicados: ('FPSBajos', True) -> FPSBajos(x); ('ConexionWiFi', False) -> ¬ConexionWiFi(x)."""
    return f"{'' if valor else '¬'}{predicado}({equipo})"


def cumple(condicion, memoria):
    """¿La condición (predicado, valor_esperado) se cumple en la memoria de trabajo?

    Un hecho desconocido (ausente) NO cumple ni P(x) ni ¬P(x): la negación exige que el
    usuario haya afirmado explícitamente que el hecho es falso.
    """
    predicado, esperado = condicion
    return predicado in memoria and memoria[predicado]["valor"] == esperado


def combinar_certezas(fc_previa, fc_nueva):
    """Combinación de MYCIN para dos evidencias positivas de la misma conclusión."""
    return round(fc_previa + fc_nueva * (1 - fc_previa), 2)


# ---------------------------------------------------------------------------
# Encadenamiento hacia adelante
# ---------------------------------------------------------------------------
@dataclass
class ResultadoInferencia:
    hechos: dict                       # {predicado: {"valor", "certeza", "origen"}}
    reglas_aplicadas: list             # pasos en el orden en que se dispararon
    iteraciones: int                   # iteraciones ejecutadas (incluye la del punto fijo)
    punto_fijo: bool                   # True si terminó porque no había nada nuevo
    log: list = field(default_factory=list)


def ejecutar_inferencia(base_conocimiento, hechos_iniciales, equipo="x", max_iteraciones=MAX_ITERACIONES):
    """Versión completa del motor: devuelve un ResultadoInferencia con traza y log."""
    reglas = _reglas_de(base_conocimiento)
    log = []

    def registrar(nivel, mensaje):
        log.append(mensaje)
        logger.log(nivel, mensaje)

    memoria = {p: {"valor": bool(v), "certeza": 1.0, "origen": "observado"}
               for p, v in hechos_iniciales.items()}
    reglas_aplicadas, disparadas = [], set()
    registrar(logging.INFO, "Inicio: " + (", ".join(fmt(p, v["valor"], equipo) for p, v in memoria.items())
                                          or "sin hechos"))

    iteracion, punto_fijo = 0, False
    while iteracion < max_iteraciones:
        iteracion += 1

        # MATCH: reglas activadas con la memoria al inicio de la iteración
        agenda = []
        for regla in reglas:
            if regla["nombre"] in disparadas:
                continue                                   # refracción
            if all(cumple(c, memoria) for c in regla["condiciones"]):
                condiciones = [{"predicado": p, "valor": v, "certeza": memoria[p]["certeza"]}
                               for p, v in regla["condiciones"]]
                fc_condiciones = min(c["certeza"] for c in condiciones) if condiciones else 1.0
                agenda.append((regla, condiciones, round(regla["certeza"] * fc_condiciones, 2)))

        if not agenda:
            punto_fijo = True
            registrar(logging.INFO, f"Iteración {iteracion}: ninguna regla nueva se activa -> punto fijo.")
            break

        registrar(logging.INFO, f"Iteración {iteracion}: reglas activadas "
                                f"{', '.join(r['nombre'] for r, _, _ in agenda)}")

        # ACT: Modus Ponens sobre cada regla de la agenda
        for regla, condiciones, fc_paso in agenda:
            disparadas.add(regla["nombre"])
            conclusion = regla["conclusion"][0]
            paso = {
                "iteracion": iteracion, "regla": regla["nombre"], "descripcion": regla["descripcion"],
                "condiciones": condiciones, "conclusion": conclusion,
                "certeza_regla": regla["certeza"], "certeza_paso": fc_paso,
                "combinada": False, "certeza_previa": None,
            }
            previo = memoria.get(conclusion)
            if previo is None:
                memoria[conclusion] = {"valor": True, "certeza": fc_paso, "origen": [regla["nombre"]]}
                paso["certeza_resultante"] = fc_paso
                registrar(logging.INFO, f"  {regla['nombre']} dispara: {fmt(conclusion, True, equipo)} "
                                        f"[FC={fc_paso}]")
            elif previo["valor"] is False:
                # Una observación del usuario contradice la regla: manda la observación.
                paso["certeza_resultante"] = 0.0
                registrar(logging.WARNING, f"  {regla['nombre']} concluye {conclusion}, pero el usuario lo "
                                           f"observó como falso; se conserva el hecho observado.")
            else:
                nueva = combinar_certezas(previo["certeza"], fc_paso)
                paso.update(combinada=True, certeza_previa=previo["certeza"], certeza_resultante=nueva)
                previo["certeza"] = nueva
                if isinstance(previo["origen"], list):
                    previo["origen"].append(regla["nombre"])
                registrar(logging.INFO, f"  {regla['nombre']} refuerza {fmt(conclusion, True, equipo)}: "
                                        f"{paso['certeza_previa']} + {fc_paso}·(1 − {paso['certeza_previa']}) "
                                        f"= {nueva} (combinación MYCIN)")
            reglas_aplicadas.append(paso)

    if not punto_fijo:
        registrar(logging.WARNING, f"Se alcanzó el límite de {max_iteraciones} iteraciones sin punto fijo: "
                                   f"posible ciclo en la base de conocimiento.")
    if not reglas_aplicadas:
        registrar(logging.INFO, "No se aplicó ninguna regla: los hechos no alcanzan para un diagnóstico.")

    return ResultadoInferencia(memoria, reglas_aplicadas, iteracion, punto_fijo, log)


def encadenamiento_adelante(base_conocimiento, hechos_iniciales):
    """Aplica encadenamiento hacia adelante.

    Args:
        base_conocimiento: dict de crear_base_conocimiento() o lista de reglas.
        hechos_iniciales: {predicado: True/False} observados por el usuario (FC = 1.0).
    Returns:
        (hechos_finales, reglas_aplicadas)
    """
    resultado = ejecutar_inferencia(base_conocimiento, hechos_iniciales)
    return resultado.hechos, resultado.reglas_aplicadas


# ---------------------------------------------------------------------------
# Mecanismo de explicación
# ---------------------------------------------------------------------------
def explicar_razonamiento(reglas_aplicadas, equipo="x"):
    """Genera la explicación legible de toda la cadena de razonamiento (texto)."""
    if not reglas_aplicadas:
        return "No se aplicó ninguna regla: los hechos ingresados no alcanzan para un diagnóstico."
    lineas = []
    for paso in reglas_aplicadas:
        si = " ∧ ".join(fmt(c["predicado"], c["valor"], equipo) for c in paso["condiciones"])
        minimos = ", ".join(str(c["certeza"]) for c in paso["condiciones"])
        linea = (f"Iteración {paso['iteracion']} | {paso['regla']}: {si} → "
                 f"{fmt(paso['conclusion'], True, equipo)}  [FC = {paso['certeza_regla']} × "
                 f"min({minimos}) = {paso['certeza_paso']}]")
        if paso["combinada"]:
            linea += (f"  ⇒ combinada con la evidencia previa: {paso['certeza_previa']} + "
                      f"{paso['certeza_paso']}·(1 − {paso['certeza_previa']}) = {paso['certeza_resultante']}")
        lineas.append(linea)
    return "\n".join(lineas)


def arbol_porque(conclusion, hechos_iniciales, reglas_aplicadas, valor=True, _visitados=None):
    """Árbol de justificación (estructura) de por qué un hecho es verdadero/falso.

    Cada nodo: {"predicado", "valor", "certeza", "tipo": observado|derivado|no_concluido,
                "soportes": [{"regla", "certeza_paso", "condiciones": [nodos]}]}
    """
    visitados = set() if _visitados is None else _visitados
    if conclusion in hechos_iniciales:
        observado = bool(hechos_iniciales[conclusion])
        return {"predicado": conclusion, "valor": observado, "certeza": 1.0,
                "tipo": "observado" if observado == valor else "contradice", "soportes": []}

    pasos = [p for p in reglas_aplicadas if p["conclusion"] == conclusion]
    if not pasos or conclusion in visitados:
        return {"predicado": conclusion, "valor": valor, "certeza": 0.0, "tipo": "no_concluido", "soportes": []}

    visitados = visitados | {conclusion}
    soportes = [{"regla": p["regla"], "certeza_paso": p["certeza_paso"],
                 "condiciones": [arbol_porque(c["predicado"], hechos_iniciales, reglas_aplicadas,
                                              c["valor"], visitados) for c in p["condiciones"]]}
                for p in pasos]
    return {"predicado": conclusion, "valor": True, "certeza": pasos[-1]["certeza_resultante"],
            "tipo": "derivado", "soportes": soportes}


def _texto_arbol(nodo, equipo, nivel):
    sangria = "    " * nivel
    nombre = fmt(nodo["predicado"], nodo["valor"], equipo)
    if nodo["tipo"] == "observado":
        return [f"{sangria}• {nombre} es un hecho observado (FC = 1.0)."]
    if nodo["tipo"] == "no_concluido":
        return [f"{sangria}✗ {nombre} no se pudo concluir con los hechos disponibles."]
    if nodo["tipo"] == "contradice":
        return [f"{sangria}✗ {nombre} contradice lo observado por el usuario."]
    reglas = " y ".join(s["regla"] for s in nodo["soportes"])
    lineas = [f"{sangria}• {nombre} [FC = {nodo['certeza']}] se concluyó con {reglas}, porque se cumplen:"]
    for soporte in nodo["soportes"]:
        if len(nodo["soportes"]) > 1:
            lineas.append(f"{sangria}    ({soporte['regla']}, FC del paso = {soporte['certeza_paso']})")
        for hijo in soporte["condiciones"]:
            lineas.extend(_texto_arbol(hijo, equipo, nivel + 1))
    return lineas


def porque(conclusion, hechos_iniciales, reglas_aplicadas, equipo="x"):
    """Explica por qué se llegó a una conclusión específica.

    Returns: cadena de razonamiento como texto, desde la conclusión hasta los hechos observados.
    """
    return "\n".join(_texto_arbol(arbol_porque(conclusion, hechos_iniciales, reglas_aplicadas), equipo, 0))


def porque_no(conclusion, hechos_finales, base_conocimiento, equipo="x"):
    """Explica por qué NO se concluyó algo: qué condiciones faltaron en cada regla que lo concluye.

    Returns: lista de {"regla", "si_entonces", "condiciones": [{"predicado","valor","estado"}]}
             donde estado es 'cumple', 'falso', 'desconocido' (dato observable no informado)
             o 'no_concluido' (predicado derivado que el motor no pudo concluir).
    """
    reglas = _reglas_de(base_conocimiento)
    derivados = {r["conclusion"][0] for r in reglas}
    analisis = []
    for regla in reglas:
        if regla["conclusion"][0] != conclusion:
            continue
        condiciones = []
        for predicado, esperado in regla["condiciones"]:
            if predicado not in hechos_finales:
                estado = "no_concluido" if predicado in derivados else "desconocido"
            elif hechos_finales[predicado]["valor"] == esperado:
                estado = "cumple"
            else:
                estado = "falso"
            condiciones.append({"predicado": predicado, "valor": esperado, "estado": estado,
                                "texto": fmt(predicado, esperado, equipo)})
        analisis.append({"regla": regla["nombre"], "logica": regla["logica"], "condiciones": condiciones})
    return analisis


# ---------------------------------------------------------------------------
# Verificación estática de la base: ciclos
# ---------------------------------------------------------------------------
def detectar_ciclos(base_conocimiento):
    """Busca ciclos en el grafo de dependencias de la base (DFS con colores).

    Returns: lista de ciclos; cada ciclo es una lista de predicados [A, B, ..., A].
    """
    grafo = {}
    for regla in _reglas_de(base_conocimiento):
        destino = regla["conclusion"][0]
        for predicado, _ in regla["condiciones"]:
            grafo.setdefault(predicado, set()).add(destino)

    BLANCO, GRIS, NEGRO = 0, 1, 2
    color, ciclos, camino = {}, [], []

    def visitar(nodo):
        color[nodo] = GRIS
        camino.append(nodo)
        for vecino in sorted(grafo.get(nodo, ())):
            if color.get(vecino, BLANCO) == GRIS:
                ciclos.append(camino[camino.index(vecino):] + [vecino])
            elif color.get(vecino, BLANCO) == BLANCO:
                visitar(vecino)
        camino.pop()
        color[nodo] = NEGRO

    for nodo in sorted(grafo):
        if color.get(nodo, BLANCO) == BLANCO:
            visitar(nodo)
    return ciclos


# ---------------------------------------------------------------------------
# Consulta completa (lo que usa la interfaz web y el notebook)
# ---------------------------------------------------------------------------
def diagnosticar(base_conocimiento, hechos_iniciales, equipo="x", lecturas=None):
    """Ejecuta el motor y arma una respuesta lista para mostrar (serializable a JSON)."""
    conclusiones_info = base_conocimiento["conclusiones"]
    resultado = ejecutar_inferencia(base_conocimiento, hechos_iniciales, equipo)

    derivados = [(p, h) for p, h in resultado.hechos.items() if h["origen"] != "observado" and h["valor"]]
    conclusiones = []
    for predicado, hecho in derivados:
        info = conclusiones_info.get(predicado, {"tipo": "diagnostico", "titulo": predicado, "detalle": ""})
        conclusiones.append({
            "predicado": predicado, "notacion": fmt(predicado, True, equipo),
            "tipo": info["tipo"], "titulo": info["titulo"], "detalle": info["detalle"],
            "certeza": hecho["certeza"], "reglas": list(hecho["origen"]),
            "porque": porque(predicado, hechos_iniciales, resultado.reglas_aplicadas, equipo),
            "arbol": arbol_porque(predicado, hechos_iniciales, resultado.reglas_aplicadas),
        })
    conclusiones.sort(key=lambda c: -c["certeza"])

    no_alcanzadas = [p for p in conclusiones_info if p not in resultado.hechos]
    return {
        "equipo": equipo,
        "hechos_iniciales": [{"predicado": p, "valor": v, "notacion": fmt(p, v, equipo),
                              "lectura": (lecturas or {}).get(p, "")}
                             for p, v in hechos_iniciales.items()],
        "diagnosticos": [c for c in conclusiones if c["tipo"] == "diagnostico"],
        "recomendaciones": [c for c in conclusiones if c["tipo"] == "recomendacion"],
        "reglas_aplicadas": resultado.reglas_aplicadas,
        "explicacion": explicar_razonamiento(resultado.reglas_aplicadas, equipo),
        "iteraciones": resultado.iteraciones,
        "punto_fijo": resultado.punto_fijo,
        "sin_conclusion": not resultado.reglas_aplicadas,
        "no_alcanzadas": no_alcanzadas,
        "log": resultado.log,
    }
