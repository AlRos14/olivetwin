/** EN · core: app shell, language switch, tabs, shared words, units, status/errors. Owner: I18N-UI-CORE. */
export const core = {
  app: {
    title: 'OliveTwin',
    subtitle: 'NISAR radar, vegetation, soil and climate · PROVISIONAL NISAR data',
    analysisResults: 'Analysis results',
    analysisLoading: 'Loading the area analysis…',
  },
  language: {
    label: 'Language',
    en: 'English',
    es: 'Español',
  },
  tabs: {
    label: 'Panel views',
    layers: 'Layers',
    analysis: 'Analysis',
    compare: 'Compare',
    story: 'Story',
    analysisDisabled: 'This area has no published analysis cube',
    compareDisabled: 'Two areas with published analysis are needed',
  },
  panel: {
    label: 'OliveTwin control panel',
  },
  zoneSelector: {
    label: 'Study area',
    selectPlaceholder: 'Select an area',
    emptyPlaceholder: 'No areas available',
    emptyHint: 'No areas are available in this data mode.',
  },
  units: {
    /** Shown when the data declare the dimensionless unit `1`. */
    dimensionless: 'dimensionless',
  },
  status: {
    label: 'Data status',
    errorTitle: 'The data could not be loaded',
    retry: 'Retry',
    syntheticBadge: 'SYNTHETIC DATA',
    syntheticText: 'Scientific layers made up for demonstration; the base map is real',
    loading: 'Loading data…',
    emptyReal: 'There are no areas with real scientific data yet',
    emptySample: 'No areas are available in this data mode',
    basemapSatelliteDown: 'The Satellite view is not responding',
    basemapGeneralDown: 'The General view is not responding',
    basemapHint: 'You can continue with the other base map while the service recovers.',
    useGeneralView: 'Use General view',
    useSatelliteView: 'Use Satellite view',
    overlayTitle: 'The layer image is not available',
    overlayHint: 'The map still works; you can change layer or try again.',
    close: 'Close',
    closeOverlayAria: 'Dismiss the image unavailable notice',
  },
  errors: {
    modeSample: 'sample',
    modeReal: 'real',
    validatorDetail: 'no validator detail',
    rootPath: '(root)',
    invalidValue: 'invalid value',
    contract: (p: Record<string, string | number>) =>
      `The "${p.mode}" data manifest does not meet the contract: ${p.detail}.`,
    modeMismatch: (p: Record<string, string | number>) =>
      `The "${p.mode}" data manifest declares mode "${p.declared}"; "${p.mode}" was expected.`,
    statusMismatch: (p: Record<string, string | number>) =>
      `The "${p.mode}" manifest contains layer "${p.layerId}" of area "${p.zoneId}" with status "${p.status}"; in ${p.modeName} mode every layer must be "${p.expected}".`,
    unsafeImage: (p: Record<string, string | number>) =>
      `The "${p.mode}" manifest contains a disallowed image path in layer "${p.layerId}" of area "${p.zoneId}": "${p.image}".`,
    unsafeTimeStepImage: (p: Record<string, string | number>) =>
      `The "${p.mode}" manifest contains a disallowed image path in time step ${p.step} of layer "${p.layerId}" of area "${p.zoneId}": "${p.image}".`,
    semantic: (p: Record<string, string | number>) =>
      `The "${p.mode}" data manifest is inconsistent: ${p.issue}.`,
    network: (p: Record<string, string | number>) =>
      `The "${p.mode}" data manifest could not be downloaded. Check your connection and try again.`,
    httpNotFound: (p: Record<string, string | number>) =>
      `The "${p.mode}" data manifest was not found (HTTP 404).`,
    httpStatus: (p: Record<string, string | number>) =>
      `The server returned HTTP ${p.status} while loading the "${p.mode}" data manifest.`,
    invalidJson: (p: Record<string, string | number>) =>
      `The "${p.mode}" data manifest is not valid JSON.`,
    dataLoadFailed: (p: Record<string, string | number>) =>
      `The "${p.mode}" data could not be loaded. Try again.`,
    assetPath: (p: Record<string, string | number>) =>
      `Asset path not allowed: "${p.path}" (${p.reason}).`,
    assetPathReason:
      'it must be a path relative to public/, without a leading "/", "%", "..", ":" or "\\"',
    semantics: {
      zoneSubject: (p: Record<string, string | number>) => `zone "${p.id}" (index ${p.index})`,
      layerSubject: (p: Record<string, string | number>) =>
        `layer "${p.id}" (index ${p.index}) of ${p.zone}`,
      stepSubject: (p: Record<string, string | number>) =>
        `time step ${p.index} (${p.date}) of ${p.layer}`,
      duplicateZone: (p: Record<string, string | number>) => `duplicate zone id: "${p.id}"`,
      noBbox: (p: Record<string, string | number>) => `${p.subject} does not declare a bbox of four numbers`,
      invalidWest: (p: Record<string, string | number>) =>
        `${p.subject} has an invalid bbox: west (${p.west}) must be less than east (${p.east})`,
      invalidSouth: (p: Record<string, string | number>) =>
        `${p.subject} has an invalid bbox: south (${p.south}) must be less than north (${p.north})`,
      outsideWest: (p: Record<string, string | number>) =>
        `${p.subject} has a bbox outside the zone: west (${p.value}) < ${p.limit} - ${p.tolerance}`,
      outsideSouth: (p: Record<string, string | number>) =>
        `${p.subject} has a bbox outside the zone: south (${p.value}) < ${p.limit} - ${p.tolerance}`,
      outsideEast: (p: Record<string, string | number>) =>
        `${p.subject} has a bbox outside the zone: east (${p.value}) > ${p.limit} + ${p.tolerance}`,
      outsideNorth: (p: Record<string, string | number>) =>
        `${p.subject} has a bbox outside the zone: north (${p.value}) > ${p.limit} + ${p.tolerance}`,
      invalidDate: (p: Record<string, string | number>) =>
        `${p.subject} does not declare a real ISO 8601 date (date or date-time with zone)`,
      duplicateDate: (p: Record<string, string | number>) =>
        `${p.subject} repeats the date of an earlier step (${p.previous})`,
      unordered: (p: Record<string, string | number>) =>
        `${p.subject} breaks the strictly increasing order: it is earlier than ${p.previous}`,
      imageMismatch: (p: Record<string, string | number>) =>
        `${p.subject} has a layer.image different from the last time step (${p.image})`,
      bboxMismatch: (p: Record<string, string | number>) =>
        `${p.subject} has a layer.bbox different from the last time step`,
    },
  },
}
