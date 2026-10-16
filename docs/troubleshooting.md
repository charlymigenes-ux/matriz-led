---
title: Matriz LED: solución de problemas
status: draft
verified_against: "matriz-led@e6c62d8 (0.10.0) · nopal@4346f72"
---


# Solución de problemas

| Problema | Causa y qué hacer |
|---|---|
| NOPAL muestra «Este plugin requiere Python 3.10 o superior» | El servidor corre Python 3.9 o menos. Actualiza Python o no uses este plugin |
| El plugin se instala pero no envía nada a la pantalla | Falta `pypixelcolor` en el entorno de NOPAL. Instálalo (`pip install pypixelcolor`) y reinicia NOPAL |
| Instalaste `pypixelcolor` y sigue sin funcionar con Python 3.9 | No es compatible con 3.9: falla al importarse |
| La pantalla no muestra el saludo «NOPAL» | El saludo lo dispara el backend al detectar la conexión, y **requiere que el panel de NOPAL esté abierto en alguna pestaña** (sondea cada ~10 s). No hay un planificador de fondo en el core |
| Un anuncio «Programado» no se envía solo | La programación (fechas, repetición) se guarda pero **no se dispara sola todavía**. Solo llegan a la pantalla el envío manual y el aviso automático |
| «Efecto de salida» y «Pausa» no hacen nada | Se guardan como metadatos del anuncio, pero `pypixelcolor` no expone un parámetro de salida independiente |
| No puedo crear un grupo nuevo | El selector solo ofrece grupos ya usados en anuncios existentes |
| El FK-8Wa no conecta | Comprueba que esté en la misma red, usa **Probar conexión** (debe leer 96×16) y verifica la IP |
| La pantalla de error del FK-8Wa solo dice «ERROR» | El estado de las máquinas no trae el texto del error |
