import * as Phaser from 'phaser'
import { NerveCenterScene } from './scenes/NerveCenterScene'
import { GAME_WIDTH, GAME_HEIGHT } from '@/lib/town/constants'

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scene: [NerveCenterScene],
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NO_CENTER },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
}
