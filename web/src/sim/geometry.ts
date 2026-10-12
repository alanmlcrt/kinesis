// Contrat géométrique du modèle illustratif, partagé par moteur, plan et scène.
export const LEVEL_HEIGHT = 1.4
export const GEOMETRY = {
  robotCenterY: .2, carriedBinOffsetY: .45,
  robotHalfWidth: .35, robotHalfDepth: .35,
  binHalfWidth: .34, binHalfDepth: .365, binBottomY: -.2225, binTopY: .232,
  stockOffsetX: 1, guideOffset: .47,
  shelfOffsetY: .38, rackTopOffsetY: 1.05,
} as const
