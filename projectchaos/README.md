# PROJECT CHAOS

A VR physics sandbox for **Meta Quest 3** (WebXR), inspired by physics-sandbox games like Project C.A.R.L.
Every character, model and sound is original. The game also has a keyboard-and-mouse preview mode for desktop.

## Run it
Serve the repo over HTTPS, because WebXR needs a secure context. GitHub Pages or Netlify both work.
Then open `/projectchaos/` in the Quest browser and press **ENTER VR**.

To run it locally, start a server from the repo root:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/projectchaos/` for the desktop preview.

Nothing is fetched from a CDN. three.js r160 and Rapier 0.14 (the physics engine) are bundled in `js/vendor/`.

## Physics first
- Everything is a real rigid body (Rapier): crates, barrels, guns, food, furniture, debris, darts, doors, drawers, levers and the TED ragdolls.
- **Weight:** held objects stay physical. Each physics step, the game works out the force your hand needs to hold the object and caps it at the hand's strength (about 750 N per hand). Light things follow your hand 1:1. Heavy things lag, sag, rotate slowly and need two hands. If something snags on a wall or is too heavy, you drop it.
- **Two-handed carrying:** the object pivots on your two grab points and you get double the strength. Use it for the sledgehammer, crates and barrels.
- **Throwing:** an object leaves your hand with your hand's recent velocity and spin, scaled by its mass.
- **Force-pull:** point at an object up to 8 m away and squeeze grip. It arcs into your hand.
- **Physical hands:** your hands push and slap things even when you aren't holding anything.
- **Breaking:** breakable objects take damage from impact energy (½·m·v²), shots and explosions. They shatter into fragments cut from their own mesh, so the pieces keep the original texture. Wood, glass, fruit, ceramics and electronics each break differently. Explosive barrels set each other off in chain reactions.
- **Repair:** aim the **Mender** at the debris and hold the trigger. The pieces fly back together and the object is rebuilt.
- **Impact sound:** each material has its own synthesized impact sound, with volume set by impact speed and pitch by mass.

## VR controls (Quest Touch)
| Input | Action |
|---|---|
| Grip | Grab / hold (point at far objects + grip to pull them in) |
| Trigger | Fire / use the held tool · click menu items · toggle the radio |
| A / X | Eject the magazine. On the Grav-Lift: launch the held object, or a repulsor blast |
| Reach to your hip + grip | Take a fresh magazine for the gun in your other hand |
| Push the magazine into the grip | Reload |
| Grab the foam pistol's slide with your other hand and pull it back | Rack the slide (needed after every reload) |
| Left stick | Smooth move (click to sprint) |
| Right stick | Snap or smooth turn. Push it forward for a teleport arc (in Teleport or Both mode) |
| B | Jump |
| Y | Wrist menu |
| Index finger | Press physical buttons, keypads and switches |

**Hand tracking** works too. Pinch fires or uses the held item, and making a fist grabs.

The **hands** are a Meshy-generated hand model. They are skinned at load time onto a 15-joint finger skeleton plus a wrist bone. Grip curls the middle, ring and pinky fingers. The trigger curls the index finger, which stays pointed when you aren't touching the trigger. Touching a button lowers the thumb. When you hold something, your virtual hand sticks to the object.

## Desktop controls
- **WASD** to move, **mouse** to look, **Space** to jump, **Shift** to sprint, **C** to crouch.
- **Right mouse button:** grab and hold. **Q:** throw.
- **Left mouse button:** fire, use, or press a button.
- **R:** reload. **F:** alt action.
- **Mouse wheel:** push or pull the held object.
- **Tab:** menu.

## The facility
- **Central Hub:**
  - Armory and tool crib.
  - A fabricator console with physical buttons that drop crates, barrels, melons, ducks, explosive barrels or a new TED from the ceiling.
  - The experiment-log board, the vault keypad and a trophy pedestal.
- **Training Range:**
  - A firing line with pop-up targets on motorized hinges, plus a START console.
  - A basket-toss bin and a hanging punching bag.
- **Sandbox Hall:**
  - A 26-piece domino run, a see-saw and a wrecking ball you can pull back and release.
  - A launch pad and a 15%-gravity chamber.
  - Glass panes, a stacking zone, a ramp and a platform.
  - A second fabricator.
- **Abandoned Lab (B-2):**
  - Flickering lights (there's a switch by the door), hinged double doors and benches with working drawers.
  - Beakers, monitors and a broken TED waiting for repair.
- **Secret: the Chaos Room.** It's behind the lab's hollow west wall, which you have to smash. The golden blaster and the Golden Duck are inside.
- **Secret: Vault 07.** The keypad code is on a note in one of the lab drawers. The party radio is inside.
- **Service tunnel** with a blast door. Pull the lever to open it.
- **Outdoor Test Range:**
  - A desert canyon with a bowling lane (RESET button) and a catapult.
  - An explosive-barrel yard, ramps, a watchtower, tire stacks and cones.

## TED units (NPCs)
TED is an original crash-test android, modelled, rigged and animated with **Meshy**. Its visor shows expressions: happy, curious, scared, angry, dizzy, love and off.

**How TEDs behave:**
- They wander, look at you and wave when you're close. Wave your hand above your head and they wave back.
- They turn toward noises.
- Gunfire and explosions make them flee or cower.
- Aim a gun at one and it puts its hands up.
- A radio playing nearby makes them dance.
- Poke one and it flinches. Keep poking and it gets angry and stomps.

**Ragdolls:**
- Grab, slap, shoot, blast or hit a TED hard enough and it becomes a jointed ragdoll: 11 bodies, with hinged knees.
- You can carry a ragdolled TED by a limb and throw it.
- After a while it stands back up with the Arise animation.
- Enough damage shuts a TED down. The Mender reboots it.

## Challenges (hub board + GOALS tab)
- Sharpshooter
- Hoop Dreams
- Skyscraper
- Domino Effect
- Strike!
- Chain Reaction
- Fixer Upper
- Bot Bowling
- Friendly Face
- Party Starter
- Second Chance
- Three secrets

Progress and settings are saved in `localStorage`.

## Wrist menu
- **SETTINGS:**
  - Movement: smooth, teleport or both.
  - Turning: snap 30°, snap 45° or smooth.
  - Comfort vignette, shadows, volume and seated height.
- **SPAWN:** every prop in the game, plus a TED unit. Also clears spawned objects or debris.
- **WORLD:**
  - Gravity: Earth, Moon or zero-G.
  - Time: 1×, ½× or bullet time.
  - Freeze all motion and reset the TEDs.
- **TRAVEL:** fast-travel to each area.
- **GOALS:** the challenge list.

## Performance notes (Quest 3)
- Static level geometry is merged per material and per zone. Zones you can't see from where you stand are hidden, along with their props.
- TEDs in rooms you can't see update at quarter rate. Resting ragdolls go to sleep.
- There is one shadow-casting light, and its shadow map follows you. Fixed foveation is on.
- Steady-state CPU cost of the game logic plus physics is about 1 ms per frame on a desktop CPU.

## Assets
- `models/*.glb` were generated for this project with **Meshy** (text-to-3D with PBR textures), then optimized with glTF-Transform (WebP textures, 512–1024 px). See `models/CREDITS.md`.
- Materials, textures, sounds and the radio tune are generated procedurally at startup.
