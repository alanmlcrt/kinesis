import assert from 'node:assert/strict'

// Contrastes WCAG et fonds réellement appliqués, en complément des captures inspectées.
export async function checkTheme(page) {
  const theme = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    const token = (name) => root.getPropertyValue(`--${name}`).trim()
    return {
      colors: Object.fromEntries(['bg', 'panel', 'surface', 'text', 'muted', 'accent', 'on-accent', 'error', 'control-line', 'rack', 'series-0', 'series-1', 'series-2'].map((name) => [name, token(name)])),
      scheme: root.colorScheme,
      background: window.kinesisView.scene.background.getHexString(),
      floor: window.kinesisView.scene.getObjectByName('warehouse-floor').material.color.getHexString(),
      controls: document.querySelectorAll('.panel .control-group').length,
      cut: Array.from(document.querySelector('.cut').getContext('2d').getImageData(1, 1, 1, 1).data),
    }
  })
  const luminance = (hex) => {
    if (hex.length === 4) hex = `#${Array.from(hex.slice(1), (c) => c + c).join('')}`
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
    return .2126 * r + .7152 * g + .0722 * b
  }
  const contrast = (a, b) => {
    const x = luminance(theme.colors[a]), y = luminance(theme.colors[b])
    return (Math.max(x, y) + .05) / (Math.min(x, y) + .05)
  }
  const ratios = []
  for (const bg of ['bg', 'panel', 'surface']) {
    for (const fg of ['text', 'muted', 'error', 'accent']) {
      const ratio = contrast(fg, bg)
      assert.ok(ratio >= 4.5, `${fg}/${bg} : contraste texte insuffisant (${ratio})`)
      ratios.push({ fg, bg, ratio })
    }
    for (const fg of ['control-line', 'series-0', 'series-1', 'series-2']) assert.ok(contrast(fg, bg) >= 3, `${fg}/${bg} : contraste insuffisant`)
  }
  assert.ok(contrast('on-accent', 'accent') >= 4.5)
  assert.ok(contrast('on-accent', 'rack') >= 4.5, 'lettres du plan illisibles')
  assert.equal(theme.scheme, 'light')
  assert.equal(theme.background, theme.colors.bg.slice(1))
  assert.ok(luminance(`#${theme.floor}`) > .6, 'sol resté sombre')
  assert.equal(theme.controls, 3, 'commandes sans regroupement')
  assert.deepEqual(theme.cut, [238, 241, 243, 255], 'fond de la coupe resté sombre')
  console.log(`Thème clair : fonds 3D/2D, commandes regroupées et contrastes vérifiés (texte min. ${Math.min(...ratios.map((r) => r.ratio)).toFixed(2)}:1)`)
  return { ...theme, ratios }
}
