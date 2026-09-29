# Zotero Better Vertical Tabs

[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)

Una extensión de pestañas verticales para [Zotero](https://www.zotero.org/).

[English](../README.md) | [简体中文](./README-zhCN.md) | [Español](./README-esES.md)

<img src=".\figs\logo.jpg" />

Un complemento de pestañas verticales tanto para la ventana principal de Zotero como para el lector de PDF.

Este complemento le ayuda a gestionar las pestañas abiertas mediante una barra lateral vertical, facilitando la localización de pestañas, el cambio de vista y la organización de pestañas en categorías.

---

# 🧩 Funciones

## 1️⃣ Ventana principal

Tras instalar el complemento, una barra lateral de pestañas verticales (VT) aparece en el lado izquierdo de la ventana principal. Se expande automáticamente al pasar el ratón por encima y se contrae al alejarlo.

<img src=".\figs\VT.gif" />

La VT de la ventana principal admite actualmente:

1. **Sincronización de pestañas**: Se mantiene sincronizada con la barra de pestañas nativa de Zotero; los adjuntos muestran el icono de su elemento padre.

2. **Tarjeta flotante de detalles**: Muestra información detallada del elemento al pasar el ratón sobre una pestaña.

3. **Búsqueda de pestañas**: Filtra rápidamente las pestañas abiertas mediante el cuadro de búsqueda situado en la parte superior.

4. **Arrastrar y soltar**: Arrastre pestañas para reordenarlas o clasificarlas; también se pueden arrastrar categorías enteras. Use **Ctrl/Shift+clic** para seleccionar múltiples pestañas y arrastrarlas en lote.

5. **Guardar e importar categorías**: Guarde las categorías que use con frecuencia localmente e impórtelas con un solo clic cuando las necesite.

   <img src=".\figs\Category.jpg" />

## 2️⃣ Creación de categorías

El complemento ofrece tres formas de crear categorías, facilitando la organización de pestañas por proyecto, tema o plan de lectura:

- **① Menú de clic derecho**: Seleccione una o más pestañas, clic derecho → "Agregar categoría".

  <img src=".\figs\add1.jpg" width="300" />

- **② Arrastrar a la zona "+ Nueva categoría"**: Arrastre pestañas al cuadro punteado en la parte superior de la barra lateral y suéltelas para crear una nueva categoría.

  <img src=".\figs\add2.gif" width="300" />

- **③ Menú Más**: Haga clic en "Más" → "Agregar categoría" en la esquina superior derecha para crear una categoría vacía, luego arrastre pestañas a ella.

  <img src=".\figs\add3.jpg" width="300" />

## 3️⃣ Modos de expansión

El menú "Más" ofrece tres modos de expansión de la barra lateral para adaptarse a diferentes flujos de trabajo:

| Modo           | Comportamiento                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Automático** | Se expande al pasar el ratón, se contrae al alejarlo — ideal para navegar rápidamente por las pestañas                                |
| **Manual**     | No se expande al pasar el ratón; haga clic en el botón Pin para expandir. Permanece expandido hasta que se vuelva a hacer clic en Pin |
| **Mínimo**     | Igual que Manual, pero la barra contraída se reduce a solo 20px con el icono, para una mínima distracción visual                      |

Los cambios de modo surten efecto inmediatamente en todas las ventanas.

## 4️⃣ Gestión del lector PDF

Zotero ejecuta los lectores PDF en entornos aislados. Cuantos más lectores estén abiertos, más memoria se consume. Este complemento proporciona las siguientes herramientas para gestionar los recursos del lector:

- **Indicador verde de resalte**: Las pestañas con un lector PDF abierto muestran una barra vertical verde en el extremo izquierdo — reconocible de un vistazo (puede desactivarse en Preferencias).

- **Cierre/Apertura manual del lector**: Clic derecho en una pestaña → "Cerrar lector" / "Abrir lector" para liberar memoria instantáneamente — sin afectar a la pestaña.

- **Cierre automático de lectores inactivos**: Activado por defecto. El complemento cierra automáticamente los lectores PDF que no se hayan leído durante un número determinado de minutos. El valor predeterminado es 120 minutos, ajustable en Preferencias.

## 5️⃣ Cierre automático de pestañas inactivas

Para evitar la acumulación de pestañas no leídas durante mucho tiempo, el complemento puede cerrar automáticamente las pestañas que no se hayan leído durante un número determinado de días.

- **Desactivado por defecto**: Debe habilitarse manualmente en Preferencias.
- Se puede configurar un umbral de días — las pestañas no leídas más allá de este límite se cierran automáticamente.

## 6️⃣ Preferencias

El complemento ofrece las siguientes preferencias (`Editar` → `Preferencias` → `Better Vertical Tabs`):

- **Altura de pestaña personalizada**: Ajuste la altura de visualización de cada elemento de pestaña en la VT.
- **Modo de expansión**: Cambie entre los modos Automático / Manual / Mínimo.
- **Habilitar efecto de desenfoque**: Use un fondo de cristal esmerilado para ventanas emergentes y tarjetas flotantes; desactívelo si su entorno no admite `backdrop-filter` o según su preferencia personal.
- **Indicador de resalte del lector PDF**: Muestra una barra indicadora verde en las pestañas con un lector PDF abierto; puede desactivarse.
- **Cierre automático de lectores inactivos**: Cuando está activado, los lectores PDF inactivos durante más de X minutos se cierran automáticamente.
- **Cierre automático de pestañas inactivas**: Cuando está activado, las pestañas inactivas durante más de X días se cierran automáticamente; desactivado por defecto.

---

# 🚀 Instalación

1. Descargue el archivo `.xpi` del complemento desde la página de Release.
2. Abra Zotero y haga clic en `Herramientas` → `Complementos` en la barra de menú superior.
3. Haga clic en el icono del engranaje de la esquina superior derecha → `Instalar complemento desde archivo`.
4. Seleccione el archivo `.xpi` descargado e instálelo.
5. Reinicie Zotero para que el complemento surta efecto.

---

# ⚠️ Problemas conocidos

1. Actualmente, la VT solo sincroniza el orden de las pestañas desde la barra de pestañas nativa de Zotero en una dirección: arrastrar pestañas en la barra nativa no sincronizará su orden con la VT, lo que puede provocar inconsistencias. Se recomienda gestionar el orden de las pestañas mediante la VT, o usar "Más → Ocultar pestañas nativas" para mostrar solo la barra de pestañas vertical.

---

# 📄 Licencia

Este proyecto es de código abierto bajo la licencia [AGPL-3.0-or-later](../LICENSE).
