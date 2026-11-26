# DailyEnglish

Organizador de estudio en español para Android e iOS. Incluye una vista web para probar el horario, las plantillas y el progreso. Los datos se guardan localmente.

## Probar en un teléfono

1. Instala Node.js y, en la carpeta que contiene `package.json`, ejecuta `npm ci`.
2. Ejecuta `npx expo start`. Abre el proyecto en un cliente compatible con Expo SDK 54 con el teléfono y la computadora en la misma red. Para comprobar el comportamiento del permiso de alarmas exactas de DailyEnglish, usa una compilación propia de Android.
3. Ve a **Ajustes** → **Activar avisos** → **Aviso de prueba**. Bloquea el teléfono y espera 12 segundos. Luego prueba una sesión futura y verifica que al moverla se actualice el aviso.
4. Agrega los enlaces de SpeakFlow y Reading Studio en **Ajustes**.

El proyecto declara el acceso de alarmas exactas en Android. Según el dispositivo, puede ser necesario permitir **Alarmas y recordatorios** en el sistema para ajustar la entrega a la hora programada.

La app prepara hasta 60 avisos pendientes y los renueva cuando la abres. En Ajustes se muestra hasta qué fecha están programados. En la vista web, los avisos del sistema y las grabaciones requieren la versión móvil.

## Copias y privacidad

**Ajustes** permite exportar o restaurar un archivo JSON con el horario, las notas, las frases y el progreso. Las grabaciones se guardan en el teléfono donde se hicieron. Puedes transportar la copia manualmente a otro equipo. La sincronización automática entre dispositivos queda pendiente.

## Verificar el proyecto

```sh
npm test
npx expo export --platform web
npx expo export --platform android --platform ios
```

La exportación genera los paquetes de JavaScript. Para distribuir una app instalable se requiere una compilación nativa.

## Actualizar la app de GitHub Pages

1. Modifica el proyecto y ejecuta `npm ci` si cambian las dependencias.
2. Ejecuta `npm run build:pages`.
3. Publica `index.html`, `instalar.html`, `manifest.webmanifest`, `sw.js`, `version.json`, `app-*.js`, los iconos y el logo de `dist-pages` dentro de `dailyenglish/` en la rama `main`.
4. Abre la app instalada con internet para que cargue la versión publicada. El horario sigue guardado en el dispositivo.
