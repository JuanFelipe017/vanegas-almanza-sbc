"""
Aplicación web (Flask) del sistema experto de diagnóstico de rendimiento en videojuegos.

Rutas:
    GET  /                 -> interfaz web (templates/index.html)
    GET  /api/base         -> base de conocimiento (predicados, reglas, casos precargados)
    POST /api/diagnosticar -> recibe el formulario en JSON y devuelve el diagnóstico completo
    POST /api/porque       -> explica por qué se concluyó (o por qué NO) un predicado

La interfaz nunca reimplementa la lógica del SBC: solo envía los datos del formulario y
muestra lo que devuelve el motor de inferencia.

Ejecutar desde la carpeta del proyecto:   python src/app.py   ->  http://127.0.0.1:5000
Autores: Juan F. Vanegas Silva · Diego Felipe Almanza Ruiz
"""

import logging
import sys
from pathlib import Path

from flask import Flask, jsonify, render_template, request

sys.path.insert(0, str(Path(__file__).resolve().parent))

from base_conocimiento import crear_base_conocimiento, si_entonces, TIPO_PREDICADOS  # noqa: E402
from casos import CASOS  # noqa: E402
from entrada import ErrorEntrada, hechos_desde_formulario, nombre_equipo  # noqa: E402
from motor_inferencia import (detectar_ciclos, diagnosticar, ejecutar_inferencia,  # noqa: E402
                              porque, arbol_porque, porque_no)

RAIZ = Path(__file__).resolve().parent.parent
app = Flask(__name__, template_folder=str(RAIZ / "templates"), static_folder=str(RAIZ / "static"))
app.json.ensure_ascii = False
app.json.sort_keys = False      # conservar el orden de la base de conocimiento

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s", datefmt="%H:%M:%S")
BASE = crear_base_conocimiento()

ciclos = detectar_ciclos(BASE)
if ciclos:
    app.logger.warning("La base de conocimiento tiene ciclos: %s", ciclos)


def error(mensajes, codigo=400):
    return jsonify({"ok": False, "errores": mensajes}), codigo


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/base")
def api_base():
    reglas = [{"nombre": r["nombre"], "categoria": r["categoria"], "logica": r["logica"],
               "si_entonces": si_entonces(r), "certeza": r["certeza"], "descripcion": r["descripcion"],
               "justificacion": r["justificacion"],
               # estructura cruda: la usa el "mapa de inferencia" de la interfaz para dibujar las aristas
               "condiciones": r["condiciones"], "conclusion": r["conclusion"][0]} for r in BASE["reglas"]]
    return jsonify({
        "predicados": BASE["predicados"], "tipo_predicados": TIPO_PREDICADOS,
        "conclusiones": BASE["conclusiones"], "reglas": reglas,
        "casos": [{"id": c["id"], "nombre": c["nombre"], "descripcion": c["descripcion"],
                   "equipo": c["equipo"], "datos": c["datos"]} for c in CASOS],
        "ciclos": ciclos,
    })


@app.post("/api/diagnosticar")
def api_diagnosticar():
    datos = request.get_json(silent=True)
    try:
        hechos, lecturas = hechos_desde_formulario(datos)
    except ErrorEntrada as e:
        return error(e.errores)
    resultado = diagnosticar(BASE, hechos, nombre_equipo(datos), lecturas)
    return jsonify({"ok": True, **resultado})


@app.post("/api/porque")
def api_porque():
    cuerpo = request.get_json(silent=True) or {}
    conclusion = cuerpo.get("conclusion")
    if conclusion not in BASE["conclusiones"]:
        return error([f"«{conclusion}» no es una conclusión de la base de conocimiento."])
    try:
        hechos, _ = hechos_desde_formulario(cuerpo.get("datos"))
    except ErrorEntrada as e:
        return error(e.errores)

    equipo = nombre_equipo(cuerpo.get("datos"))
    resultado = ejecutar_inferencia(BASE, hechos, equipo)
    alcanzada = conclusion in resultado.hechos
    respuesta = {"ok": True, "conclusion": conclusion, "alcanzada": alcanzada,
                 "titulo": BASE["conclusiones"][conclusion]["titulo"]}
    if alcanzada:
        respuesta["texto"] = porque(conclusion, hechos, resultado.reglas_aplicadas, equipo)
        respuesta["arbol"] = arbol_porque(conclusion, hechos, resultado.reglas_aplicadas)
    else:
        respuesta["faltantes"] = porque_no(conclusion, resultado.hechos, BASE, equipo)
    return jsonify(respuesta)


@app.errorhandler(404)
def no_encontrado(_):
    return error(["Ruta no encontrada."], 404)


@app.errorhandler(500)
def error_interno(_):
    return error(["Error interno del servidor. Revise la consola donde se ejecuta la aplicación."], 500)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
