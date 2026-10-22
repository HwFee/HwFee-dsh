# Third-party notices

The published package contains code from these projects. Each is included in the
artifact as built JavaScript, so the license text travels with the package rather
than being reachable from the original distribution.

| Package | Version | License | Where it ends up |
|---|---|---|---|
| `react` | 18.3.1 | MIT | bundled into `client/src/frame/runtime.bundle.json` |
| `react-dom` | 18.3.1 | MIT | bundled into `client/src/frame/runtime.bundle.json` |
| `scheduler` | 0.23.2 | MIT | bundled into `client/src/frame/runtime.bundle.json` (a dependency of `react-dom`) |

## Why they are bundled

The card's snippet runs in a sandboxed iframe with an opaque origin. That frame
cannot resolve modules: it has no access to the host's module table, and giving it
one would defeat the isolation. So React and ReactDOM are compiled into the frame
runtime at build time, by `tools/build-client.mjs`, from the exact versions pinned
in `package.json` `devDependencies`. Nothing is downloaded at runtime and there is
no CDN reference.

`scheduler` arrives transitively through `react-dom` and is emitted into the same
bundle. It is listed separately because it is a separate copyright holder's work
even though the text of its MIT license is identical.

## License texts

Verbatim copies, taken from each package's own `LICENSE` file in `node_modules`:

- [`licenses/react-LICENSE`](licenses/react-LICENSE)
- [`licenses/react-dom-LICENSE`](licenses/react-dom-LICENSE)
- [`licenses/scheduler-LICENSE`](licenses/scheduler-LICENSE)

All three are the MIT license, copyright Facebook, Inc. and its affiliates. The
files are byte-identical to the upstream ones; `test/manifest.test.mjs` asserts
that the packaged `files` list includes this directory, so a future change to the
manifest cannot quietly drop them from the tarball.

## esbuild

`esbuild` (MIT) runs at build time only. It is a `devDependency`, its code is not
part of any published artifact, and its license obligations are satisfied by the
package itself in `node_modules`. The minified output it produces carries no
`@license` comments because `legalComments: 'none'` is set for the frame bundle —
the attribution those comments would carry lives in this file and in `licenses/`
instead.
