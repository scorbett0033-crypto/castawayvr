# Dead Earth VR

A WebXR survival shooter set on a dead, Earth-like planet. Built for the **Meta Quest browser**, with a keyboard/mouse preview mode for desktop.

## Run it
Serve the repo over HTTPS (WebXR requires a secure context), e.g. GitHub Pages, then open `/deadearth/` in the Quest browser and press **ENTER VR**.
Locally: `python3 -m http.server` from the repo root → `http://localhost:8000/deadearth/` (desktop preview).

## What's in it
- **Shelter 7 lobby**: concrete hall lit by the sun through an observation window. You can sit on all 21 bench seats (point and pull the trigger). Seated survivors (NPCs), lockers, crates, and a blast door to the surface.
- **Armory**: 6 weapons (pistol, SMG, pump shotgun, AR carbine with red dot, DMR with a scope, Arc Lancer rail gun) bought with coins.
- **Wardrobe**: hair styles, hair colours, outfits and cloth pieces (scarf / cloak / duster coat), all bought with coins. Try things on first on the pedestal, where a floor fan blows wind at your avatar.
  - Hair is simulated strand by strand. It responds to wind and gravity and collides with your head and shoulders.
  - Cloth uses verlet mass-spring physics with aerodynamic wind forces and collides with your body.
- **Surface**: a cracked dust plain, a broken highway with rusted cars, ruined buildings, toppled pylons, dead trees, tumbleweeds rolling in the wind, drifting ash and a shattered moon.
- **Enemies**: hover drones that fire plasma bolts you can dodge or shoot down, and four-legged stalkers that walk with procedural IK and lunge at you. The waves keep getting harder. Kills pay coins.

## VR controls
| Input | Action |
|---|---|
| Left stick | Move (click to sprint) |
| Right stick | Snap turn |
| Trigger | Use / sit / fire |
| A | Eject the magazine. A fresh one appears in your left hand; push it into the magwell to reload. Press A again to reload automatically. |
| B | Switch weapon |
| Left grip on the foregrip | Steady two-handed weapons |
| Hold Y (or stand on the beacon) | Extract back to the lobby |

## Desktop preview
WASD + mouse, click to use/fire, E sit/stand, R reload, 1–6 / mouse wheel weapons, **V third-person** (to see your hair and cloth move in the wind), L extract.

## Tech notes
Everything (models, PBR textures, sounds) is generated procedurally at load time. There are no downloaded assets, so nothing has licensing issues. The game uses three.js r160 from cdnjs. Progress (coins, unlocks, look) is saved in `localStorage`.
