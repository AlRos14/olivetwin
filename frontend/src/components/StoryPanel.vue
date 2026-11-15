<script setup lang="ts">
import '../styles/analysis.css'
import { t } from '../i18n'

/**
 * Relato del proyecto para el reto «Dancing with the SARs» (NASA Space Apps
 * 2026): qué se observa, por qué radar e hipótesis físicas a contrastar. Las
 * hipótesis se formulan como preguntas; ninguna es un resultado.
 */
const emit = defineEmits<{ navigate: [tab: 'analysis' | 'compare'] }>()
</script>

<template>
  <section class="ot-card ot-story" :aria-label="t('layers.story.label')">
    <h2 class="ot-story__title">{{ t('layers.story.title') }}</h2>
    <p>
      {{ t('layers.story.intro.before') }}<strong>NISAR</strong>{{ t('layers.story.intro.after') }}
    </p>

    <h3 class="ot-story__h">{{ t('layers.story.challenge.title') }}</h3>
    <p>
      {{ t('layers.story.challenge.before') }}<a href="https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/" target="_blank" rel="noopener noreferrer">{{ t('layers.story.challenge.link') }}</a>{{ t('layers.story.challenge.body') }}<strong>{{ t('layers.story.challenge.emphasis') }}</strong>{{ t('layers.story.challenge.after') }}
    </p>

    <h3 class="ot-story__h">{{ t('layers.story.why.title') }}</h3>
    <ul class="ot-story__list">
      <li>
        {{ t('layers.story.why.radar1.before') }}<strong>{{ t('layers.story.why.radar1.strong') }}</strong>{{ t('layers.story.why.radar1.after') }}
      </li>
      <li>
        {{ t('layers.story.why.radar2.before') }}<strong>{{ t('layers.story.why.radar2.strong') }}</strong>{{ t('layers.story.why.radar2.mid') }}<strong>{{ t('layers.story.why.radar2.strong2') }}</strong>{{ t('layers.story.why.radar2.after') }}
      </li>
      <li>
        {{ t('layers.story.why.radar3.before') }}<strong>HV</strong>{{ t('layers.story.why.radar3.mid') }}<strong>HH</strong>{{ t('layers.story.why.radar3.after') }}
      </li>
      <li>
        {{ t('layers.story.why.radar4.before') }}<strong>{{ t('layers.story.why.radar4.strong') }}</strong>{{ t('layers.story.why.radar4.after') }}
      </li>
    </ul>

    <h3 class="ot-story__h">{{ t('layers.story.hypotheses.title') }}</h3>
    <ol class="ot-story__list">
      <li>
        <strong>{{ t('layers.story.hypotheses.h1.lead') }}</strong>{{ t('layers.story.hypotheses.h1.body') }}
      </li>
      <li>
        <strong>{{ t('layers.story.hypotheses.h2.lead') }}</strong>{{ t('layers.story.hypotheses.h2.body') }}
      </li>
      <li>
        <strong>{{ t('layers.story.hypotheses.h3.lead') }}</strong>{{ t('layers.story.hypotheses.h3.body') }}
      </li>
      <li>
        <strong>{{ t('layers.story.hypotheses.h4.lead') }}</strong>{{ t('layers.story.hypotheses.h4.body') }}
      </li>
    </ol>

    <div class="ot-story__actions">
      <button type="button" class="ot-button" @click="emit('navigate', 'analysis')">
        {{ t('layers.story.actions.exploreAnalysis') }}
      </button>
      <button type="button" class="ot-button" @click="emit('navigate', 'compare')">
        {{ t('layers.story.actions.compareAreas') }}
      </button>
    </div>

    <h3 class="ot-story__h">{{ t('layers.story.next.title') }}</h3>
    <p>
      {{ t('layers.story.next.body') }}
    </p>
  </section>
</template>
