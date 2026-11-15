/** ES · core. Misma forma que en/core.ts. */
import type { Messages } from '../../index'

export const core: Pick<
  Messages,
  'app' | 'language' | 'tabs' | 'panel' | 'zoneSelector' | 'units' | 'status' | 'errors'
> = {
  app: {
    title: 'OliveTwin',
    subtitle: 'Radar NISAR, vegetación, suelo y clima · datos NISAR PROVISIONALES',
    analysisResults: 'Resultados del análisis',
    analysisLoading: 'Cargando el análisis de la zona…',
  },
  language: {
    label: 'Idioma',
    en: 'English',
    es: 'Español',
  },
  tabs: {
    label: 'Vistas del panel',
    layers: 'Capas',
    analysis: 'Análisis',
    compare: 'Comparar',
    story: 'Historia',
    analysisDisabled: 'Esta zona no tiene cubo de análisis publicado',
    compareDisabled: 'Hacen falta dos zonas con análisis publicado',
  },
  panel: {
    label: 'Panel de control de OliveTwin',
  },
  zoneSelector: {
    label: 'Zona de estudio',
    selectPlaceholder: 'Selecciona una zona',
    emptyPlaceholder: 'No hay zonas disponibles',
    emptyHint: 'No hay zonas disponibles en este modo de datos.',
  },
  units: {
    dimensionless: 'adimensional',
  },
  status: {
    label: 'Estado de los datos',
    errorTitle: 'No se han podido cargar los datos',
    retry: 'Reintentar',
    syntheticBadge: 'DATOS SIMULADOS',
    syntheticText: 'Capas científicas inventadas para demostración; el mapa base es real',
    loading: 'Cargando datos…',
    emptyReal: 'Todavía no hay zonas con datos científicos reales',
    emptySample: 'No hay zonas disponibles en este modo de datos',
    basemapSatelliteDown: 'La Vista Satelital no responde',
    basemapGeneralDown: 'La Vista General no responde',
    basemapHint: 'Puedes continuar con el otro mapa base mientras se restablece el servicio.',
    useGeneralView: 'Usar Vista General',
    useSatelliteView: 'Usar Vista Satelital',
    overlayTitle: 'La imagen de la capa no está disponible',
    overlayHint: 'El mapa sigue funcionando; puedes cambiar de capa o volver a intentarlo.',
    close: 'Cerrar',
    closeOverlayAria: 'Cerrar aviso de imagen no disponible',
  },
  errors: {
    modeSample: 'muestra',
    modeReal: 'real',
    validatorDetail: 'sin detalle del validador',
    rootPath: '(raíz)',
    invalidValue: 'valor no válido',
    contract: (p) => `El manifiesto de datos «${p.mode}» no cumple el contrato: ${p.detail}.`,
    modeMismatch: (p) =>
      `El manifiesto de datos «${p.mode}» declara el modo «${p.declared}»; se esperaba «${p.mode}».`,
    statusMismatch: (p) =>
      `El manifiesto «${p.mode}» contiene la capa «${p.layerId}» de la zona «${p.zoneId}» con estado «${p.status}»; en modo ${p.modeName} todas las capas deben ser «${p.expected}».`,
    unsafeImage: (p) =>
      `El manifiesto «${p.mode}» contiene una ruta de imagen no permitida en la capa «${p.layerId}» de la zona «${p.zoneId}»: «${p.image}».`,
    unsafeTimeStepImage: (p) =>
      `El manifiesto «${p.mode}» contiene una ruta de imagen no permitida en el paso temporal ${p.step} de la capa «${p.layerId}» de la zona «${p.zoneId}»: «${p.image}».`,
    semantic: (p) => `El manifiesto de datos «${p.mode}» no es coherente: ${p.issue}.`,
    network: (p) =>
      `No se pudo descargar el manifiesto de datos «${p.mode}». Comprueba la conexión y vuelve a intentarlo.`,
    httpNotFound: (p) => `No se encontró el manifiesto de datos «${p.mode}» (HTTP 404).`,
    httpStatus: (p) =>
      `El servidor respondió con HTTP ${p.status} al cargar el manifiesto de datos «${p.mode}».`,
    invalidJson: (p) => `El manifiesto de datos «${p.mode}» no es un JSON válido.`,
    dataLoadFailed: (p) => `No se pudieron cargar los datos «${p.mode}». Vuelve a intentarlo.`,
    assetPath: (p) => `Ruta de asset no permitida: «${p.path}» (${p.reason}).`,
    assetPathReason:
      'debe ser una ruta relativa a public/, sin "/" inicial, "%", "..", ":" ni "\\"',
    semantics: {
      zoneSubject: (p) => `la zona «${p.id}» (índice ${p.index})`,
      layerSubject: (p) => `la capa «${p.id}» (índice ${p.index}) de ${p.zone}`,
      stepSubject: (p) => `el paso temporal ${p.index} (${p.date}) de ${p.layer}`,
      duplicateZone: (p) => `id de zona duplicado: «${p.id}»`,
      noBbox: (p) => `${p.subject} no declara un bbox de cuatro números`,
      invalidWest: (p) =>
        `${p.subject} tiene un bbox inválido: west (${p.west}) debe ser menor que east (${p.east})`,
      invalidSouth: (p) =>
        `${p.subject} tiene un bbox inválido: south (${p.south}) debe ser menor que north (${p.north})`,
      outsideWest: (p) =>
        `${p.subject} tiene un bbox fuera de la zona: west (${p.value}) < ${p.limit} - ${p.tolerance}`,
      outsideSouth: (p) =>
        `${p.subject} tiene un bbox fuera de la zona: south (${p.value}) < ${p.limit} - ${p.tolerance}`,
      outsideEast: (p) =>
        `${p.subject} tiene un bbox fuera de la zona: east (${p.value}) > ${p.limit} + ${p.tolerance}`,
      outsideNorth: (p) =>
        `${p.subject} tiene un bbox fuera de la zona: north (${p.value}) > ${p.limit} + ${p.tolerance}`,
      invalidDate: (p) =>
        `${p.subject} no declara una fecha ISO 8601 real (fecha o fecha-hora con zona)`,
      duplicateDate: (p) => `${p.subject} repite la fecha de un paso anterior (${p.previous})`,
      unordered: (p) =>
        `${p.subject} rompe el orden estrictamente creciente: es anterior a ${p.previous}`,
      imageMismatch: (p) =>
        `${p.subject} tiene un layer.image distinto del último paso temporal (${p.image})`,
      bboxMismatch: (p) => `${p.subject} tiene un layer.bbox distinto del último paso temporal`,
    },
  },
}
