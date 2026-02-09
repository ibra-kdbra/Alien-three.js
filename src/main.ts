import './style.css'
import { Game } from './core/Game'

const game = new Game()
game.init().catch(console.error)
