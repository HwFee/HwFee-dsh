/**
 * Constants shared by the browser half.
 *
 * PORT NOTE (upstream: Microqian2th/dsh-codex-effort-slider @ MIT, see
 * `licenses/NOTICE.md`). The numbers here are the upstream values verbatim —
 * they were calibrated against real recordings (see `motion.js`), and changing
 * any of them re-opens bugs the upstream test suite pinned down.
 */

/** The package's own name — the only id this client half may register under. */
export const PLUGIN_ID = '@hwfee/dsh-codex-effort-slider'

/**
 * The slot the (invisible) anchor lives in.
 *
 * Why an anchor at all: the slider itself is portalled into the host's model
 * menu, which is rendered in a portal on `document.body` — outside any slot. The
 * slot is the only place that hands us a `sessionId` and a position inside OUR
 * composer, which is what tells us which open menu belongs to this session.
 * Declared `kind: 'list'`, `scope: 'session'` by the host
 * (`dsh-client-ui-conversation/lib/client.js:19904`).
 */
export const SLOT_NAME = 'conversation.input.right'

/** Slot entry id. Stable: it is not a storage key, but a rename is noise. */
export const ENTRY_ID = 'codex-effort-slider'
export const ENTRY_ORDER = 40

/** `data-plugin-css` marker on our stylesheet, so a re-mount replaces it. */
export const STYLE_MARKER = PLUGIN_ID

/** Vertical padding added to the host's effort row so the slider can wrap under it. */
export const ROW_PADDING_BLOCK = '10px'

/**
 * Row labels we accept as "this is the effort row".
 *
 * Both locales are listed because the host ships `menu.effort` as 推理等级 / Effort
 * (`dsh-client-ui-model-selection/lib/client.js:1755`, `:1781`). The MODEL labels
 * exist for the stricter semantic check in `bridge.js`: a root panel with exactly
 * two menuitems is only OUR target when the first row is the model row.
 */
export const EFFORT_ROW_LABELS = ['推理等级', 'Effort']
export const MODEL_ROW_LABELS = ['模型', 'Model']

/** Drag-time write-back rate limit (ms). Release always flushes immediately. */
export const COMMIT_THROTTLE_MS = 120

/** How long we wait for the host to report back before rolling the optimistic value back. */
export const COMMIT_DEADLINE_MS = 10000

/** Backoff for `directoryFor()`, which throws by design before the session scope exists. */
export const RETRY_DELAYS = [60, 240, 540, 960, 1500, 3000, 3000]

/**
 * Track height in px. The knob diameter equals it — a ball inside a pipe, so the
 * circle is never clipped into a flat edge at either end.
 */
export const TRACK_HEIGHT = 28
export const KNOB_SIZE = TRACK_HEIGHT
export const KNOB_RADIUS = KNOB_SIZE / 2

/** Global speed multiplier for the starfield (upstream ships 4). */
export const BASE_SPEEDUP = 4

/** Starfield baseline traversal (s) and per-star spread (± this fraction). */
export const STARFIELD_DURATION_MEAN = 1.5
export const STARFIELD_DURATION_SPREAD = 0.08

/** Brightness/size floor at the top level (1 = full size). */
export const STARFIELD_MIN = 0.5

/** Low-discrepancy phase spread for the 22 particles. */
export const GOLDEN_RATIO = 0.6180339887498949

/** Ceiling of the position speed curve; aligns "fastest level" with the baseline duration. */
export const MAX_SPEED_FACTOR = 2

/** Two particles adjacent in phase must differ by at least this many height slots. */
export const MIN_HEIGHT_SLOTS = 3

/**
 * Energy anchors: before the second level the fill is plain blue, and violet has
 * fully arrived by two thirds (the `high` level of a 4-level model).
 */
export const ENERGY_START = 1 / 3
export const ENERGY_END = 2 / 3

/**
 * Blue → violet → deep violet. FUNCTIONAL COLOUR, NOT A THEME TOKEN.
 *
 * This gradient IS the feature (each level has a colour; the fill "energises" as
 * you drag right). It is deliberately not remapped onto `--dsw-*` tokens: a theme
 * that recoloured it would delete the encoding the user came for.
 */
export const COLOR_BLUE = [77, 147, 248]
export const COLOR_VIOLET = [147, 51, 234]
export const COLOR_DEEP = [76, 29, 149]

/**
 * The value text ("Max") uses a LIGHTER violet endpoint than the fill.
 * `COLOR_DEEP` is nearly invisible as text on a dark surface, and `#c084fc` only
 * reaches ~2.6:1 on light — this mid violet is ≈4.2:1 on white and ≈4.0:1 on the
 * dark composer, so it is legible in both themes.
 */
export const COLOR_TEXT_VIOLET = [139, 92, 246]

/**
 * Settings storage. The key keeps the UPSTREAM namespace on purpose: an existing
 * `dsh-codex-effort-slider` install migrates its animation mode instead of
 * silently resetting to the default.
 */
export const SETTINGS_KEY = 'dsh-codex-effort-slider.settings'
export const SETTINGS_EVENT = 'dsh-codex-effort-slider:settings'
export const SETTINGS_VERSION = 3
