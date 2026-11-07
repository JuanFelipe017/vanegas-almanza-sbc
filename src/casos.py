"""
Casos de prueba del sistema. Los usan las pruebas automáticas, el notebook y la interfaz web
(botones de "casos precargados"), así los tres trabajan exactamente con los mismos datos.

Las reglas y conclusiones esperadas se definieron ANTES de ejecutar el sistema, razonando a
mano con la base de conocimiento.
"""

CASOS = [
    {
        "id": 1, "nombre": "PC con juego en ultra", "equipo": "pc_gamer",
        "descripcion": "Juego exigente en ultra; la GPU está al 99 % y no pasa de 25 FPS.",
        "datos": {"fps": 25, "uso_gpu": 99, "calidad_graficos": "ultra"},
        "reglas_esperadas": ["R1", "R3"],
        "esperado": {"CuelloBotellaGPU": 0.85, "RecBajarGraficos": 0.77},
    },
    {
        "id": 2, "nombre": "Portátil caliente", "equipo": "portatil",
        "descripcion": "Portátil que llega a 96 °C, pierde FPS con el tiempo y se congela con la RAM llena.",
        "datos": {"fps": 24, "temperatura": 96, "fps_caen": "si", "tirones": "si", "uso_ram": 94},
        "reglas_esperadas": ["R5", "R7", "R6", "R8", "R13"],
        "esperado": {"ThermalThrottling": 0.85, "FaltaRAM": 0.80, "RecMantenimientoTermico": 0.77,
                     "RecAmpliarRAM": 0.60, "RecCerrarProcesos": 0.48},
    },
    {
        "id": 3, "nombre": "Lag por WiFi", "equipo": "pc_online",
        "descripcion": "Partida en línea con 180 ms de ping conectado por WiFi.",
        "datos": {"ping": 180, "conexion": "wifi"},
        "reglas_esperadas": ["R11", "R12"],
        "esperado": {"ProblemaRedLocal": 0.75, "RecCableEthernet": 0.64},
    },
    {
        "id": 4, "nombre": "Lag con cable (negación)", "equipo": "pc_cable",
        "descripcion": "Ping de 150 ms aunque el PC está por cable: la red local queda descartada.",
        "datos": {"ping": 150, "conexion": "cable"},
        "reglas_esperadas": ["R14", "R15"],
        "esperado": {"ProblemaServidor": 0.60, "RecCambiarServidor": 0.42},
    },
    {
        "id": 5, "nombre": "PC viejo (combinación de FC)", "equipo": "pc_viejo",
        "descripcion": "CPU saturada, poca RAM y juego en HDD: dos reglas recomiendan cerrar procesos.",
        "datos": {"fps": 20, "uso_cpu": 97, "tirones": "si", "uso_ram": 92, "almacenamiento": "hdd"},
        "reglas_esperadas": ["R2", "R7", "R9", "R4", "R8", "R10", "R13"],
        "esperado": {"CuelloBotellaCPU": 0.80, "FaltaRAM": 0.80, "CuelloBotellaDisco": 0.70,
                     "RecCerrarProcesos": 0.77, "RecAmpliarRAM": 0.60, "RecMoverASSD": 0.59},
    },
    {
        "id": 6, "nombre": "Sin conclusión", "equipo": "pc_ok",
        "descripcion": "Gráficos en ultra pero el juego va a 90 FPS: no hay ningún problema que diagnosticar.",
        "datos": {"fps": 90, "calidad_graficos": "ultra", "uso_gpu": 70},
        "reglas_esperadas": [],
        "esperado": {},
    },
    {
        "id": 7, "nombre": "Todo falla (máxima cobertura)", "equipo": "pc_critico",
        "descripcion": "Equipo con todos los síntomas a la vez: activa 13 de las 15 reglas.",
        "datos": {"fps": 18, "uso_gpu": 99, "uso_cpu": 95, "calidad_graficos": "alta", "temperatura": 97,
                  "fps_caen": "si", "tirones": "si", "uso_ram": 95, "almacenamiento": "hdd",
                  "ping": 160, "conexion": "wifi"},
        "reglas_esperadas": ["R1", "R2", "R5", "R7", "R9", "R11",
                             "R3", "R4", "R6", "R8", "R10", "R12", "R13"],
        "esperado": {"CuelloBotellaGPU": 0.85, "CuelloBotellaCPU": 0.80, "ThermalThrottling": 0.85,
                     "FaltaRAM": 0.80, "CuelloBotellaDisco": 0.70, "ProblemaRedLocal": 0.75,
                     "RecBajarGraficos": 0.77, "RecCerrarProcesos": 0.77, "RecMantenimientoTermico": 0.77,
                     "RecAmpliarRAM": 0.60, "RecMoverASSD": 0.59, "RecCableEthernet": 0.64},
    },
    {
        "id": 8, "nombre": "Borde: conexión desconocida", "equipo": "pc_duda",
        "descripcion": "Ping alto pero el usuario no sabe cómo se conecta: no se puede culpar ni al WiFi "
                       "ni al servidor.",
        "datos": {"ping": 200},
        "reglas_esperadas": [],
        "esperado": {},
    },
    {
        "id": 9, "nombre": "Borde: valores en el umbral", "equipo": "pc_limite",
        "descripcion": "30 FPS exactos (el umbral es < 30) con GPU al 95 % y CPU al 89 %: FPSBajos es falso.",
        "datos": {"fps": 30, "uso_gpu": 95, "uso_cpu": 89, "calidad_graficos": "alta"},
        "reglas_esperadas": [],
        "esperado": {},
    },
]
