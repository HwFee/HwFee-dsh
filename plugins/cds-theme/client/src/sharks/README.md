# Vendored: ascii-sharks

Source: <https://github.com/stackedlol/ascii-sharks> (commit `c521e24`,
2026-10-19). The upstream repository ships **no license file**, so by default
all rights are reserved. These files are vendored because the plugin owner
asked for this exact ocean; **do not redistribute the npm package until the
upstream license is clarified.**

Files are the upstream TypeScript transpiled to ESM with the repo's own esbuild
(`--format=esm --target=es2022`); types are gone, behaviour is unchanged except
where marked `PATCHED`:

| file | change |
|---|---|
| `math.js` | none |
| `species.js` | none |
| `world.js` | `lure()` is water disturbance only (a splash and a click record); each whale swims a closed, homothetic elliptical lane of its own, the head advancing by arc length at a per-animal smooth speed and the twenty body nodes sampled at fixed arc offsets behind it; lanes are planned only on the first sizing and on a real field change; narrow and extreme-aspect scenes scale bodies and lane spacing together so the innermost lane can still turn |
| `renderer.js` | transparent surface instead of an opaque black ocean; theme ink inverted for a light page; explicit per-frame clear (upstream relied on the opaque background); owner document injectable for tests; shared whale ink; clicks add no ring or arrow |

Everything else — the species table, the boid flocking, the shark spine and
fin geometry, the wake field, the glyph ramps and the cell rasteriser — is
upstream code.

`client/src/ocean.js` is this plugin's host integration (mount point, phase
gate, pointer listeners, reduced motion, teardown) and is original.