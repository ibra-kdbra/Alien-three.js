# ASTRA: LOST SIGNAL

A sci-fi survival exploration game on a procedurally generated spherical planet.
Your dropship's signal relay is offline — locate the 3 signal beacons and return
to the extraction pad before your oxygen runs out.

Built with **Three.js**, **Rapier 3D** (WASM physics), and **miniplex** (ECS).

## Running

```bash
npm install
npm run dev      # dev server
npm run build    # typecheck + production build
npm run preview  # serve the production build
```

## Controls

| Input | Action |
|---|---|
| `WASD` | Move (camera-relative) |
| `Shift` | Sprint (drains O₂ faster) |
| `Space` | Jump / hold in air for jetpack |
| `F` | Sonar ping (highlights beacons in range) |
| `V` | Cycle camera: Follow / Action / Orbit |
| Scroll | Camera zoom |
| `F3` | Physics debug wireframes |

## Gameplay

- **Oxygen** drains constantly (faster while sprinting, much faster inside toxic
  vents). Reaching zero ends the run. Uncollected beacons and the landing pad
  are refuel zones.
- **Jetpack fuel** is a separate resource that regenerates while grounded.
- **Waypoints**: screen-space markers point to every remaining beacon (and to
  the extraction pad once all are collected) with live distance readouts —
  targets are usually over the planet's horizon.

## Architecture

```
src/
├── core/
│   ├── Engine.ts        # Fixed-timestep loop (60Hz sim) + render interpolation
│   ├── Renderer.ts      # WebGL renderer, post-processing (bloom/FXAA/chromatic)
│   ├── GameState.ts     # boot → playing → gameover/won
│   └── Sun.ts           # Player-following shadow frustum
├── ecs/
│   ├── World.ts         # miniplex world + queries
│   ├── components/      # Entity type definitions
│   ├── factories/       # Planet, player, beacons, hazards, dropship
│   └── systems/
│       ├── CharacterSystem.ts  # Spherical-gravity KCC (fixed tick)
│       ├── PhysicsSystem.ts    # Snapshot + interpolated transform sync
│       ├── CameraSystem.ts     # Third-person rig (render tick)
│       ├── WaypointSystem.ts   # Screen-space navigation markers
│       └── ...                 # Oxygen, beacons, dropship, scanner, particles
└── managers/            # Input, physics world, assets, audio, UI, debug
```

### Design notes

- **Simulation vs. render**: gameplay and physics advance in exact 1/60s ticks
  (identical behavior at any framerate); rendering interpolates between the
  last two physics states.
- **Spherical gravity**: the character controller tracks velocity in world
  space and parallel-transports it as "up" rotates around the planet. Jumping
  uses input buffering + coyote time.
- **One terrain source of truth**: `getPlanetHeight()` (seeded simplex noise on
  the unit sphere) drives the render mesh, the physics trimesh (the same
  geometry), and all entity placement.
