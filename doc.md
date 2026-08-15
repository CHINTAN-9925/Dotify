# Claude Code Prompt — "Split" Chain Reaction Prototype

Copy everything below the line into Claude Code.

---

Build a playable prototype of a one-tap chain reaction game called **Split**, as a single self-contained HTML file named `split.html`. No build step, no npm, no external dependencies or CDN links — plain HTML, CSS, and vanilla JavaScript with a `<canvas>` element. I must be able to open the file directly in a browser and play it.

This is a **feel prototype**. The only question it needs to answer is whether the chain reaction is satisfying to watch. Do not build menus, levels, progression, save state, or settings.

## The game

A field of dots drifts slowly around the screen. The player gets **one tap per round**. The dot they tap bursts into fragments that fly outward. Any fragment that touches another dot bursts that dot too, releasing more fragments. The chain continues until every fragment has died. The player's score is the number of dots destroyed. Then the round resets.

The player controls nothing after the tap — they just watch. That's the point.

## Core mechanics

**Dots**
- 40 dots, radius 12, spawned at random positions with no initial overlap
- Each has a random velocity, speed between 0.3 and 0.8 px/frame, random direction
- They bounce off the four screen edges
- Dots do not collide with each other — they pass through freely
- Each dot gets a random hue from a palette of 5 colors, drawn as a filled circle

**The tap**
- One tap allowed per round. After it is used, further taps are ignored until reset.
- The tap bursts the nearest dot within 40px of the tap point. If no dot is in range, the tap is not consumed.
- On burst: the dot is removed and replaced by fragments.

**Fragments**
- Each burst spawns 4 fragments
- Fragments are spawned at the parent dot's position, radius 5, evenly spaced around a circle (90° apart) with a random rotation offset so bursts don't all look identical
- Fragment speed is 2.5 px/frame, moving radially outward
- Fragments inherit the parent dot's color
- Fragments have a lifespan of 90 frames. Track `life` and decrement each frame; remove at 0.
- Fragments fade out over their last 30 frames (drop alpha from 1 to 0) so death is visible, not abrupt
- Fragments bounce off screen edges
- Fragments do not collide with other fragments

**Chain collision**
- Every frame, check each fragment against each remaining dot
- Collision when `distance(fragment, dot) < fragment.radius + dot.radius`
- On collision: remove that dot, spawn 4 new fragments from its position, increment the chain counter. The colliding fragment survives and continues moving.
- Use squared distance to avoid `Math.sqrt` in the inner loop

**Round end**
- Round ends when the fragment array is empty and the tap has been used
- Wait 1.5 seconds, then reset: respawn 40 fresh dots, clear the score, allow tapping again

## HUD

Minimal, drawn on the canvas or as absolutely-positioned DOM text:
- Top center: the live chain counter, large — increments visibly as dots pop
- Top left: `Destroyed: X / 40`
- On round end, center of screen: the final count, then `Tap to play again` after the 1.5s delay
- Before the first tap: `Tap a dot` in the center, faded

## Technical requirements

- Canvas fills the browser window and resizes correctly on window resize (handle `devicePixelRatio` so it isn't blurry on high-DPI screens)
- Input works with both mouse (`click`) and touch (`touchstart`) — this is destined for mobile
- Game loop uses `requestAnimationFrame`
- Use delta time or assume a fixed 60fps step, but be consistent — do not mix
- Structure the code as: a `Dot` class, a `Fragment` class, a `Game` object holding state, and `update()` / `draw()` / `loop()` functions
- Put all tunable numbers in a single `CONFIG` object at the top of the script: dot count, dot radius, dot speed range, fragment count per burst, fragment speed, fragment lifespan, fragment radius, tap hit radius, reset delay. I want to tune the feel by editing one block.
- Dark background (`#111`), bright saturated dot colors so the bursts pop
- Comment the collision-detection section clearly

## Minimum juice (needed to judge the feel — do not go beyond this)

- When a dot is hit, draw a brief expanding ring outline at its position that fades over ~15 frames
- Fragments draw a short trail: store the last 5 positions and draw them at decreasing alpha
- When the chain counter passes 15, drop the global time scale to 0.4 for the remainder of the round

No sound, no screen shake, no particles beyond what's described.

## Deliverable

One file: `split.html`. Then tell me the three CONFIG values you'd suggest I tweak first if the chain reactions feel too weak or too explosive, and why.

---

## Follow-up prompts to use after the first build

Feed these one at a time, once the base works:

- "Chains die out too fast. Adjust so fragments lose 10% speed on each dot collision but gain 20 frames of life, and show me both versions side by side behind a toggle key."
- "Add a `bomb` dot type — 10% of spawns, drawn with a ring outline, that on burst spawns 12 fragments instead of 4."
- "Add a slow-mo ramp: instead of a hard cut at chain 15, ease the time scale from 1.0 to 0.4 between chain 10 and chain 20."
- "Add sound with the Web Audio API — a short sine blip on each dot burst, pitch rising a semitone per chain link, capped at two octaves."
- "Wrap this in Capacitor so I can run it on an Android device, and give me the exact commands."

## How to judge the prototype

Play it 20 times. If you find yourself tapping again without deciding to, the loop works and it's worth building properly in Godot. If you get bored by round 10, change the CONFIG numbers before you change the concept — chain reaction games live or die on tuning, not design.