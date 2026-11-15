/**
 * Textos breves de «Relevancia» para Capas: qué es cada variable y para qué
 * sirve en el cultivo. Son textos de interfaz; la descripción técnica completa
 * sigue en los datos del cubo.
 */

export interface VariableRelevance {
  what: string
  crop: string
}

const SOIL_MOISTURE: VariableRelevance = {
  what: 'Agua en los primeros ~5 cm del suelo, estimada por el radar NISAR cada 12 días.',
  crop: 'Muestra cómo se secan los suelos en verano y cómo se recargan tras la lluvia; ayuda a comparar parcelas que retienen más agua.',
}

const RELEVANCE: Record<string, VariableRelevance> = {
  'soil-moisture-all': SOIL_MOISTURE,
  'soil-moisture': {
    what: 'Agua en los primeros ~5 cm del suelo, solo en los píxeles donde la estimación del radar es de calidad recomendada.',
    crop: SOIL_MOISTURE.crop,
  },
  'radar-hh': {
    what: 'Señal de radar que vuelve con polarización horizontal; responde sobre todo al suelo: humedad y rugosidad.',
    crop: 'Ayuda a detectar laboreo y cambios en la superficie del suelo tras lluvias o labores.',
  },
  'radar-hv': {
    what: 'Señal de radar que vuelve con polarización cruzada; aumenta con el volumen de copas y ramas.',
    crop: 'Sirve para distinguir olivar denso de suelo desnudo y seguir cambios en la cubierta leñosa.',
  },
  'radar-hv-hh': {
    what: 'Relación entre las señales HV y HH: resalta la estructura de la vegetación frente al suelo.',
    crop: 'Ayuda a separar plantaciones con más copa de terrenos abiertos o labrados.',
  },
  'insar-coherence': {
    what: 'Estabilidad de la señal radar entre dos pasadas separadas 12 días: alta donde la superficie no cambia, baja donde cambia.',
    crop: 'Detecta actividad en el campo: laboreo, cosecha o vegetación que crece rebajan la coherencia.',
  },
  ndvi: {
    what: 'Índice de verdor calculado con imágenes ópticas Sentinel-2.',
    crop: 'Indica el vigor y la cantidad de vegetación activa; permite comparar el estado de las plantaciones a lo largo de la campaña.',
  },
  ndmi: {
    what: 'Índice del contenido de agua en las hojas, calculado con imágenes ópticas Sentinel-2.',
    crop: 'Ayuda a detectar estrés hídrico de la vegetación antes de que se note en el verdor.',
  },
  elevation: {
    what: 'Altura del terreno sobre el nivel del mar.',
    crop: 'Influye en la temperatura y en el riesgo de heladas: las cotas altas son más frías.',
  },
  slope: {
    what: 'Inclinación del terreno, en grados.',
    crop: 'Condiciona la erosión, la escorrentía del agua de lluvia y la mecanización de las labores.',
  },
  'soil-clay': {
    what: 'Porcentaje de arcilla en los primeros 30 cm del suelo.',
    crop: 'Más arcilla retiene más agua y nutrientes, pero drena peor y se compacta con más facilidad.',
  },
  'soil-sand': {
    what: 'Porcentaje de arena en los primeros 30 cm del suelo.',
    crop: 'Los suelos arenosos drenan rápido y se calientan antes, pero retienen poca agua.',
  },
  'soil-soc': {
    what: 'Carbono orgánico del suelo, ligado a su materia orgánica.',
    crop: 'Mejora la estructura del suelo, su capacidad de retener agua y su fertilidad.',
  },
  'soil-ph': {
    what: 'Acidez o alcalinidad del suelo.',
    crop: 'Determina qué nutrientes están disponibles; cada cultivo tiene un rango de pH óptimo.',
  },
  'climate-precip-annual': {
    what: 'Lluvia media anual del periodo 1991–2020.',
    crop: 'Es la principal fuente de agua en secano y limita qué cultivos y producciones son viables.',
  },
  'climate-tmean-annual': {
    what: 'Temperatura media anual del periodo 1991–2020.',
    crop: 'Marca el ritmo de crecimiento y si la zona encaja con las necesidades térmicas del cultivo.',
  },
  'climate-tmin-coldest': {
    what: 'Media de las temperaturas mínimas del mes más frío (1991–2020).',
    crop: 'Indica la dureza del invierno y el riesgo de daños por frío.',
  },
  'climate-tabsmin': {
    what: 'Temperatura más baja que se alcanza de media cada año (1991–2020).',
    crop: 'Señala el riesgo de heladas fuertes, que pueden dañar árboles y floración.',
  },
  'landcover-agri': {
    what: 'Parte de cada celda dedicada a la agricultura según CORINE Land Cover 2018.',
    crop: 'Separa el campo de cultivo de la sierra, el monte y las zonas urbanas: las comparaciones se hacen sobre esta superficie.',
  },
  'landcover-olive': {
    what: 'Parte de cada celda ocupada hoy por olivares según CORINE Land Cover 2018.',
    crop: 'Muestra dónde se cultiva olivo en la realidad; sirve para contrastar el mapa de aptitud.',
  },
}

export function variableRelevance(id: string | null | undefined): VariableRelevance | null {
  return id ? (RELEVANCE[id] ?? null) : null
}
