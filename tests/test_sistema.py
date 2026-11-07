"""
Pruebas automáticas del sistema experto (solo biblioteca estándar: unittest).

Ejecutar desde la carpeta del proyecto:   python -m unittest discover -s tests -v
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from base_conocimiento import crear_base_conocimiento, crear_regla  # noqa: E402
from casos import CASOS  # noqa: E402
from entrada import ErrorEntrada, hechos_desde_formulario  # noqa: E402
from motor_inferencia import (combinar_certezas, detectar_ciclos, diagnosticar,  # noqa: E402
                              encadenamiento_adelante, ejecutar_inferencia, porque, porque_no)

BASE = crear_base_conocimiento()


class TestCasosDePrueba(unittest.TestCase):
    """Los 9 casos documentados en tests/casos_prueba.md."""

    def test_casos(self):
        for caso in CASOS:
            with self.subTest(caso=caso["nombre"]):
                hechos, _ = hechos_desde_formulario(caso["datos"])
                hechos_finales, reglas = encadenamiento_adelante(BASE, hechos)
                self.assertEqual([p["regla"] for p in reglas], caso["reglas_esperadas"])
                derivados = {p: h["certeza"] for p, h in hechos_finales.items() if h["origen"] != "observado"}
                self.assertEqual(derivados, caso["esperado"])

    def test_cobertura_de_reglas(self):
        """Entre todos los casos se usan las 15 reglas."""
        usadas = {r for caso in CASOS for r in caso["reglas_esperadas"]}
        self.assertEqual(usadas, {r["nombre"] for r in BASE["reglas"]})


class TestMotor(unittest.TestCase):
    def test_base_tiene_15_reglas_y_sin_ciclos(self):
        self.assertEqual(len(BASE["reglas"]), 15)
        self.assertEqual(detectar_ciclos(BASE), [])

    def test_combinacion_mycin(self):
        self.assertEqual(combinar_certezas(0.56, 0.48), 0.77)
        hechos, _ = hechos_desde_formulario(CASOS[4]["datos"])
        finales, _ = encadenamiento_adelante(BASE, hechos)
        self.assertEqual(finales["RecCerrarProcesos"]["origen"], ["R4", "R13"])

    def test_negacion_exige_dato_explicito(self):
        # Ping alto con conexión desconocida: no dispara ni R11 (WiFi) ni R14 (¬WiFi).
        _, reglas = encadenamiento_adelante(BASE, {"PingAlto": True})
        self.assertEqual(reglas, [])
        _, reglas = encadenamiento_adelante(BASE, {"PingAlto": True, "ConexionWiFi": False})
        self.assertEqual([p["regla"] for p in reglas], ["R14", "R15"])

    def test_sin_conclusion(self):
        r = diagnosticar(BASE, {"GraficosAltos": True})
        self.assertTrue(r["sin_conclusion"])
        self.assertTrue(r["punto_fijo"])
        self.assertEqual(r["iteraciones"], 1)

    def test_ciclo_termina_y_se_detecta(self):
        ciclica = [crear_regla("A", "t", [("P", True)], "Q", 0.9, "", "", ""),
                   crear_regla("B", "t", [("Q", True)], "P", 0.9, "", "", "")]
        self.assertEqual(detectar_ciclos(ciclica), [["P", "Q", "P"]])
        resultado = ejecutar_inferencia(ciclica, {"P": True})
        self.assertTrue(resultado.punto_fijo)            # la refracción evita el bucle infinito
        self.assertLessEqual(resultado.iteraciones, len(ciclica) + 1)

    def test_porque_y_porque_no(self):
        hechos, _ = hechos_desde_formulario(CASOS[1]["datos"])
        finales, reglas = encadenamiento_adelante(BASE, hechos)
        texto = porque("RecAmpliarRAM", hechos, reglas)
        self.assertIn("R8", texto)
        self.assertIn("R7", texto)
        self.assertIn("RAMLlena(x) es un hecho observado", texto)
        faltan = porque_no("RecBajarGraficos", finales, BASE)
        estados = {c["predicado"]: c["estado"] for c in faltan[0]["condiciones"]}
        self.assertEqual(estados, {"CuelloBotellaGPU": "no_concluido", "GraficosAltos": "desconocido"})


class TestEntrada(unittest.TestCase):
    def test_umbrales(self):
        hechos, _ = hechos_desde_formulario({"fps": 29, "uso_gpu": 95, "temperatura": 90, "ping": 101})
        self.assertEqual(hechos, {"FPSBajos": True, "UsoGPUAlto": True, "TempAlta": False, "PingAlto": True})

    def test_errores(self):
        for datos in ({}, {"uso_gpu": 150}, {"fps": "abc"}, {"conexion": "satelite"}, None):
            with self.subTest(datos=datos):
                with self.assertRaises(ErrorEntrada):
                    hechos_desde_formulario(datos)


class TestApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from app import app
        cls.cliente = app.test_client()

    def test_index_y_base(self):
        self.assertEqual(self.cliente.get("/").status_code, 200)
        base = self.cliente.get("/api/base").get_json()
        self.assertEqual(len(base["reglas"]), 15)
        self.assertEqual(list(base["predicados"])[0], "FPSBajos")

    def test_diagnosticar(self):
        r = self.cliente.post("/api/diagnosticar", json=CASOS[0]["datos"]).get_json()
        self.assertTrue(r["ok"])
        self.assertEqual([c["predicado"] for c in r["diagnosticos"]], ["CuelloBotellaGPU"])

    def test_validacion(self):
        resp = self.cliente.post("/api/diagnosticar", json={"uso_cpu": -5})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Uso de CPU", resp.get_json()["errores"][0])

    def test_porque_no_api(self):
        r = self.cliente.post("/api/porque", json={"datos": CASOS[2]["datos"],
                                                   "conclusion": "ProblemaServidor"}).get_json()
        self.assertFalse(r["alcanzada"])
        self.assertEqual(r["faltantes"][0]["condiciones"][1]["estado"], "falso")


if __name__ == "__main__":
    unittest.main()
