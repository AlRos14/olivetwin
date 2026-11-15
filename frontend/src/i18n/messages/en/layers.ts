/** EN · layers section (namespace `layers`). Owner: I18N-UI-CORE (Layers tab, map, time slider, legend, story). */
export const layers = {
  layers: {
    map: {
      label: 'Map of Spain with study areas and scientific layers',
      navLabel: 'Views of Spain',
      spain: 'Spain',
      spainTitle: 'Frame peninsular Spain and the Balearic Islands',
      canaries: 'Canary Islands',
      canariesTitle: 'Frame the Canary Islands archipelago',
      overlayAlt: 'Georeferenced scientific layer of the selected area',
    },
    panel: {
      label: 'Map and layer',
      baseMap: 'Base map',
      satelliteView: 'Satellite view',
      parcelsView: 'Parcels view',
      generalView: 'General view',
      variable: 'Variable',
      chooseVariable: 'Choose a variable…',
      noLayers: 'This area has no scientific layers available.',
      visibility: 'Visibility',
      showLayer: 'Show layer on map',
      opacity: 'Opacity',
      selectVariableHint: 'Select a variable to adjust visibility and opacity.',
      selectZone: 'Select a study area',
    },
    legend: {
      label: 'Legend',
      title: 'Legend',
      unit: 'Unit',
      range: 'Range',
      undeclared: 'Not declared',
      noData: 'No data',
      scaleAria: (p: Record<string, string | number>) => `Colour scale for ${p.title}`,
      syntheticNote: 'Illustrative scale: the colours do not represent real measurements',
      empty: 'Select an area and a variable to see the legend.',
    },
    relevance: {
      label: 'Relevance',
      title: 'Relevance',
      what: 'What it is.',
      crop: 'For the crop.',
    },
    timeSlider: {
      label: 'Time series for the layer',
      acquisitionDate: 'Acquisition date',
      step: (p: Record<string, string | number>) => `Step ${p.current} of ${p.total}`,
      noDate: 'Date not available',
      previous: 'Previous',
      play: 'Play',
      pause: 'Pause',
      next: 'Next',
    },
    groups: {
      nisar: 'Moisture and radar',
      optical: 'Vegetation',
      terrain: 'Relief',
      soil: 'Soil',
      climate: 'Climate',
      landcover: 'Land cover',
    },
    variables: {
      soilMoistureAll: 'Soil moisture',
      soilMoisture: 'Soil moisture (reliable)',
      layerSoilMoisture: 'Soil moisture',
      radarHh: 'Radar HH',
      radarHv: 'Radar HV',
      radarHvHh: 'HV/HH ratio',
      insarCoherence: 'Radar coherence',
      ndvi: 'Vegetation (NDVI)',
      ndmi: 'Water in vegetation (NDMI)',
      elevation: 'Elevation',
      slope: 'Slope',
      soilClay: 'Clay',
      soilSand: 'Sand',
      soilSoc: 'Organic carbon',
      soilPh: 'Soil pH',
      climatePrecipAnnual: 'Annual rainfall',
      climateTmeanAnnual: 'Mean temperature',
      climateTminColdest: 'Coldest-month minimum',
      climateTabsmin: 'Absolute minimum',
      landcoverAgri: 'Agricultural area',
      landcoverOlive: 'Current olive groves',
    },
    relevanceTexts: {
      soilMoistureAll: {
        what: 'Water in the top ~5 cm of the soil, estimated by the NISAR radar every 12 days.',
        crop: 'Shows how soils dry out in summer and how they recharge after rain; it helps compare plots that hold more water.',
      },
      soilMoisture: {
        what: 'Water in the top ~5 cm of the soil, only in the pixels where the radar estimate is of recommended quality.',
        crop: 'Shows how soils dry out in summer and how they recharge after rain; it helps compare plots that hold more water.',
      },
      radarHh: {
        what: 'Radar signal returning with horizontal polarisation; it responds mainly to the soil: moisture and roughness.',
        crop: 'Helps detect tillage and changes in the soil surface after rain or field work.',
      },
      radarHv: {
        what: 'Radar signal returning with cross polarisation; it increases with the volume of canopies and branches.',
        crop: 'Serves to tell dense olive groves from bare soil and to track changes in the woody cover.',
      },
      radarHvHh: {
        what: 'Ratio between the HV and HH signals: it highlights vegetation structure against the soil.',
        crop: 'Helps separate plantations with more canopy from open or ploughed land.',
      },
      insarCoherence: {
        what: 'Stability of the radar signal between two passes 12 days apart: high where the surface does not change, low where it does.',
        crop: 'Detects activity in the field: tillage, harvest or growing vegetation lower coherence.',
      },
      ndvi: {
        what: 'Greenness index computed from Sentinel-2 optical images.',
        crop: 'Indicates the vigour and amount of active vegetation; it allows comparing the state of plantations throughout the season.',
      },
      ndmi: {
        what: 'Index of the water content in leaves, computed from Sentinel-2 optical images.',
        crop: 'Helps detect water stress in vegetation before it shows in greenness.',
      },
      elevation: {
        what: 'Height of the terrain above sea level.',
        crop: 'Influences temperature and frost risk: higher elevations are colder.',
      },
      slope: {
        what: 'Inclination of the terrain, in degrees.',
        crop: 'Conditions erosion, rain runoff and the mechanisation of field work.',
      },
      soilClay: {
        what: 'Percentage of clay in the top 30 cm of the soil.',
        crop: 'More clay holds more water and nutrients, but drains worse and compacts more easily.',
      },
      soilSand: {
        what: 'Percentage of sand in the top 30 cm of the soil.',
        crop: 'Sandy soils drain quickly and warm earlier, but hold little water.',
      },
      soilSoc: {
        what: 'Soil organic carbon, linked to its organic matter.',
        crop: 'Improves soil structure, its water-holding capacity and its fertility.',
      },
      soilPh: {
        what: 'Acidity or alkalinity of the soil.',
        crop: 'Determines which nutrients are available; every crop has an optimal pH range.',
      },
      climatePrecipAnnual: {
        what: 'Mean annual rainfall for the period 1991–2020.',
        crop: 'It is the main water source on rainfed land and limits which crops and yields are viable.',
      },
      climateTmeanAnnual: {
        what: 'Mean annual temperature for the period 1991–2020.',
        crop: 'Sets the pace of growth and whether the area matches the crop thermal requirements.',
      },
      climateTminColdest: {
        what: 'Mean of the minimum temperatures of the coldest month (1991–2020).',
        crop: 'Indicates how harsh the winter is and the risk of cold damage.',
      },
      climateTabsmin: {
        what: 'Lowest temperature reached on average each year (1991–2020).',
        crop: 'Points to the risk of severe frosts, which can damage trees and flowering.',
      },
      landcoverAgri: {
        what: 'Share of each cell devoted to agriculture according to CORINE Land Cover 2018.',
        crop: 'Separates farmland from the sierra, scrub and urban areas: comparisons are made over this surface.',
      },
      landcoverOlive: {
        what: 'Share of each cell currently occupied by olive groves according to CORINE Land Cover 2018.',
        crop: 'Shows where olives are actually grown; it serves to contrast the suitability map.',
      },
    },
    story: {
      label: 'Project story',
      title: 'Two olive groves that dance differently',
      intro: {
        before:
          'In Jaén and Toledo there are neighbouring olive groves, apparently alike, that harvest very different amounts year after year. OliveTwin uses radar from the ',
        after:
          ' mission (NASA-ISRO) to track how the surface of those groves changes during the summer of 2026 and to look for clues as to why.',
      },
      challenge: {
        title: 'The challenge',
        before: 'The “',
        link: 'Dancing with the SARs',
        body:
          '” challenge calls for an interactive application that uses NISAR data to track and visualise changes on the Earth’s surface. Ours is ',
        emphasis: 'soil moisture in agricultural areas',
        after: ', set in context with vegetation, relief, soil and climate.',
      },
      why: {
        title: 'Why radar',
        radar1: {
          before: 'It is ',
          strong: 'active',
          after:
            ' remote sensing: NISAR emits its own L-band pulse and observes by day, by night and through clouds.',
        },
        radar2: {
          before: 'The signal depends above all on the ',
          strong: 'dielectric constant',
          mid: ' (water drives it up) and on the ',
          strong2: 'roughness and structure',
          after: ' of the surface.',
        },
        radar3: {
          before: 'Cross polarisation (',
          mid: ') responds to volume scattering, such as that of canopies; co-polar (',
          after: ') is more sensitive to the soil.',
        },
        radar4: {
          before: 'The ',
          strong: 'SME2',
          after:
            ' product turns series of that signal into moisture in the top ~5 cm, with 200 m pixels.',
        },
      },
      hypotheses: {
        title: 'Hypotheses the app lets you explore',
        h1: {
          lead: 'The summer dry-down.',
          body:
            ' On rainfed land, surface moisture should fall from June to September and rebound after storms. Check it with the moisture chart and the rainfall bars, or with the “Change” mode.',
        },
        h2: {
          lead: 'Retaining water.',
          body:
            ' Areas that dry more slowly between rains might have soils with a greater water-holding capacity or some water input. Cross moisture, soil texture and slope.',
        },
        h3: {
          lead: 'Dense canopy versus bare soil.',
          body:
            ' Denser plantations should return more HV and more NDVI. If radar and optical do not agree, what is changing, structure or greenness?',
        },
        h4: {
          lead: 'Relief rules.',
          body:
            ' On steep slopes water runs off sooner and mechanisation is harder. Crop suitability maps show which factor limits each part of the area.',
        },
      },
      actions: {
        exploreAnalysis: 'Explore the analysis',
        compareAreas: 'Compare two areas',
      },
      next: {
        title: 'What would come next',
        body:
          'Validated SME2 products and longer series, per-plot harvest data under a compatible licence to validate the suitability, SIGPAC boundaries to work plot by plot and InSAR deformation to study groundwater extraction.',
      },
    },
  },
}
