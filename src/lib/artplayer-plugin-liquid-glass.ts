import Artplayer from 'artplayer'

export default function artplayerPluginLiquidGlass() {
  return (art: Artplayer) => {
    const utils = (art.constructor as any).utils
    const { addClass, append, createElement } = utils
    const { $bottom, $progress, $controls, $player } = art.template

    const $liquidGlass = createElement('div')
    addClass($player, 'artplayer-plugin-liquid-glass')
    addClass($liquidGlass, 'art-liquid-glass')

    append($bottom, $liquidGlass)
    append($liquidGlass, $progress)
    append($liquidGlass, $controls)

    return {
      name: 'artplayerPluginLiquidGlass',
    }
  }
}
