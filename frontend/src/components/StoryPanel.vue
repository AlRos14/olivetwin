<script setup lang="ts">
import '../styles/analysis.css'

/**
 * Relato del proyecto para el reto «Dancing with the SARs» (NASA Space Apps
 * 2026): qué se observa, por qué radar e hipótesis físicas a contrastar. Las
 * hipótesis se formulan como preguntas; ninguna es un resultado.
 */
const emit = defineEmits<{ navigate: [tab: 'analysis' | 'compare'] }>()
</script>

<template>
  <section class="ot-card ot-story" aria-label="Historia del proyecto">
    <h2 class="ot-story__title">Dos olivares que bailan distinto</h2>
    <p>
      En Jaén y Toledo hay olivares vecinos, aparentemente iguales, que cosechan cantidades muy distintas año tras año.
      OliveTwin usa el radar de la misión <strong>NISAR</strong> (NASA-ISRO) para seguir cómo cambia la superficie de esos
      olivares durante el verano de 2026 y buscar pistas de por qué.
    </p>

    <h3 class="ot-story__h">El reto</h3>
    <p>
      «<a href="https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/" target="_blank" rel="noopener noreferrer">Dancing with the SARs</a>»
      pide una aplicación interactiva que use datos NISAR para seguir y visualizar cambios en la superficie terrestre.
      El nuestro es la <strong>humedad del suelo en zonas agrícolas</strong>, puesta en contexto con vegetación, relieve,
      suelo y clima.
    </p>

    <h3 class="ot-story__h">Por qué radar</h3>
    <ul class="ot-story__list">
      <li>Es teledetección <strong>activa</strong>: NISAR emite su propio pulso en banda L y observa de día, de noche y con nubes.</li>
      <li>La señal depende sobre todo de la <strong>constante dieléctrica</strong> (el agua la dispara) y de la <strong>rugosidad y estructura</strong> de la superficie.</li>
      <li>La polarización cruzada (<strong>HV</strong>) responde a la dispersión de volumen, como la de las copas; la co-polar (<strong>HH</strong>) es más sensible al suelo.</li>
      <li>El producto <strong>SME2</strong> convierte series de esa señal en humedad de los ~5 cm superficiales, con píxeles de 200 m.</li>
    </ul>

    <h3 class="ot-story__h">Hipótesis que la app permite explorar</h3>
    <ol class="ot-story__list">
      <li>
        <strong>El secado del verano.</strong> En secano, la humedad superficial debería bajar de junio a septiembre y repuntar tras
        las tormentas. Compruébalo con la gráfica de humedad y las barras de lluvia, o con el modo «Cambio».
      </li>
      <li>
        <strong>Retener agua.</strong> Zonas que se secan más despacio entre lluvias podrían tener suelos con más capacidad de
        retención o algún aporte de agua. Cruza humedad, textura del suelo y pendiente.
      </li>
      <li>
        <strong>Copa densa frente a suelo desnudo.</strong> Plantaciones más densas deberían devolver más HV y más NDVI.
        Si radar y óptico no coinciden, ¿qué está cambiando, la estructura o el verdor?
      </li>
      <li>
        <strong>El relieve manda.</strong> En laderas pronunciadas el agua escurre antes y la mecanización es más difícil.
        Los mapas de aptitud por cultivo muestran qué factor limita en cada parte de la zona.
      </li>
    </ol>

    <div class="ot-story__actions">
      <button type="button" class="ot-button" @click="emit('navigate', 'analysis')">Explorar el análisis</button>
      <button type="button" class="ot-button" @click="emit('navigate', 'compare')">Comparar dos zonas</button>
    </div>

    <h3 class="ot-story__h">Qué vendría después</h3>
    <p>
      Productos SME2 validados y series más largas, datos de cosecha por parcela con licencia compatible para validar la aptitud,
      recintos SIGPAC para trabajar por parcela y deformación InSAR para estudiar la extracción de agua subterránea.
    </p>
  </section>
</template>
