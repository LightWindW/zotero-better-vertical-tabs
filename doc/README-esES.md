# Zotero Better Vertical Tabs

[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)

Una extensión de pestañas verticales para [Zotero](https://www.zotero.org/).

[English](../README.md) | [简体中文](./README-zhCN.md) | [Español](./README-esES.md)

![logo](.\figs\logo.jpg)

Un complemento de pestañas verticales tanto para la ventana principal de Zotero como para el lector de PDF.

Este complemento le ayuda a gestionar las pestañas abiertas mediante una barra lateral vertical, facilitando la localización de pestañas, el cambio de vista y la organización de pestañas en categorías.

---

# 🧩 Funciones

## 1️⃣ Ventana principal

Tras instalar el complemento, una barra lateral de pestañas verticales (VT) aparece en el lado izquierdo de la ventana principal. Se expande automáticamente al pasar el ratón por encima y se contrae al alejarlo.

![Category](.\figs\VT.gif)

La VT de la ventana principal admite actualmente:

1. **Sincronización de pestañas**: Se mantiene sincronizada con la barra de pestañas nativa de Zotero; los adjuntos muestran el icono de su elemento padre.

2. **Tarjeta flotante de detalles**: Muestra información detallada del elemento al pasar el ratón sobre una pestaña.

3. **Búsqueda de pestañas**: Filtra rápidamente las pestañas abiertas mediante el cuadro de búsqueda situado en la parte superior.

4. **Gestión de categorías**: Cree categorías y establezca colores de categoría mediante clic derecho (los colores se pueden personalizar en las preferencias del complemento).

5. **Arrastrar y soltar**: Arrastre pestañas para reordenarlas o clasificarlas; también se pueden arrastrar categorías enteras.

6. **Guardar e importar categorías**: Guarde las categorías que use con frecuencia localmente e impórtelas con un solo clic cuando las necesite.

   ![Category](.\figs\Category.jpg)

## 3️⃣ Preferencias

El complemento ofrece las siguientes preferencias (`Editar` → `Preferencias` → `Better Vertical Tabs`):

- **Altura de pestaña personalizada**: Ajuste la altura de visualización de cada elemento de pestaña en la VT.
- **Habilitar efecto de desenfoque**: Use un fondo de cristal esmerilado para ventanas emergentes y tarjetas flotantes; desactívelo si su entorno no admite `backdrop-filter` o según su preferencia personal.
- **Cerrar automáticamente pestañas no leídas**: Cierra automáticamente las pestañas que no se han leído durante X días. Esta función está desactivada por defecto y debe habilitarse manualmente.

---

# 🚀 Instalación

1. Descargue el archivo `.xpi` del complemento desde la página de Release.
2. Abra Zotero y haga clic en `Herramientas` → `Complementos` en la barra de menú superior.
3. Haga clic en el icono del engranaje de la esquina superior derecha → `Instalar complemento desde archivo`.
4. Seleccione el archivo `.xpi` descargado e instálelo.
5. Reinicie Zotero para que el complemento surta efecto.

---

# ⚠️ Problemas conocidos

1. Actualmente, la VT solo sincroniza el orden de las pestañas desde la barra de pestañas nativa de Zotero en una dirección: arrastrar pestañas en la barra nativa no sincronizará su orden con la VT, lo que puede provocar inconsistencias. Se recomienda gestionar el orden de las pestañas mediante la VT.

---

# 📄 Licencia

Este proyecto es de código abierto bajo la licencia [AGPL-3.0-or-later](../LICENSE).
