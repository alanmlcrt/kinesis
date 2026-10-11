import { DEFAULT_LAYOUT, parseConfiguration, parseLayout, type Configuration, type Layout } from './sim/layout.ts'

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

// Plans nommés pour les comparaisons. Une entrée illisible est écartée sans effacer la sauvegarde.
export const PLANS_KEY = 'kinesis.plans.v1'
export type NamedPlan = { name: string; layout: Layout }

export function loadPlans(): { plans: NamedPlan[]; warning: string } {
  try {
    const saved = localStorage.getItem(PLANS_KEY)
    const list: unknown = saved ? JSON.parse(saved) : []
    if (!Array.isArray(list)) throw new RangeError()
    const plans: NamedPlan[] = []
    for (const item of list) {
      try {
        const name = String((item as NamedPlan).name).trim()
        if (name && name.length <= 40 && !plans.some((p) => p.name === name)) plans.push({ name, layout: parseLayout((item as NamedPlan).layout) })
      } catch { /* entrée invalide ignorée, signalée ci-dessous */ }
    }
    return { plans, warning: plans.length === list.length ? '' : 'Des plans enregistrés sont illisibles et ont été ignorés.' }
  } catch {
    return { plans: [], warning: 'Les plans enregistrés sont illisibles ou inaccessibles.' }
  }
}

export function savePlans(plans: NamedPlan[]): string {
  try {
    localStorage.setItem(PLANS_KEY, JSON.stringify(plans.map((p) => ({ name: p.name, layout: parseLayout(p.layout) }))))
    return ''
  } catch {
    return 'L’enregistrement local des plans a échoué : ils restent disponibles tant que la page est ouverte.'
  }
}
