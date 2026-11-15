<script setup lang="ts">
import { locale, setLocale, t, type Locale, type MessageKey } from '../i18n'

/**
 * Selector de idioma discreto de la cabecera: `EN | ES`, texto pequeño y sin
 * banderas. Por defecto inglés (lo fija el núcleo i18n); la elección se
 * persiste en localStorage y se refleja en `<html lang>`.
 */
interface LanguageOption {
  value: Locale
  short: string
  /** Nombre completo del idioma, para el tooltip y el lector de pantalla. */
  titleKey: MessageKey
}

const OPTIONS: readonly LanguageOption[] = [
  { value: 'en', short: 'EN', titleKey: 'language.en' },
  { value: 'es', short: 'ES', titleKey: 'language.es' },
]

function isActive(value: Locale): boolean {
  return locale.value === value
}

function choose(value: Locale): void {
  if (!isActive(value)) setLocale(value)
}
</script>

<template>
  <div class="ot-lang" role="group" :aria-label="t('language.label')">
    <button
      v-for="option in OPTIONS"
      :key="option.value"
      type="button"
      class="ot-lang__button"
      :class="{ 'is-selected': isActive(option.value) }"
      :aria-pressed="isActive(option.value) ? 'true' : 'false'"
      :title="t(option.titleKey)"
      :lang="option.value"
      @click="choose(option.value)"
    >
      {{ option.short }}
    </button>
  </div>
</template>

<style scoped>
.ot-lang {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 1px;
  padding: 1px;
  background: var(--ot-surface-muted);
  border: 1px solid var(--ot-border);
  border-radius: 999px;
}

.ot-lang__button {
  min-width: 2rem;
  padding: 0.1rem 0.4rem;
  font: inherit;
  font-size: 0.68rem;
  font-weight: 650;
  line-height: 1.4;
  letter-spacing: 0.03em;
  color: var(--ot-text-muted);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 999px;
}

.ot-lang__button:hover {
  color: var(--ot-text);
  background: rgba(40, 96, 58, 0.08);
}

.ot-lang__button.is-selected {
  color: var(--ot-accent-strong);
  background: var(--ot-surface);
  box-shadow: inset 0 0 0 1px var(--ot-accent);
}

.ot-lang__button:focus-visible {
  outline: 3px solid var(--ot-focus);
  outline-offset: 2px;
}

@media (max-width: 767px) {
  .ot-lang__button {
    min-width: 2.25rem;
    padding: 0.15rem 0.45rem;
  }
}
</style>
