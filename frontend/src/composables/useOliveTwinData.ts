/**
 * Estado de datos de OliveTwin para la UI (WP-04, interfaz C0 §2).
 *
 * - `vm` es reactivo pero se expone como `readonly`: la UI solo lee.
 * - Cada cambio de modo o `reload` invalida la carga anterior con un contador
 *   y un `AbortController`; una respuesta tardía nunca sobrescribe el estado
 *   del modo actual.
 * - Un error nunca cae de vuelta a `sample`; `zones: []` en real es `'empty'`.
 * - `overlay` solo existe si zona y capa pertenecen al manifiesto activo y la
 *   URL ya está resuelta con `import.meta.env.BASE_URL`.
 */
import { computed, readonly, reactive } from 'vue'
import type { ComputedRef, DeepReadonly } from 'vue'

import type {
  ActiveOverlay,
  DataMode,
  LayerId,
  OliveTwinActions,
  OliveTwinViewModel,
  StudyLayer,
  StudyZone,
} from '../types/manifest'
import { resolveAssetUrl } from '../services/assetUrl'
import {
  isAbortError,
  loadManifest,
  ManifestLoadError,
} from '../services/manifestService'

export interface UseOliveTwinDataOptions {
  /** Modo inicial; `sample` por defecto (decisión de producto P0). */
  initialMode?: DataMode
  /** `fetch` alternativo, útil en tests; por defecto el global. */
  fetchImpl?: typeof fetch
}

export interface UseOliveTwinDataReturn extends OliveTwinActions {
  vm: DeepReadonly<OliveTwinViewModel>
  selectedZone: ComputedRef<StudyZone | null>
  selectedLayer: ComputedRef<StudyLayer | null>
  overlay: ComputedRef<ActiveOverlay | null>
}

function errorMessageFor(error: unknown, mode: DataMode): string {
  if (error instanceof ManifestLoadError) {
    return error.message
  }
  return `No se pudieron cargar los datos «${mode}». Vuelve a intentarlo.`
}

export function useOliveTwinData(
  options: UseOliveTwinDataOptions = {},
): UseOliveTwinDataReturn {
  const state = reactive<OliveTwinViewModel>({
    dataMode: options.initialMode ?? 'sample',
    loadStatus: 'loading',
    zones: [],
    selectedZoneId: null,
    selectedLayerId: null,
    overlayVisible: true,
    overlayOpacity: 0.7,
    errorMessage: null,
  })

  let requestCounter = 0
  let activeController: AbortController | null = null

  const selectedZone = computed<StudyZone | null>(
    () => state.zones.find((zone) => zone.id === state.selectedZoneId) ?? null,
  )

  const selectedLayer = computed<StudyLayer | null>(() => {
    const zone = selectedZone.value
    if (!zone || state.selectedLayerId === null) {
      return null
    }
    return zone.layers.find((layer) => layer.id === state.selectedLayerId) ?? null
  })

  /**
   * `null` si no hay selección válida en el manifiesto activo. La ruta ya
   * validada al cargar se resuelve aquí para que los componentes no compongan
   * URLs; si un manifiesto manipulado hubiera pasado una ruta insegura, el
   * overlay no se pinta en lugar de exponer una URL fuera del despliegue.
   */
  const overlay = computed<ActiveOverlay | null>(() => {
    const zone = selectedZone.value
    const layer = selectedLayer.value
    if (!zone || !layer) {
      return null
    }
    let url: string
    try {
      url = resolveAssetUrl(layer.image)
    } catch {
      return null
    }
    return {
      zoneId: zone.id,
      layerId: layer.id,
      url,
      bbox: layer.bbox,
      opacity: state.overlayOpacity,
      visible: state.overlayVisible,
      status: layer.status,
    }
  })

  async function load(mode: DataMode): Promise<void> {
    requestCounter += 1
    const requestId = requestCounter

    activeController?.abort()
    const controller = new AbortController()
    activeController = controller

    // Limpieza inmediata: no se muestran zonas ni overlays del modo anterior
    // mientras llega el manifiesto nuevo.
    state.loadStatus = 'loading'
    state.errorMessage = null
    state.zones = []
    state.selectedZoneId = null
    state.selectedLayerId = null

    try {
      const result = await loadManifest(mode, {
        signal: controller.signal,
        fetchImpl: options.fetchImpl,
      })
      if (requestId !== requestCounter) {
        return
      }
      state.zones = result.manifest.zones
      state.loadStatus = result.status
      state.errorMessage = null
    } catch (error) {
      if (requestId !== requestCounter || isAbortError(error)) {
        return
      }
      // Sin fallback: el modo solicitado queda en error y sin zonas.
      state.zones = []
      state.selectedZoneId = null
      state.selectedLayerId = null
      state.loadStatus = 'error'
      state.errorMessage = errorMessageFor(error, mode)
    }
  }

  function setDataMode(mode: DataMode): void {
    if (mode === state.dataMode) {
      return
    }
    state.dataMode = mode
    void load(mode)
  }

  function selectZone(zoneId: string | null): void {
    if (zoneId === null) {
      state.selectedZoneId = null
      state.selectedLayerId = null
      return
    }
    const zone = state.zones.find((candidate) => candidate.id === zoneId)
    if (!zone) {
      // Un id inexistente en el manifiesto activo se ignora.
      return
    }
    state.selectedZoneId = zone.id
    state.selectedLayerId = zone.layers[0]?.id ?? null
  }

  function selectLayer(layerId: LayerId | null): void {
    if (layerId === null) {
      state.selectedLayerId = null
      return
    }
    const zone = selectedZone.value
    if (!zone || !zone.layers.some((layer) => layer.id === layerId)) {
      return
    }
    state.selectedLayerId = layerId
  }

  function setOpacity(opacity: number): void {
    if (Number.isNaN(opacity)) {
      return
    }
    state.overlayOpacity = Math.min(1, Math.max(0, opacity))
  }

  function setOverlayVisible(visible: boolean): void {
    state.overlayVisible = visible
  }

  function reload(): void {
    void load(state.dataMode)
  }

  // Carga inicial al crear el composable (el modo por defecto es sample).
  void load(state.dataMode)

  return {
    vm: readonly(state),
    selectedZone,
    selectedLayer,
    overlay,
    setDataMode,
    selectZone,
    selectLayer,
    setOpacity,
    setOverlayVisible,
    reload,
  }
}
