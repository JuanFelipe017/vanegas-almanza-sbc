# Casos de prueba y validación

Sistema experto de diagnóstico de rendimiento en videojuegos — Juan F. Vanegas Silva · Diego Felipe Almanza Vanegas

Las reglas y conclusiones **esperadas** se definieron antes de ejecutar el sistema, razonando a mano con la base de conocimiento. La columna **Resultado obtenido** se generó ejecutando el motor (`python -m unittest discover -s tests -v` verifica lo mismo automáticamente). Los datos de cada caso están en `src/casos.py` y también se pueden cargar desde la interfaz web (selector *Casos de prueba precargados*).

Notación: `¬P` = el usuario afirmó que P es falso. FC = factor de certeza.

| Caso | Descripción | Hechos iniciales | Reglas esperadas | Conclusión esperada (FC) | Resultado obtenido (FC) | Estado |
|---|---|---|---|---|---|---|
| 1 | **PC con juego en ultra.** Juego exigente en ultra; la GPU está al 99 % y no pasa de 25 FPS. | FPSBajos, UsoGPUAlto, GraficosAltos | R1, R3 | CuelloBotellaGPU (0.85)<br>RecBajarGraficos (0.77) | CuelloBotellaGPU (0.85)<br>RecBajarGraficos (0.77)<br>Reglas: R1, R3 | ✓ |
| 2 | **Portátil caliente.** Portátil que llega a 96 °C, pierde FPS con el tiempo y se congela con la RAM llena. | FPSBajos, TempAlta, RAMLlena, FPSCaenConTiempo, Tirones | R5, R7, R6, R8, R13 | ThermalThrottling (0.85)<br>FaltaRAM (0.80)<br>RecMantenimientoTermico (0.77)<br>RecAmpliarRAM (0.60)<br>RecCerrarProcesos (0.48) | ThermalThrottling (0.85)<br>FaltaRAM (0.80)<br>RecMantenimientoTermico (0.77)<br>RecAmpliarRAM (0.60)<br>RecCerrarProcesos (0.48)<br>Reglas: R5, R7, R6, R8, R13 | ✓ |
| 3 | **Lag por WiFi.** Partida en línea con 180 ms de ping conectado por WiFi. | PingAlto, ConexionWiFi | R11, R12 | ProblemaRedLocal (0.75)<br>RecCableEthernet (0.64) | ProblemaRedLocal (0.75)<br>RecCableEthernet (0.64)<br>Reglas: R11, R12 | ✓ |
| 4 | **Lag con cable (negación).** Ping de 150 ms aunque el PC está por cable: la red local queda descartada. | PingAlto, ¬ConexionWiFi | R14, R15 | ProblemaServidor (0.60)<br>RecCambiarServidor (0.42) | ProblemaServidor (0.60)<br>RecCambiarServidor (0.42)<br>Reglas: R14, R15 | ✓ |
| 5 | **PC viejo (combinación de FC).** CPU saturada, poca RAM y juego en HDD: dos reglas recomiendan cerrar procesos. | FPSBajos, UsoCPUAlto, RAMLlena, JuegoEnHDD, Tirones | R2, R7, R9, R4, R8, R10, R13 | CuelloBotellaCPU (0.80)<br>FaltaRAM (0.80)<br>CuelloBotellaDisco (0.70)<br>RecCerrarProcesos (0.77)<br>RecAmpliarRAM (0.60)<br>RecMoverASSD (0.59) | CuelloBotellaCPU (0.80)<br>FaltaRAM (0.80)<br>CuelloBotellaDisco (0.70)<br>RecCerrarProcesos (0.77)<br>RecAmpliarRAM (0.60)<br>RecMoverASSD (0.59)<br>Reglas: R2, R7, R9, R4, R8, R10, R13 | ✓ |
| 6 | **Sin conclusión.** Gráficos en ultra pero el juego va a 90 FPS: no hay ningún problema que diagnosticar. | ¬FPSBajos, ¬UsoGPUAlto, GraficosAltos | Ninguna | Ninguna | Ninguna (sin conclusión)<br>Reglas: ninguna | ✓ |
| 7 | **Todo falla (máxima cobertura).** Equipo con todos los síntomas a la vez: activa 13 de las 15 reglas. | FPSBajos, UsoGPUAlto, UsoCPUAlto, TempAlta, RAMLlena, PingAlto, GraficosAltos, JuegoEnHDD, ConexionWiFi, FPSCaenConTiempo, Tirones | R1, R2, R5, R7, R9, R11, R3, R4, R6, R8, R10, R12, R13 | CuelloBotellaGPU (0.85)<br>CuelloBotellaCPU (0.80)<br>ThermalThrottling (0.85)<br>FaltaRAM (0.80)<br>CuelloBotellaDisco (0.70)<br>ProblemaRedLocal (0.75)<br>RecBajarGraficos (0.77)<br>RecCerrarProcesos (0.77)<br>RecMantenimientoTermico (0.77)<br>RecAmpliarRAM (0.60)<br>RecMoverASSD (0.59)<br>RecCableEthernet (0.64) | CuelloBotellaGPU (0.85)<br>CuelloBotellaCPU (0.80)<br>ThermalThrottling (0.85)<br>FaltaRAM (0.80)<br>CuelloBotellaDisco (0.70)<br>ProblemaRedLocal (0.75)<br>RecBajarGraficos (0.77)<br>RecCerrarProcesos (0.77)<br>RecMantenimientoTermico (0.77)<br>RecAmpliarRAM (0.60)<br>RecMoverASSD (0.59)<br>RecCableEthernet (0.64)<br>Reglas: R1, R2, R5, R7, R9, R11, R3, R4, R6, R8, R10, R12, R13 | ✓ |
| 8 | **Borde: conexión desconocida.** Ping alto pero el usuario no sabe cómo se conecta: no se puede culpar ni al WiFi ni al servidor. | PingAlto | Ninguna | Ninguna | Ninguna (sin conclusión)<br>Reglas: ninguna | ✓ |
| 9 | **Borde: valores en el umbral.** 30 FPS exactos (el umbral es < 30) con GPU al 95 % y CPU al 89 %: FPSBajos es falso. | ¬FPSBajos, UsoGPUAlto, ¬UsoCPUAlto, GraficosAltos | Ninguna | Ninguna | Ninguna (sin conclusión)<br>Reglas: ninguna | ✓ |

**Resultado: 9/9 casos correctos.** Reglas ejercitadas entre todos los casos: 15/15 (R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15).

## Qué valida cada caso

| Caso | Parte de la base que ejercita | Requisito del enunciado |
|---|---|---|
| 1 | Grupo hardware (GPU): cadena de 2 niveles R1 → R3 | Caso típico |
| 2 | Temperatura + memoria; dos causas a la vez | Varias causas simultáneas |
| 3 | Red local (WiFi) | Caso típico |
| 4 | Regla con **negación** (R14: PingAlto ∧ ¬ConexionWiFi) | Funcionalidad nueva |
| 5 | **Combinación de evidencia** (R4 y R13 concluyen RecCerrarProcesos: 0.56 + 0.48·(1−0.56) = 0.77) | Funcionalidad nueva |
| 6 | Datos que no completan ninguna regla | Al menos un caso sin conclusión |
| 7 | Todos los síntomas: 13 de 15 reglas (R14/R15 son excluyentes con R11/R12) | Caso que activa la mayoría de reglas |
| 8 | **Borde:** dato desconocido. Sin saber la conexión no se puede usar ni R11 ni R14 | Caso de borde |
| 9 | **Borde:** valores exactamente en el umbral (30 FPS no es < 30; GPU 95 % sí es ≥ 95 %) | Caso de borde |

## Otros casos de borde verificados por las pruebas automáticas (`tests/test_sistema.py`)

- Formulario vacío, valores fuera de rango (GPU = 150 %), texto en un campo numérico u opción inválida → error de validación (HTTP 400) con mensaje claro.
- Base de conocimiento con un ciclo (P → Q, Q → P): `detectar_ciclos()` lo reporta y el motor termina igual gracias a la refracción.
- `porque_no()` distingue entre condición falsa, dato no informado y predicado derivado no concluido.
