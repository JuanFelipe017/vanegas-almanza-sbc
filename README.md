# Sistema experto de rendimiento en videojuegos (PC)

**Inteligencia Artificial II — Proyecto final · Fundación Universitaria Los Libertadores**
Juan F. Vanegas Silva · Diego Felipe Almanza Vanegas

Sistema basado en conocimiento con interfaz web que diagnostica por qué un videojuego va mal en un PC
(pocos FPS, tirones o lag) y recomienda qué hacer. El usuario ingresa las lecturas de monitoreo
(FPS, % de GPU/CPU/RAM, temperatura, ping) y los síntomas; el motor de inferencia aplica 15 reglas de
producción con **encadenamiento hacia adelante** y **factores de certeza**, y explica cada conclusión
(**¿Por qué?** y **¿Por qué no?**).

Es la expansión del SBC de la Actividad 4 (12 → 15 reglas) con: lecturas numéricas convertidas a hechos
por umbrales, hechos de tres estados (verdadero / falso / desconocido), reglas con negación, combinación
de evidencias (MYCIN), detección de ciclos, registro (log) del motor y una aplicación web en Flask.

## Instalación

Requisitos: **Python 3.8 o superior** (probado con 3.13) y un navegador.

```bash
cd vanegas_almanza_proyecto_final_sbc
python -m venv .venv
# Windows:        .venv\Scripts\activate
# Linux / macOS:  source .venv/bin/activate
pip install -r requirements.txt
```

## Ejecutar la aplicación

```bash
python src/app.py
```

Abrir <http://127.0.0.1:5000>. Para detenerla: `Ctrl + C` en la consola.

Uso rápido: elegir un caso en **Casos de prueba precargados → Cargar**, o llenar el formulario y presionar
**Diagnosticar**. Ver `docs/manual_usuario.pdf`.

La interfaz (estilo HUD gamer) incluye un **mapa de inferencia** animado que ilumina las reglas disparadas
nivel por nivel, medidores de umbral con vista previa del predicado (`FPSBajos = V`), anillos de certeza y
transiciones entre pestañas. Las animaciones siguen la preferencia de Windows (`prefers-reduced-motion`);
si no se ven, activarlas con el botón **Efectos** de la barra superior. Funciona sin internet (las fuentes de
Google se usan solo si hay conexión).

## Pruebas

```bash
python -m unittest discover -s tests -v
```

14 pruebas: los 9 casos documentados en [`tests/casos_prueba.md`](tests/casos_prueba.md), combinación de FC,
negación, ciclos, validación de entrada y la API web. El notebook
`vanegas_almanza_proyecto_final_sbc.ipynb` documenta y ejecuta lo mismo paso a paso
(`jupyter notebook` desde esta carpeta).

## Estructura

```
vanegas_almanza_proyecto_final_sbc/
├── README.md
├── requirements.txt
├── vanegas_almanza_proyecto_final_sbc.ipynb   # notebook de documentación y validación
├── src/
│   ├── base_conocimiento.py   # 11 predicados observables, 14 derivados, 15 reglas
│   ├── entrada.py             # validación del formulario y umbrales -> hechos
│   ├── motor_inferencia.py    # encadenamiento hacia adelante, FC, explicación, ciclos
│   ├── casos.py               # 9 casos de prueba (también precargados en la web)
│   └── app.py                 # aplicación Flask (API + página)
├── templates/index.html
├── static/style.css, static/script.js
├── docs/
│   ├── documentacion_tecnica.pdf
│   ├── manual_usuario.pdf
│   └── capturas/
└── tests/
    ├── casos_prueba.md
    └── test_sistema.py
```

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Interfaz web |
| GET | `/api/base` | Predicados, reglas, casos precargados y resultado de la verificación de ciclos |
| POST | `/api/diagnosticar` | Recibe el formulario en JSON y devuelve diagnósticos, recomendaciones, reglas aplicadas, explicación y log |
| POST | `/api/porque` | `{datos, conclusion}` → por qué se concluyó, o qué condiciones faltaron |

Ejemplo: `POST /api/diagnosticar` con `{"fps": 25, "uso_gpu": 99, "calidad_graficos": "ultra"}` →
`CuelloBotellaGPU` (85 %) y `RecBajarGraficos` (77 %) por R1 → R3.

## Video de demostración

_(Agregar aquí el enlace al video si se graba.)_
