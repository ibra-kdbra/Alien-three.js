import * as THREE from 'three'
import { GLTFLoader } from 'three-stdlib'

export class ResourceManager {
  private static instance: ResourceManager
  private loader: GLTFLoader
  private textureLoader: THREE.TextureLoader
  private assets: Map<string, any> = new Map()
  private loadingCount: number = 0
  private loadedCount: number = 0

  private constructor() {
    this.loader = new GLTFLoader()
    this.textureLoader = new THREE.TextureLoader()
  }

  public static getInstance(): ResourceManager {
    if (!ResourceManager.instance) {
      ResourceManager.instance = new ResourceManager()
    }
    return ResourceManager.instance
  }

  public async loadModel(path: string): Promise<THREE.Group> {
    if (this.assets.has(path)) return this.assets.get(path).clone()

    this.loadingCount++
    return new Promise((resolve, reject) => {
      this.loader.load(
        path,
        (gltf) => {
          this.assets.set(path, gltf.scene)
          this.loadedCount++
          resolve(gltf.scene.clone())
        },
        undefined,
        (error) => {
          this.loadingCount--
          reject(error)
        }
      )
    })
  }

  public async loadTexture(path: string): Promise<THREE.Texture> {
    if (this.assets.has(path)) return this.assets.get(path)

    this.loadingCount++
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        path,
        (texture) => {
          this.assets.set(path, texture)
          this.loadedCount++
          resolve(texture)
        },
        undefined,
        (error) => {
          this.loadingCount--
          reject(error)
        }
      )
    })
  }

  public getProgress(): number {
    if (this.loadingCount === 0) return 1
    return this.loadedCount / this.loadingCount
  }
}
