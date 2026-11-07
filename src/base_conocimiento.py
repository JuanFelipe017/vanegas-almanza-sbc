"""
Base de conocimiento del sistema experto de diagnóstico de rendimiento en videojuegos de PC.

Contiene tres cosas:
  * PREDICADOS    -> los 11 predicados observables del dominio (los hechos de entrada),
                     con su tipo, dominio, rango y el umbral con que se calculan.
  * CONCLUSIONES  -> los predicados derivados (diagnósticos y recomendaciones) con el texto
                     que ve el usuario final.
  * REGLAS        -> las 15 reglas de producción, cada una con su fórmula en lógica de
                     predicados, su versión SI-ENTONCES y su factor de certeza.

Convención de las reglas (igual al formato del enunciado):
    'condiciones': [(predicado, valor_esperado), ...]   unidas con Y lógico (∧)
    'conclusion' : (predicado, True)
    valor_esperado = True  -> la condición pide que el hecho sea verdadero      P(x)
    valor_esperado = False -> la condición pide que el hecho sea FALSO          ¬P(x)
                              (el usuario lo tuvo que afirmar explícitamente; un hecho
                              desconocido NO cuenta como falso).

Todas las reglas están cuantificadas universalmente (∀x, x ∈ E = equipos en una sesión de
juego). En el motor la x se instancia con el equipo que se está consultando.

Autores: Juan F. Vanegas Silva · Diego Felipe Almanza Vanegas
"""

# ---------------------------------------------------------------------------
# 1. Predicados observables (hechos de entrada)
# ---------------------------------------------------------------------------
# 'campo'  : nombre del campo del formulario del que sale el predicado.
# 'umbral' : condición que convierte la lectura en verdadero/falso (ver entrada.py).
PREDICADOS = {
    "FPSBajos": {
        "descripcion": "El juego corre a menos de 30 FPS",
        "campo": "fps", "umbral": "fps < 30", "categoria": "Rendimiento",
    },
    "UsoGPUAlto": {
        "descripcion": "La GPU está al 95 % de uso o más mientras se juega",
        "campo": "uso_gpu", "umbral": "uso_gpu ≥ 95 %", "categoria": "Hardware",
    },
    "UsoCPUAlto": {
        "descripcion": "La CPU está al 90 % de uso o más mientras se juega",
        "campo": "uso_cpu", "umbral": "uso_cpu ≥ 90 %", "categoria": "Hardware",
    },
    "GraficosAltos": {
        "descripcion": "El juego está configurado en calidad alta o ultra",
        "campo": "calidad_graficos", "umbral": "calidad ∈ {alta, ultra}", "categoria": "Configuración",
    },
    "TempAlta": {
        "descripcion": "La CPU o la GPU supera los 90 °C",
        "campo": "temperatura", "umbral": "temperatura > 90 °C", "categoria": "Temperatura",
    },
    "FPSCaenConTiempo": {
        "descripcion": "Los FPS empiezan bien y bajan después de varios minutos de juego",
        "campo": "fps_caen", "umbral": "respuesta = sí", "categoria": "Temperatura",
    },
    "Tirones": {
        "descripcion": "Hay congelamientos breves (stuttering) durante el juego",
        "campo": "tirones", "umbral": "respuesta = sí", "categoria": "Memoria y disco",
    },
    "RAMLlena": {
        "descripcion": "El uso de memoria RAM es del 90 % o más",
        "campo": "uso_ram", "umbral": "uso_ram ≥ 90 %", "categoria": "Memoria y disco",
    },
    "JuegoEnHDD": {
        "descripcion": "El juego está instalado en un disco duro mecánico (no SSD)",
        "campo": "almacenamiento", "umbral": "almacenamiento = HDD", "categoria": "Memoria y disco",
    },
    "PingAlto": {
        "descripcion": "La latencia en juegos en línea supera los 100 ms",
        "campo": "ping", "umbral": "ping > 100 ms", "categoria": "Red",
    },
    "ConexionWiFi": {
        "descripcion": "El equipo se conecta a internet por WiFi",
        "campo": "conexion", "umbral": "conexión = WiFi", "categoria": "Red",
    },
}

# Información formal común a los 11 predicados (sección 2.1 de la documentación).
TIPO_PREDICADOS = {
    "aridad": 1,
    "dominio": "x ∈ E, E = conjunto de equipos (PC) en una sesión de juego",
    "rango": "{verdadero, falso}  (o desconocido si el usuario no lo informa)",
}

# ---------------------------------------------------------------------------
# 2. Predicados derivados: diagnósticos y recomendaciones
# ---------------------------------------------------------------------------
CONCLUSIONES = {
    # --- Diagnósticos ---
    "CuelloBotellaGPU": {
        "tipo": "diagnostico", "titulo": "La tarjeta gráfica (GPU) limita el rendimiento",
        "detalle": "La GPU trabaja al máximo y aun así no alcanza 30 FPS.",
    },
    "CuelloBotellaCPU": {
        "tipo": "diagnostico", "titulo": "El procesador (CPU) limita el rendimiento",
        "detalle": "La CPU está saturada y la GPU queda esperando por ella.",
    },
    "ThermalThrottling": {
        "tipo": "diagnostico", "titulo": "Sobrecalentamiento (thermal throttling)",
        "detalle": "El equipo baja su frecuencia para protegerse del calor acumulado.",
    },
    "FaltaRAM": {
        "tipo": "diagnostico", "titulo": "La memoria RAM no es suficiente",
        "detalle": "Sin RAM libre, el sistema usa el disco como memoria y el juego se congela.",
    },
    "CuelloBotellaDisco": {
        "tipo": "diagnostico", "titulo": "El disco duro no carga los datos a tiempo",
        "detalle": "Un HDD mecánico es lento para cargar texturas y mapas mientras se juega.",
    },
    "ProblemaRedLocal": {
        "tipo": "diagnostico", "titulo": "El lag viene de la conexión WiFi",
        "detalle": "El WiFi agrega latencia e interferencia frente a una conexión por cable.",
    },
    "ProblemaServidor": {
        "tipo": "diagnostico", "titulo": "El lag viene del servidor o del proveedor de internet",
        "detalle": "La conexión local es por cable, así que la latencia se genera fuera del equipo.",
    },
    # --- Recomendaciones ---
    "RecBajarGraficos": {
        "tipo": "recomendacion", "titulo": "Bajar la calidad gráfica o activar DLSS/FSR",
        "detalle": "Pase de ultra/alto a medio, o active el escalado DLSS/FSR en modo Calidad.",
    },
    "RecCerrarProcesos": {
        "tipo": "recomendacion", "titulo": "Cerrar programas en segundo plano",
        "detalle": "Cierre navegador, Discord, actualizaciones y launchers que no use mientras juega.",
    },
    "RecMantenimientoTermico": {
        "tipo": "recomendacion", "titulo": "Hacer mantenimiento térmico",
        "detalle": "Limpie ventiladores y disipadores y cambie la pasta térmica.",
    },
    "RecAmpliarRAM": {
        "tipo": "recomendacion", "titulo": "Ampliar la memoria RAM",
        "detalle": "Para juegos actuales se recomiendan 16 GB en doble canal.",
    },
    "RecMoverASSD": {
        "tipo": "recomendacion", "titulo": "Mover el juego a un SSD",
        "detalle": "Instale el juego en una unidad SSD (SATA o NVMe).",
    },
    "RecCableEthernet": {
        "tipo": "recomendacion", "titulo": "Conectar el PC por cable Ethernet",
        "detalle": "Si no es posible, acerque el equipo al router o use la banda de 5 GHz.",
    },
    "RecCambiarServidor": {
        "tipo": "recomendacion", "titulo": "Elegir un servidor más cercano o revisar el proveedor",
        "detalle": "Cambie la región del servidor del juego; si persiste, haga un test de velocidad y "
                   "contacte al proveedor de internet.",
    },
}


# ---------------------------------------------------------------------------
# 3. Reglas de producción
# ---------------------------------------------------------------------------
def crear_regla(nombre, categoria, condiciones, conclusion, certeza, logica, descripcion, justificacion):
    """Crea una regla SI condiciones ENTONCES conclusion.

    Args:
        nombre: identificador (R1, R2, ...).
        categoria: grupo temático de la regla.
        condiciones: lista de tuplas (predicado, valor_esperado) unidas con Y.
        conclusion: predicado derivado que se concluye como verdadero.
        certeza: factor de certeza (FC) de la regla, entre 0 y 1.
        logica: fórmula en lógica de predicados (texto).
        descripcion: lectura corta de la regla en lenguaje natural.
        justificacion: por qué el experto considera válida la regla.
    """
    return {
        "nombre": nombre,
        "categoria": categoria,
        "condiciones": list(condiciones),
        "conclusion": (conclusion, True),
        "certeza": certeza,
        "logica": logica,
        "descripcion": descripcion,
        "justificacion": justificacion,
    }


REGLAS = [
    # --- Grupo 1: cuellos de botella de hardware ---
    crear_regla("R1", "Hardware", [("FPSBajos", True), ("UsoGPUAlto", True)], "CuelloBotellaGPU", 0.85,
                "∀x (FPSBajos(x) ∧ UsoGPUAlto(x) → CuelloBotellaGPU(x))",
                "Pocos FPS con la GPU al tope indican cuello de botella de GPU",
                "Si la GPU ya está al máximo y no alcanza 30 FPS, ella es el límite."),
    crear_regla("R2", "Hardware", [("FPSBajos", True), ("UsoCPUAlto", True)], "CuelloBotellaCPU", 0.80,
                "∀x (FPSBajos(x) ∧ UsoCPUAlto(x) → CuelloBotellaCPU(x))",
                "Pocos FPS con la CPU saturada indican cuello de botella de CPU",
                "Con el procesador saturado, la GPU espera los datos de cada cuadro."),
    crear_regla("R3", "Hardware", [("CuelloBotellaGPU", True), ("GraficosAltos", True)], "RecBajarGraficos", 0.90,
                "∀x (CuelloBotellaGPU(x) ∧ GraficosAltos(x) → RecBajarGraficos(x))",
                "Si la GPU limita y los gráficos están altos, bajar gráficos",
                "Bajar la calidad gráfica le quita carga directamente a la GPU."),
    crear_regla("R4", "Hardware", [("CuelloBotellaCPU", True)], "RecCerrarProcesos", 0.70,
                "∀x (CuelloBotellaCPU(x) → RecCerrarProcesos(x))",
                "Si la CPU limita, cerrar procesos en segundo plano",
                "Los programas en segundo plano le roban tiempo de CPU al juego."),

    # --- Grupo 2: temperatura ---
    crear_regla("R5", "Temperatura", [("TempAlta", True), ("FPSCaenConTiempo", True)], "ThermalThrottling", 0.85,
                "∀x (TempAlta(x) ∧ FPSCaenConTiempo(x) → ThermalThrottling(x))",
                "Temperatura alta y FPS que caen con el tiempo indican thermal throttling",
                "El calor acumulado obliga al hardware a bajar su frecuencia."),
    crear_regla("R6", "Temperatura", [("ThermalThrottling", True)], "RecMantenimientoTermico", 0.90,
                "∀x (ThermalThrottling(x) → RecMantenimientoTermico(x))",
                "Si hay thermal throttling, hacer mantenimiento térmico",
                "Limpiar ventiladores y cambiar la pasta térmica baja la temperatura."),

    # --- Grupo 3: memoria y almacenamiento ---
    crear_regla("R7", "Memoria y disco", [("Tirones", True), ("RAMLlena", True)], "FaltaRAM", 0.80,
                "∀x (Tirones(x) ∧ RAMLlena(x) → FaltaRAM(x))",
                "Tirones con la RAM llena indican falta de memoria",
                "Sin RAM libre el sistema usa el archivo de paginación y se congela."),
    crear_regla("R8", "Memoria y disco", [("FaltaRAM", True)], "RecAmpliarRAM", 0.75,
                "∀x (FaltaRAM(x) → RecAmpliarRAM(x))",
                "Si falta RAM, ampliar la memoria",
                "Más memoria evita el uso del disco como memoria virtual."),
    crear_regla("R9", "Memoria y disco", [("Tirones", True), ("JuegoEnHDD", True)], "CuelloBotellaDisco", 0.70,
                "∀x (Tirones(x) ∧ JuegoEnHDD(x) → CuelloBotellaDisco(x))",
                "Tirones con el juego en HDD indican cuello de botella del disco",
                "Un HDD es lento para cargar datos sobre la marcha (FC bajo: los tirones "
                "también pueden venir de la compilación de shaders)."),
    crear_regla("R10", "Memoria y disco", [("CuelloBotellaDisco", True)], "RecMoverASSD", 0.85,
                "∀x (CuelloBotellaDisco(x) → RecMoverASSD(x))",
                "Si el disco limita, mover el juego a un SSD",
                "Un SSD carga los datos decenas de veces más rápido que un HDD."),

    # --- Grupo 4: red ---
    crear_regla("R11", "Red", [("PingAlto", True), ("ConexionWiFi", True)], "ProblemaRedLocal", 0.75,
                "∀x (PingAlto(x) ∧ ConexionWiFi(x) → ProblemaRedLocal(x))",
                "Ping alto por WiFi indica un problema de la red local",
                "El WiFi agrega latencia e interferencia frente al cable."),
    crear_regla("R12", "Red", [("ProblemaRedLocal", True)], "RecCableEthernet", 0.85,
                "∀x (ProblemaRedLocal(x) → RecCableEthernet(x))",
                "Si el problema es la red local, conectar por cable",
                "El cable da una conexión estable y con menos latencia."),

    # --- Reglas nuevas del proyecto final ---
    crear_regla("R13", "Memoria y disco", [("FaltaRAM", True)], "RecCerrarProcesos", 0.60,
                "∀x (FaltaRAM(x) → RecCerrarProcesos(x))",
                "Si falta RAM, cerrar procesos también ayuda",
                "Cerrar programas libera memoria. Comparte conclusión con R4: si ambas se "
                "disparan, el motor combina sus certezas (fórmula de MYCIN)."),
    crear_regla("R14", "Red", [("PingAlto", True), ("ConexionWiFi", False)], "ProblemaServidor", 0.60,
                "∀x (PingAlto(x) ∧ ¬ConexionWiFi(x) → ProblemaServidor(x))",
                "Ping alto conectado por cable indica un problema del servidor o del proveedor",
                "Descartada la red inalámbrica, la latencia se origina fuera del equipo "
                "(FC bajo: también podría ser el router)."),
    crear_regla("R15", "Red", [("ProblemaServidor", True)], "RecCambiarServidor", 0.70,
                "∀x (ProblemaServidor(x) → RecCambiarServidor(x))",
                "Si el problema es el servidor, elegir uno más cercano o revisar el proveedor",
                "Un servidor más cercano reduce la distancia que recorren los paquetes."),
]


def crear_base_conocimiento():
    """Devuelve la base de conocimiento completa (lo que recibe el motor de inferencia)."""
    return {"predicados": PREDICADOS, "conclusiones": CONCLUSIONES, "reglas": REGLAS}


def si_entonces(regla):
    """Traduce una regla a formato SI-ENTONCES legible: 'SI A Y NO B ENTONCES C'."""
    partes = [p if valor else f"NO {p}" for p, valor in regla["condiciones"]]
    return f"SI {' Y '.join(partes)} ENTONCES {regla['conclusion'][0]}"


def nombre_legible(predicado):
    """Texto legible de cualquier predicado (observable o derivado)."""
    if predicado in PREDICADOS:
        return PREDICADOS[predicado]["descripcion"]
    if predicado in CONCLUSIONES:
        return CONCLUSIONES[predicado]["titulo"]
    return predicado


if __name__ == "__main__":
    print(f"{len(PREDICADOS)} predicados observables, {len(CONCLUSIONES)} derivados, {len(REGLAS)} reglas")
    for r in REGLAS:
        print(f"{r['nombre']:>3} [{r['certeza']:.2f}] {si_entonces(r)}")
