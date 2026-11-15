/** ES · sección layers. Misma forma que en/layers.ts. */
import type { Messages } from '../../index'

export const layers: Pick<Messages, 'layers'> = {
  layers: {
    map: {
      label: 'Mapa de España con zonas de estudio y capas científicas',
      navLabel: 'Vistas de España',
      spain: 'España',
      spainTitle: 'Encuadrar la Península y Baleares',
      canaries: 'Canarias',
      canariesTitle: 'Encuadrar el archipiélago canario',
      overlayAlt: 'Capa científica georreferenciada de la zona seleccionada',
    },
    panel: {
      label: 'Mapa y capa',
      baseMap: 'Mapa base',
      satelliteView: 'Vista Satelital',
      parcelsView: 'Vista Parcelas',
      generalView: 'Vista General',
      variable: 'Variable',
      chooseVariable: 'Elige una variable…',
      noLayers: 'Esta zona no tiene capas científicas disponibles.',
      visibility: 'Visibilidad',
      showLayer: 'Mostrar capa en el mapa',
      opacity: 'Opacidad',
      selectVariableHint: 'Selecciona una variable para ajustar la visibilidad y la opacidad.',
      selectZone: 'Selecciona una zona de estudio',
    },
    legend: {
      label: 'Leyenda',
      title: 'Leyenda',
      unit: 'Unidad',
      range: 'Rango',
      undeclared: 'No declarado',
      noData: 'Sin dato',
      scaleAria: (p) => `Escala de color de ${p.title}`,
      syntheticNote: 'Escala ilustrativa: los colores no representan medidas reales',
      empty: 'Selecciona una zona y una variable para ver la leyenda.',
    },
    relevance: {
      label: 'Relevancia',
      title: 'Relevancia',
      what: 'Qué es.',
      crop: 'Para el cultivo.',
    },
    timeSlider: {
      label: 'Línea temporal de la capa',
      acquisitionDate: 'Fecha de adquisición',
      step: (p) => `Paso ${p.current} de ${p.total}`,
      noDate: 'Fecha no disponible',
      previous: 'Anterior',
      play: 'Reproducir',
      pause: 'Pausar',
      next: 'Siguiente',
    },
    groups: {
      nisar: 'Humedad y radar',
      optical: 'Vegetación',
      terrain: 'Relieve',
      soil: 'Suelo',
      climate: 'Clima',
      landcover: 'Usos del suelo',
    },
    variables: {
      soilMoistureAll: 'Humedad del suelo',
      soilMoisture: 'Humedad del suelo (fiable)',
      layerSoilMoisture: 'Humedad del suelo',
      radarHh: 'Radar HH',
      radarHv: 'Radar HV',
      radarHvHh: 'Relación HV/HH',
      insarCoherence: 'Coherencia radar',
      ndvi: 'Vegetación (NDVI)',
      ndmi: 'Agua en la vegetación (NDMI)',
      elevation: 'Altitud',
      slope: 'Pendiente',
      soilClay: 'Arcilla',
      soilSand: 'Arena',
      soilSoc: 'Carbono orgánico',
      soilPh: 'pH del suelo',
      climatePrecipAnnual: 'Lluvia anual',
      climateTmeanAnnual: 'Temperatura media',
      climateTminColdest: 'Mínima del mes más frío',
      climateTabsmin: 'Mínima absoluta',
      landcoverAgri: 'Superficie agrícola',
      landcoverOlive: 'Olivar actual',
    },
    relevanceTexts: {
      soilMoistureAll: {
        what: 'Agua en los primeros ~5 cm del suelo, estimada por el radar NISAR cada 12 días.',
        crop: 'Muestra cómo se secan los suelos en verano y cómo se recargan tras la lluvia; ayuda a comparar parcelas que retienen más agua.',
      },
      soilMoisture: {
        what: 'Agua en los primeros ~5 cm del suelo, solo en los píxeles donde la estimación del radar es de calidad recomendada.',
        crop: 'Muestra cómo se secan los suelos en verano y cómo se recargan tras la lluvia; ayuda a comparar parcelas que retienen más agua.',
      },
      radarHh: {
        what: 'Señal de radar que vuelve con polarización horizontal; responde sobre todo al suelo: humedad y rugosidad.',
        crop: 'Ayuda a detectar laboreo y cambios en la superficie del suelo tras lluvias o labores.',
      },
      radarHv: {
        what: 'Señal de radar que vuelve con polarización cruzada; aumenta con el volumen de copas y ramas.',
        crop: 'Sirve para distinguir olivar denso de suelo desnudo y seguir cambios en la cubierta leñosa.',
      },
      radarHvHh: {
        what: 'Relación entre las señales HV y HH: resalta la estructura de la vegetación frente al suelo.',
        crop: 'Ayuda a separar plantaciones con más copa de terrenos abiertos o labrados.',
      },
      insarCoherence: {
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
      soilClay: {
        what: 'Porcentaje de arcilla en los primeros 30 cm del suelo.',
        crop: 'Más arcilla retiene más agua y nutrientes, pero drena peor y se compacta con más facilidad.',
      },
      soilSand: {
        what: 'Porcentaje de arena en los primeros 30 cm del suelo.',
        crop: 'Los suelos arenosos drenan rápido y se calientan antes, pero retienen poca agua.',
      },
      soilSoc: {
        what: 'Carbono orgánico del suelo, ligado a su materia orgánica.',
        crop: 'Mejora la estructura del suelo, su capacidad de retener agua y su fertilidad.',
      },
      soilPh: {
        what: 'Acidez o alcalinidad del suelo.',
        crop: 'Determina qué nutrientes están disponibles; cada cultivo tiene un rango de pH óptimo.',
      },
      climatePrecipAnnual: {
        what: 'Lluvia media anual del periodo 1991–2020.',
        crop: 'Es la principal fuente de agua en secano y limita qué cultivos y producciones son viables.',
      },
      climateTmeanAnnual: {
        what: 'Temperatura media anual del periodo 1991–2020.',
        crop: 'Marca el ritmo de crecimiento y si la zona encaja con las necesidades térmicas del cultivo.',
      },
      climateTminColdest: {
        what: 'Media de las temperaturas mínimas del mes más frío (1991–2020).',
        crop: 'Indica la dureza del invierno y el riesgo de daños por frío.',
      },
      climateTabsmin: {
        what: 'Temperatura más baja que se alcanza de media cada año (1991–2020).',
        crop: 'Señala el riesgo de heladas fuertes, que pueden dañar árboles y floración.',
      },
      landcoverAgri: {
        what: 'Parte de cada celda dedicada a la agricultura según CORINE Land Cover 2018.',
        crop: 'Separa el campo de cultivo de la sierra, el monte y las zonas urbanas: las comparaciones se hacen sobre esta superficie.',
      },
      landcoverOlive: {
        what: 'Parte de cada celda ocupada hoy por olivares según CORINE Land Cover 2018.',
        crop: 'Muestra dónde se cultiva olivo en la realidad; sirve para contrastar el mapa de aptitud.',
      },
    },
    story: {
      label: 'Historia del proyecto',
      title: 'Dos olivares que bailan distinto',
      intro: {
        before:
          'En Jaén y Toledo hay olivares vecinos, aparentemente iguales, que cosechan cantidades muy distintas año tras año. OliveTwin usa el radar de la misión ',
        after:
          ' (NASA-ISRO) para seguir cómo cambia la superficie de esos olivares durante el verano de 2026 y buscar pistas de por qué.',
      },
      challenge: {
        title: 'El reto',
        before: '«',
        link: 'Dancing with the SARs',
        body:
          '» pide una aplicación interactiva que use datos NISAR para seguir y visualizar cambios en la superficie terrestre. El nuestro es la ',
        emphasis: 'humedad del suelo en zonas agrícolas',
        after: ', puesta en contexto con vegetación, relieve, suelo y clima.',
      },
      why: {
        title: 'Por qué radar',
        radar1: {
          before: 'Es teledetección ',
          strong: 'activa',
          after: ': NISAR emite su propio pulso en banda L y observa de día, de noche y con nubes.',
        },
        radar2: {
          before: 'La señal depende sobre todo de la ',
          strong: 'constante dieléctrica',
          mid: ' (el agua la dispara) y de la ',
          strong2: 'rugosidad y estructura',
          after: ' de la superficie.',
        },
        radar3: {
          before: 'La polarización cruzada (',
          mid: ') responde a la dispersión de volumen, como la de las copas; la co-polar (',
          after: ') es más sensible al suelo.',
        },
        radar4: {
          before: 'El producto ',
          strong: 'SME2',
          after: ' convierte series de esa señal en humedad de los ~5 cm superficiales, con píxeles de 200 m.',
        },
      },
      hypotheses: {
        title: 'Hipótesis que la app permite explorar',
        h1: {
          lead: 'El secado del verano.',
          body:
            ' En secano, la humedad superficial debería bajar de junio a septiembre y repuntar tras las tormentas. Compruébalo con la gráfica de humedad y las barras de lluvia, o con el modo «Cambio».',
        },
        h2: {
          lead: 'Retener agua.',
          body:
            ' Zonas que se secan más despacio entre lluvias podrían tener suelos con más capacidad de retención o algún aporte de agua. Cruza humedad, textura del suelo y pendiente.',
        },
        h3: {
          lead: 'Copa densa frente a suelo desnudo.',
          body:
            ' Plantaciones más densas deberían devolver más HV y más NDVI. Si radar y óptico no coinciden, ¿qué está cambiando, la estructura o el verdor?',
        },
        h4: {
          lead: 'El relieve manda.',
          body:
            ' En laderas pronunciadas el agua escurre antes y la mecanización es más difícil. Los mapas de aptitud por cultivo muestran qué factor limita en cada parte de la zona.',
        },
      },
      actions: {
        exploreAnalysis: 'Explorar el análisis',
        compareAreas: 'Comparar dos zonas',
      },
      next: {
        title: 'Qué vendría después',
        body:
          'Productos SME2 validados y series más largas, datos de cosecha por parcela con licencia compatible para validar la aptitud, recintos SIGPAC para trabajar por parcela y deformación InSAR para estudiar la extracción de agua subterránea.',
      },
    },
  },
}
