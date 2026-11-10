# Dead Earth VR

A WebXR survival shooter set on a dead, Earth-like planet. Built for the **Meta Quest browser**, with a keyboard/mouse preview mode for desktop.

## Run it
Serve the repo over HTTPS (WebXR requires a secure context), e.g. GitHub Pages, then open `/deadearth/` in the Quest browser and press **ENTER VR**.
Locally: `python3 -m http.server` from the repo root → `http://localhost:8000/deadearth/` (desktop preview).

## What's in it
- **Nova Hub lobby (year 2291)**: a bright, futuristic sky lounge looking out over a living green city with flying traffic.
  - Sittable benches (point and pull the trigger).
  - Seated citizens and an armory.
  - A wardrobe with a wind-fan pedestal.
  - The **blue arena portal**.
- **Arena stakes**: at the portal terminal you pick a stake (50–1000 coins), then walk through the portal. The coins leave your bank and travel with you.
  - Kill a **rival raider** and you take the stake they were carrying.
  - If a raider kills you, they take your stake plus everything you picked up.
  - Extract alive (hold Y, or stand on the beacon) to bank it all.
  - If you drop below 50 coins, the hub tops you back up to play again.
- **Arena (dead Earth)**: this is the only place the planet is dead.
  - Scenery: a cracked dust plain, a broken highway, ruins, tumbleweeds, ash, a shattered moon.
  - Enemies: rival raiders with guns, name tags and coin stakes, plus hover drones and four-legged stalkers.
- **Realistic humans**: every person in the game (you, hub citizens, arena raiders) is a fully textured, rigged human from the Microsoft Rocketbox library (MIT). They are animated with motion-captured idle, walk, run and sit clips.
  - Wardrobe tabs: BODY · FACE · HAIR · COLOR · OUTFIT · CLOTH · GEAR. Some items cost coins.
  - FACE puts any person's face on any outfit of the same body type. The outfit's bare skin (hands, arms, neck) is re-toned automatically to match the new face.
  - OUTFIT picks between real outfits.
  - HAIR: keep the model's natural hair, or swap to wind-simulated strand styles.
  - COLOR tints the hair.
  - CLOTH adds a scarf, cloak or duster coat with cloth physics.
  - GEAR adds a respirator.
  - Raiders hold their guns with arm IK. Credits are in `models/CREDITS.md`.

## VR controls
| Input | Action |
|---|---|
| Left stick | Move (click to sprint) |
| Right stick | Snap turn |
| Trigger | Use / sit / fire |
| Walk into the blue portal | Enter the arena (choose a stake at the terminal first) |
| A | Eject the magazine. A fresh one appears in your left hand; push it into the magwell to reload. Press A again to reload automatically. |
| B | Switch weapon |
| Left grip on the foregrip | Steady two-handed weapons |
| Hold Y (or stand on the beacon) | Extract back to the lobby |

## Desktop preview
WASD + mouse, click to use/fire, E sit/stand, R reload, 1–6 / mouse wheel weapons, **V third-person** (to see your hair and cloth move in the wind), L extract.

## Tech notes
Everything (models, PBR textures, sounds) is generated procedurally at load time. There are no downloaded assets, so nothing has licensing issues. The game uses three.js r160 from cdnjs. Progress (coins, unlocks, look) is saved in `localStorage`.
