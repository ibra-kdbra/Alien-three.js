import * as THREE from 'three'
import { GLTFLoader } from 'three-stdlib'

export class ModelLoader {
  loader: GLTFLoader

  constructor() {
    this.loader = new GLTFLoader()
  }

  load(path: string): Promise<THREE.Group | null> {
    return new Promise((resolve) => {
      this.loader.load(
        path,
        (gltf) => {
          resolve(gltf.scene)
        },
        undefined,
        (error) => {
          console.warn(`Failed to load model at ${path}. Using placeholder.`, error)
          resolve(null)
        }
      )
    })
  }
}
