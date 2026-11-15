import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { loadDataCatalog } from './i18n/dataText'

// Textos de los datos publicados (manifest.json / analysis.json): el catálogo
// inglés se carga una vez al arrancar. Si falla, la interfaz muestra el texto
// original en español en lugar de dejarlo vacío.
void loadDataCatalog('real')

createApp(App).mount('#app')
