import { DEFAULT_LAYOUT, parseConfiguration, type Configuration } from './sim/layout.ts'

export const CONFIGURATION_KEY = 'kinesis.configuration.v1'
export function loadConfiguration(): { configuration: Configuration; warning: string } {
  const fallback: Configuration = { version: 1, seed: 1, count: 20, layout: DEFAULT_LAYOUT }
  try {
    const saved = localStorage.getItem(CONFIGURATION_KEY)
    return { configuration: saved ? parseConfiguration(JSON.parse(saved)) : fallback, warning: '' }
  } catch {
    return { configuration: fallback, warning: 'La configuration locale est illisible ou inaccessible. Le plan de démonstration a été chargé ; la sauvegarde existante est conservée.' }
  }
}

export function saveConfiguration(configuration: Configuration): string {
  try {
    const checked = parseConfiguration(configuration)
    localStorage.setItem(CONFIGURATION_KEY, JSON.stringify(checked))
    return ''
  } catch {
    return 'Le plan est appliqué, mais sa sauvegarde locale a échoué. Garder cette page ouverte pour le conserver.'
  }
}
