import * as Phaser from 'phaser'
import { NerveScene } from './scenes/NerveScene'
import { GAME_WIDTH, GAME_HEIGHT } from '@/lib/town/constants'

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scene: [NerveScene],
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NO_CENTER },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
}
