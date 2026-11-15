/** ES · core. Misma forma que en/core.ts. */
import type { Messages } from '../../index'

export const core: Pick<Messages, 'app' | 'language'> = {
  app: {
    title: 'OliveTwin',
    subtitle: 'Radar NISAR, vegetación, suelo y clima · datos NISAR PROVISIONALES',
  },
  language: {
    label: 'Idioma',
    en: 'English',
    es: 'Español',
  },
}
