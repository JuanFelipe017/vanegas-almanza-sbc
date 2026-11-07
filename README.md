# Sistema experto de rendimiento en videojuegos (PC)

**Inteligencia Artificial II — Proyecto final · Fundación Universitaria Los Libertadores**
Juan F. Vanegas Silva · Diego Felipe Almanza Vanegas

**Demo en línea:** <https://vanegas-almanza-sbc.onrender.com> _(plan gratis: si nadie la ha abierto en 15 minutos tarda ~1 minuto en despertar)_

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
pip install -r requirements.txt        # app web
pip install -r requirements-dev.txt    # opcional: + Jupyter para el notebook
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
(`jupyter notebook` desde esta carpeta, tras instalar `requirements-dev.txt`).

## Estructura

```
vanegas_almanza_proyecto_final_sbc/
├── README.md
├── requirements.txt          # Flask + gunicorn (lo que usa el despliegue)
├── requirements-dev.txt      # + Jupyter
├── render.yaml               # despliegue en Render (Blueprint)
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

## Despliegue en la web (Render)

La app está publicada en Render con el archivo [`render.yaml`](render.yaml): instala `requirements.txt`
y la arranca con `gunicorn --chdir src app:app`. **Cada `git push` a `main` vuelve a desplegarla sola.**

Para desplegar una copia propia: [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/JuanFelipe017/vanegas-almanza-sbc)
(iniciar sesión con GitHub → *Apply*). El plan gratis se suspende tras 15 minutos sin visitas; antes de una
demostración, abrir la página un minuto antes.

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
