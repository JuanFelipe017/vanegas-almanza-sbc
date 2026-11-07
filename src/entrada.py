"""
Capa de entrada: valida los datos del formulario y los convierte en hechos iniciales.

El usuario no tiene que decidir si "el uso de GPU es alto": escribe la lectura numérica
(por ejemplo 97 %) y esta capa aplica el umbral de cada predicado. Así se resuelve una de
las limitaciones de la Actividad 4 (hechos binarios ingresados a mano).

Cada hecho puede quedar en tres estados:
    True   -> el predicado se cumple            (ej. fps = 22  -> FPSBajos = True)
    False  -> el predicado NO se cumple          (ej. fps = 60  -> FPSBajos = False)
    (ausente) -> desconocido: el campo se dejó vacío o en "No sé"

Autores: Juan F. Vanegas Silva · Diego Felipe Almanza Vanegas
"""

# Campos numéricos: (predicado, función umbral, mínimo, máximo, unidad, etiqueta)
CAMPOS_NUMERICOS = {
    "fps":         ("FPSBajos",   lambda v: v < 30,  0, 1000, "FPS", "FPS promedio"),
    "uso_gpu":     ("UsoGPUAlto", lambda v: v >= 95, 0, 100,  "%",   "Uso de GPU"),
    "uso_cpu":     ("UsoCPUAlto", lambda v: v >= 90, 0, 100,  "%",   "Uso de CPU"),
    "temperatura": ("TempAlta",   lambda v: v > 90,  0, 150,  "°C",  "Temperatura máxima"),
    "uso_ram":     ("RAMLlena",   lambda v: v >= 90, 0, 100,  "%",   "Uso de RAM"),
    "ping":        ("PingAlto",   lambda v: v > 100, 0, 5000, "ms",  "Ping"),
}

# Campos de selección: (predicado, {opción: valor del predicado}, etiqueta)
CAMPOS_SELECCION = {
    "calidad_graficos": ("GraficosAltos",
                         {"baja": False, "media": False, "alta": True, "ultra": True}, "Calidad gráfica"),
    "almacenamiento":   ("JuegoEnHDD", {"hdd": True, "ssd": False}, "Disco donde está el juego"),
    "conexion":         ("ConexionWiFi", {"wifi": True, "cable": False}, "Tipo de conexión"),
    "fps_caen":         ("FPSCaenConTiempo", {"si": True, "no": False}, "¿Los FPS bajan con el tiempo?"),
    "tirones":          ("Tirones", {"si": True, "no": False}, "¿Hay tirones o congelamientos?"),
}

VALORES_DESCONOCIDOS = {None, "", "nose", "no_se", "desconocido"}


class ErrorEntrada(ValueError):
    """Error de validación con la lista de mensajes para mostrar al usuario."""

    def __init__(self, errores):
        super().__init__("; ".join(errores))
        self.errores = errores


def hechos_desde_formulario(datos):
    """Convierte el formulario en hechos iniciales {predicado: True/False}.

    Args:
        datos: diccionario con los campos del formulario (los vacíos se ignoran).
    Returns:
        (hechos, lecturas): hechos iniciales y, para cada predicado, la lectura que lo generó
        (para poder explicar "FPSBajos porque fps = 22 < 30").
    Raises:
        ErrorEntrada: si hay valores fuera de rango, no numéricos, opciones inválidas o si el
        formulario no tiene ningún dato.
    """
    if not isinstance(datos, dict):
        raise ErrorEntrada(["La solicitud debe ser un objeto JSON con los datos del formulario."])

    hechos, lecturas, errores = {}, {}, []

    for campo, (predicado, umbral, minimo, maximo, unidad, etiqueta) in CAMPOS_NUMERICOS.items():
        valor = datos.get(campo)
        if valor in VALORES_DESCONOCIDOS:
            continue
        try:
            numero = float(valor)
        except (TypeError, ValueError):
            errores.append(f"{etiqueta}: «{valor}» no es un número.")
            continue
        if not minimo <= numero <= maximo:
            errores.append(f"{etiqueta}: debe estar entre {minimo} y {maximo} {unidad}.")
            continue
        hechos[predicado] = bool(umbral(numero))
        lecturas[predicado] = f"{etiqueta} = {numero:g} {unidad}"

    for campo, (predicado, opciones, etiqueta) in CAMPOS_SELECCION.items():
        valor = datos.get(campo)
        if isinstance(valor, str):
            valor = valor.strip().lower()
        if valor in VALORES_DESCONOCIDOS:
            continue
        if valor not in opciones:
            errores.append(f"{etiqueta}: opción «{valor}» no válida.")
            continue
        hechos[predicado] = opciones[valor]
        lecturas[predicado] = f"{etiqueta} = {valor}"

    if errores:
        raise ErrorEntrada(errores)
    if not hechos:
        raise ErrorEntrada(["Ingrese al menos una lectura o síntoma para poder diagnosticar."])
    return hechos, lecturas


def nombre_equipo(datos):
    """Nombre del equipo para mostrar los hechos como Predicado(equipo)."""
    nombre = str((datos or {}).get("equipo") or "").strip()
    limpio = "".join(c if c.isalnum() else "_" for c in nombre)[:30].strip("_")
    return limpio or "mi_pc"
