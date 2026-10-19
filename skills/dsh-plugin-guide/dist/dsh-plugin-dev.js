import { dirname, join, resolve } from "node:path";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

//#region src/cli/lib/args.ts
const LONG_ALIASES = {
	help: "help",
	version: "version"
};
/**
* Parse an argv slice (without the node/script prefix) into positionals and flags.
* @param argv - process.argv.slice(2) style input.
* @returns the parsed structure.
*/
function parseArgs(argv) {
	const positionals = [];
	const flags = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--") {
			positionals.push(...argv.slice(i + 1));
			break;
		}
		if (arg.startsWith("--")) {
			const body = arg.slice(2);
			const eq = body.indexOf("=");
			if (eq >= 0) {
				setFlag(flags, body.slice(0, eq), body.slice(eq + 1));
				continue;
			}
			const key = body;
			const next = argv[i + 1];
			if (next !== void 0 && !next.startsWith("-")) {
				setFlag(flags, key, next);
				i++;
			} else setFlag(flags, key, true);
			continue;
		}
		if (arg.startsWith("-") && arg.length > 1) {
			for (const ch of arg.slice(1)) flags[ch] = true;
			continue;
		}
		positionals.push(arg);
	}
	return {
		positionals,
		flags
	};
}
function setFlag(flags, key, value) {
	const canonical = LONG_ALIASES[key] ?? key;
	flags[canonical] = value;
}
/** Read a flag as a string, returning the fallback when absent or boolean-true. */
function flagString(flags, key, fallback) {
	const v = flags[key];
	if (typeof v === "string") return v;
	return fallback;
}
/** Read a flag as a boolean. */
function flagBool(flags, key) {
	return flags[key] === true || flags[key] === "true";
}

//#endregion
//#region src/cli/lib/fs.ts
/** Fixed temp-dir marker prefix; a security invariant, not a tunable. */
const TEMP_PREFIX = "dsh-pd-";
const createdTempDirs = /* @__PURE__ */ new Set();
/**
* Create a fresh temporary directory under the OS temp root and track it so only
* this process can clean it up.
* @param label - short label embedded in the directory name for diagnostics.
* @returns the absolute path of the new directory.
*/
function createTempDir(label) {
	const dir = mkdtempSync(join(tmpdir(), `${TEMP_PREFIX}${label}-`));
	createdTempDirs.add(resolve(dir));
	return dir;
}
/** Remove every still-tracked temp directory (best-effort teardown). */
function cleanupAllTempDirs() {
	for (const dir of [...createdTempDirs]) {
		try {
			rmSync(dir, {
				recursive: true,
				force: true
			});
		} catch {}
		createdTempDirs.delete(dir);
	}
}
/** Read a UTF-8 file, returning `undefined` when it does not exist. */
function readFileIfExists(path) {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return;
	}
}
/** Read a JSON file as a structured value, returning `undefined` when absent. */
function readJsonIfExists(path) {
	const text = readFileIfExists(path);
	if (text === void 0) return void 0;
	try {
		return JSON.parse(text);
	} catch {
		return;
	}
}
/** Write a UTF-8 file, creating parent directories as needed. */
function writeFileDeep(path, content) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content, "utf8");
}
/** True when the path exists and is a regular file. */
function isFile(path) {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}
/** True when the path exists and is a directory. */
function isDir(path) {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

//#endregion
//#region src/cli/templates.ts
/**
* The canonical `@deepseek-ai/dsh-*` peer range, single-sourced here and
* substituted into every scaffolded package.json through the
* `{{dshPeerRange}}` placeholder. Keep it identical to the canonical range in
* `dsh-plugin-kit/data/peer-range.json`: one clause per prerelease tuple is
* required by semver's prerelease rule, and the `-0` floor covers the whole
* tuple (never a bare `>=0.2.0` form, which semver's prerelease rule would
* reject for `0.2.1-alpha.1`).
*
* The 0.2 line is load-bearing: `dsh` enforces peer ranges at install time and
* rejects any plugin whose declared range excludes the running runtime, so a
* range that stops at 0.1.x makes every scaffolded plugin uninstallable on a
* 0.2.x harness (`installation rejected: ... is incompatible with dsh
* 0.2.1-alpha.1`).
*/
const DSH_PEER_RANGE = ">=0.1.2-rc.1 <0.2.0 || >=0.1.5-alpha.1 <0.2.0 || >=0.1.6-0 <0.2.0 || >=0.1.7-0 <0.2.0 || >=0.2.0-0 <0.3.0 || >=0.2.1-0 <0.3.0";
/** Resolve the templates root: env override first, then candidate walks. */
function resolveTemplatesRoot() {
	const env = process.env.DSH_PLUGIN_DEV_TEMPLATES;
	if (env) return resolve(env);
	const here = dirname(fileURLToPath(import.meta.url));
	const candidates = [
		join(here, "..", "..", "templates"),
		join(here, "..", "templates"),
		join(here, "templates")
	];
	for (const candidate of candidates) if (existsSync(join(candidate, "ts")) && existsSync(join(candidate, "js"))) return resolve(candidate);
	throw new Error("templates directory not found; set DSH_PLUGIN_DEV_TEMPLATES to its path");
}
/** Recursively list relative file paths under a directory. */
function walkFiles(dir, base = "") {
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const rel = base ? `${base}/${entry.name}` : entry.name;
		if (entry.isDirectory()) out.push(...walkFiles(join(dir, entry.name), rel));
		else out.push(rel);
	}
	return out;
}
/** Substitute placeholders in template text. */
function renderTemplate(text, context) {
	return text.replaceAll("{{pkgName}}", context.pkgName).replaceAll("{{name}}", context.name).replaceAll("{{version}}", context.version).replaceAll("{{year}}", context.year).replaceAll("{{dshPeerRange}}", DSH_PEER_RANGE);
}
/** Render every file of a language template. */
function renderScaffold(lang, context) {
	const root = join(resolveTemplatesRoot(), lang);
	return walkFiles(root).sort().map((rel) => {
		return {
			relativePath: rel,
			content: renderTemplate(readFileSync(join(root, rel), "utf8"), context)
		};
	});
}
/** Write rendered files under a target directory. */
function writeScaffold(targetDir, files) {
	for (const file of files) writeFileDeep(join(targetDir, file.relativePath), file.content);
}

//#endregion
//#region src/cli/meta.ts
/** Resolve the installed package root (parent of the templates directory). */
function resolvePackageRoot() {
	return dirname(resolveTemplatesRoot());
}
/** Read the installed package version, falling back to a placeholder. */
function readCliVersion() {
	return readJsonIfExists(join(resolvePackageRoot(), "package.json"))?.version ?? "0.0.0";
}

//#endregion
//#region src/cli/lib/report.ts
/** Aggregate a list of checks into a report, deriving `ok` from errors. */
function buildReport(target, version, checks) {
	const summary = {
		passed: checks.filter((c) => c.status === "pass").length,
		failed: checks.filter((c) => c.status === "fail").length,
		warned: checks.filter((c) => c.status === "warn").length,
		skipped: checks.filter((c) => c.status === "skip").length
	};
	return {
		schemaVersion: 1,
		cli: "dsh-plugin-dev",
		version,
		target,
		ok: summary.failed === 0,
		summary,
		checks
	};
}
/** Render a check list as a human-readable line-oriented report. */
function renderHuman(report) {
	const lines = [];
	lines.push(`target: ${report.target}`);
	lines.push(`result: ${report.ok ? "OK" : "FAILED"} (${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.warned} warned, ${report.summary.skipped} skipped)`);
	lines.push("");
	for (const check of report.checks) {
		const icon = check.status === "pass" ? "✓" : check.status === "fail" ? "✗" : check.status === "warn" ? "!" : "-";
		lines.push(`${icon} [${check.id}] (${check.severity}/${check.kind}) ${check.message}`);
		lines.push(`    skill: ${check.skillRef.file} ${check.skillRef.section} — ${check.skillRef.heading}`);
		for (const detail of check.detail ?? []) lines.push(`      ${detail}`);
	}
	return lines.join("\n");
}

//#endregion
//#region src/cli/skill-sections.ts
/** Canonical skill citation for one check id. */
const SKILL_SECTIONS = {
	"patch-valid": {
		file: "guide/plugin-dev-guide.md",
		section: "§2.2",
		heading: "两个概念、两种清单（bundle manifest）"
	},
	"patch-ids-unique": {
		file: "guide/plugin-dev-guide.md",
		section: "§2.3",
		heading: "配置分层顺序（按 id 整行覆盖）"
	},
	"manifest-bundle-patch": {
		file: "guide/plugin-dev-guide.md",
		section: "§2.2",
		heading: "bundle 最小结构（dsh.bundle.patch）"
	},
	"manifest-main": {
		file: "guide/plugin-dev-guide.md",
		section: "§7.3",
		heading: "main/types 指向 lib 产物"
	},
	"manifest-peers": {
		file: "guide/plugin-dev-guide.md",
		section: "§7.3",
		heading: "cordis 双副本与 peer 对齐宿主"
	},
	"manifest-engines": {
		file: "guide/plugin-dev-guide.md",
		section: "§8",
		heading: "规范与质量门禁（Node 版本）"
	},
	"manifest-files": {
		file: "guide/plugin-dev-guide.md",
		section: "§7.1",
		heading: "files 白名单与构建产物"
	},
	"manifest-package-manager": {
		file: "guide/plugin-dev-guide.md",
		section: "§8",
		heading: "packageManager 固定 pnpm"
	},
	"display-meta": {
		file: "guide/plugin-dev-guide.md",
		section: "§7.0.1",
		heading: "展示元数据与图标（locale meta + 导出 icon）"
	},
	"readme-five-langs": {
		file: "guide/plugin-dev-guide.md",
		section: "§8",
		heading: "文档双语/多语成对"
	},
	"readme-consistency": {
		file: "guide/plugin-dev-guide.md",
		section: "§8",
		heading: "五语 README 同步"
	},
	"redline-persona-role": {
		file: "SKILL.md",
		section: "§边界",
		heading: "注入提示词段落以角色句开头、保持短小"
	},
	"redline-waterfall-next": {
		file: "guide/plugin-dev-guide.md",
		section: "§3.5",
		heading: "waterfall 铁律：必须调用 next()"
	},
	"redline-no-hardcoded-tunables": {
		file: "guide/plugin-dev-guide.md",
		section: "§3.6",
		heading: "配置 Schema 化、不硬编码可调参数"
	},
	"redline-effect-registration": {
		file: "guide/plugin-dev-guide.md",
		section: "§3.3",
		heading: "注册即 effect（disposer 可逆）"
	},
	"redline-async-apply-registration": {
		file: "guide/plugin-dev-guide.md",
		section: "§3.3",
		heading: "async apply 首个 await 之后不得注册（卸载窗口竞态）"
	}
};
/** Fallback citation for any check id not in the table. */
function skillRefFor(id) {
	return SKILL_SECTIONS[id] ?? {
		file: "guide/plugin-dev-guide.md",
		section: "§10",
		heading: "从零到发布的标准路径"
	};
}

//#endregion
//#region src/cli/lib/yaml.ts
/**
* Parse a YAML subset document.
* @param text - raw YAML text.
* @returns the parsed value; an empty document is `null`.
*/
function parseYaml(text) {
	const lines = tokenize(text);
	return new Parser(lines).parseValue();
}
/** True when the value is a mapping. */
function isObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** True when the value is a sequence. */
function isArray(value) {
	return Array.isArray(value);
}
function tokenize(text) {
	const out = [];
	const lines = text.split(/\r?\n/);
	for (let n = 0; n < lines.length; n++) {
		const stripped = stripComment(lines[n]);
		if (stripped.trim() === "") continue;
		out.push({
			indent: stripped.length - stripped.trimStart().length,
			text: stripped.trim(),
			num: n + 1
		});
	}
	return out;
}
function stripComment(line) {
	let single = false;
	let double = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (single) {
			if (c === "'") single = false;
			continue;
		}
		if (double) {
			if (c === "\\") {
				i++;
				continue;
			}
			if (c === "\"") double = false;
			continue;
		}
		if (c === "'") single = true;
		else if (c === "\"") double = true;
		else if (c === "#") return line.slice(0, i);
	}
	return line;
}
var Parser = class {
	lines;
	pos = 0;
	constructor(lines) {
		this.lines = lines;
	}
	parseValue() {
		if (this.pos >= this.lines.length) return null;
		const line = this.lines[this.pos];
		if (isSeqItem(line.text)) return this.parseSequence(line.indent);
		if (isMappingStart(line.text)) return this.parseMapping(line.indent);
		this.pos++;
		return parseScalar(line.text);
	}
	parseSequence(indent) {
		const arr = [];
		while (this.pos < this.lines.length && this.lines[this.pos].indent === indent && isSeqItem(this.lines[this.pos].text)) {
			const text = this.lines[this.pos].text;
			if (text === "-") {
				this.pos++;
				arr.push(this.parseValue());
				continue;
			}
			const rest = text.slice(2);
			if (rest === "") {
				this.pos++;
				arr.push(this.parseValue());
			} else if (isMappingStart(rest)) arr.push(this.parseInlineMapping(rest, indent));
			else {
				this.pos++;
				arr.push(parseScalar(rest));
			}
		}
		return arr;
	}
	parseInlineMapping(firstEntry, seqIndent) {
		const map = {};
		let entry = firstEntry;
		const keyIndent = seqIndent + 2;
		while (true) {
			const split = splitKeyValue(entry);
			if (split.value === "") {
				this.pos++;
				map[split.key] = this.parseValue();
			} else {
				this.pos++;
				map[split.key] = parseScalar(split.value);
			}
			const next = this.lines[this.pos];
			if (next && next.indent === keyIndent && !isSeqItem(next.text) && isMappingStart(next.text)) entry = next.text;
			else break;
		}
		return map;
	}
	parseMapping(indent) {
		const map = {};
		while (this.pos < this.lines.length && this.lines[this.pos].indent === indent && isMappingStart(this.lines[this.pos].text) && !isSeqItem(this.lines[this.pos].text)) {
			const entry = this.lines[this.pos].text;
			const split = splitKeyValue(entry);
			if (split.value === "") {
				this.pos++;
				map[split.key] = this.parseValue();
			} else {
				this.pos++;
				map[split.key] = parseScalar(split.value);
			}
		}
		return map;
	}
};
function isSeqItem(text) {
	return text === "-" || text.startsWith("- ");
}
function isMappingStart(text) {
	if (text.endsWith(":")) return true;
	return text.includes(": ");
}
function splitKeyValue(text) {
	for (let i = 0; i < text.length; i++) if (text[i] === ":" && (i + 1 >= text.length || text[i + 1] === " ")) return {
		key: text.slice(0, i).trim(),
		value: text.slice(i + 1).trim()
	};
	return {
		key: text,
		value: ""
	};
}
function parseScalar(text) {
	const t = text.trim();
	if (t === "" || t === "~" || t === "null" || t === "Null" || t === "NULL") return null;
	if (t === "true" || t === "True" || t === "TRUE") return true;
	if (t === "false" || t === "False" || t === "FALSE") return false;
	if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) return t.slice(1, -1).replace(/''/g, "'");
	if (t.startsWith("\"") && t.endsWith("\"") && t.length >= 2) return unescapeDouble(t.slice(1, -1));
	if (/^-?\d+$/.test(t)) return Number.parseInt(t, 10);
	if (/^-?\d+\.\d+$/.test(t)) return Number.parseFloat(t);
	return t;
}
function unescapeDouble(text) {
	return text.replace(/\\n/g, "\n").replace(/\\t/g, "	").replace(/\\r/g, "\r").replace(/\\0/g, "\0").replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
}

//#endregion
//#region src/cli/commands/check.ts
/** Icon formats the harness accepts, and its per-file size ceiling. */
const ICON_EXTENSIONS = [
	".svg",
	".png",
	".jpg",
	".jpeg",
	".webp"
];
const ICON_MAX_BYTES = 262144;
const README_LANGS = [
	"README.md",
	"README-zh.md",
	"README-es.md",
	"README-pt.md",
	"README-hi.md"
];
const EXCLUDED_DIRS = /* @__PURE__ */ new Set([
	"node_modules",
	".git",
	"dist",
	"coverage",
	"downloads",
	"_check"
]);
/** Run every check and return the report plus a process exit code. */
function runCheck(options) {
	const root = resolve(options.root);
	const pkg = readJsonIfExists(join(root, "package.json"));
	const checks = [
		checkPatchValid(root, pkg),
		checkPatchIdsUnique(root, pkg),
		checkManifestBundlePatch(root, pkg),
		checkManifestMain(root, pkg),
		checkManifestPeers(root, pkg),
		checkManifestEngines(root, pkg),
		checkManifestFiles(root, pkg),
		checkManifestPackageManager(root, pkg),
		checkDisplayMeta(root, pkg),
		checkReadmeFiveLangs(root),
		checkReadmeConsistency(root),
		checkRedlinePersonaRole(root),
		checkRedlineWaterfallNext(root),
		checkRedlineNoHardcodedTunables(root),
		checkRedlineEffectRegistration(root),
		checkRedlineAsyncApplyRegistration(root)
	];
	const report = buildReport(root, readCliVersion(), checks);
	return {
		report,
		exitCode: report.summary.failed + (options.strict ? report.summary.warned : 0) > 0 ? 1 : 0
	};
}
/** Render the report to the console in the requested format. */
function printCheckReport(report, format) {
	if (format === "json") process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	else process.stdout.write(`${renderHuman(report)}\n`);
}
/** Every patch file a `dsh.bundle.patch` pointer names, in application order. */
function patchPaths(root, pkg) {
	const pointer = pkg?.dsh?.bundle?.patch;
	if (!pointer) return [];
	return (Array.isArray(pointer) ? pointer : [pointer]).filter((entry) => typeof entry === "string" && entry !== "").map((entry) => resolve(root, entry));
}
/** The first patch file, for checks that only describe one file. */
function patchPath(root, pkg) {
	return patchPaths(root, pkg)[0];
}
/**
* List real source files: the `src/` tree plus root-level JS/ESM entry files.
* Templates, tests, scripts, references, and generated directories are data or
* fixtures, never runtime source, so they are excluded from static scans.
*/
function listSourceFiles(root) {
	const out = [];
	let rootEntries;
	try {
		rootEntries = readdirSync(root);
	} catch {
		rootEntries = [];
	}
	for (const entry of rootEntries) if (/\.(js|mjs|cjs)$/.test(entry)) out.push(join(root, entry));
	const walk = (dir) => {
		let entries;
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		for (const entry of entries) {
			if (EXCLUDED_DIRS.has(entry)) continue;
			const full = join(dir, entry);
			let stat;
			try {
				stat = statSync(full);
			} catch {
				continue;
			}
			if (stat.isDirectory()) walk(full);
			else if (stat.isFile() && /\.(ts|js|mjs|cjs)$/.test(entry)) out.push(full);
		}
	};
	walk(join(root, "src"));
	return out;
}
function readText(path) {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return;
	}
}
function collectedImports(sourceFiles) {
	const imports = /* @__PURE__ */ new Set();
	const re = /(?:from\s+|import\s+|import\s*\(\s*)['"](@deepseek-ai\/[^'"]+)['"]/g;
	for (const file of sourceFiles) {
		const text = readText(file);
		if (!text) continue;
		let match;
		while ((match = re.exec(text)) !== null) imports.add(match[1]);
	}
	return imports;
}
function validatePatch(text) {
	const errors = [];
	const rows = [];
	let value;
	try {
		value = parseYaml(text);
	} catch (err) {
		return {
			errors: [`cannot parse YAML: ${err instanceof Error ? err.message : String(err)}`],
			rows
		};
	}
	if (value === null || value === void 0) return {
		errors: ["empty document"],
		rows
	};
	if (!isArray(value)) return {
		errors: ["top level must be a YAML sequence of row verbs"],
		rows
	};
	value.forEach((verbEntry, i) => {
		if (!isObject(verbEntry)) {
			errors.push(`entry ${i} must be a mapping like \`- insert:\``);
			return;
		}
		const verbs = Object.keys(verbEntry);
		if (verbs.length !== 1) {
			errors.push(`entry ${i} must have exactly one verb key (got ${verbs.length})`);
			return;
		}
		const verb = verbs[0];
		const rowsValue = verbEntry[verb];
		if (!isArray(rowsValue)) {
			errors.push(`entry ${i} verb \`${verb}\` must map to a sequence of rows`);
			return;
		}
		rowsValue.forEach((row, r) => {
			if (!isObject(row)) {
				errors.push(`row ${i}.${r} must be a mapping`);
				return;
			}
			const id = row.id;
			const name = row.name;
			if (typeof id !== "string" || id === "") errors.push(`row ${i}.${r} is missing a string \`id\``);
			if (verb === "insert" && (typeof name !== "string" || name === "")) errors.push(`row ${i}.${r} (insert) is missing a string \`name\``);
			rows.push({
				id: typeof id === "string" ? id : void 0,
				name: typeof name === "string" ? name : void 0
			});
		});
	});
	return {
		errors,
		rows
	};
}
function checkPatchValid(root, pkg) {
	const ref = skillRefFor("patch-valid");
	const path = patchPath(root, pkg);
	if (!path) return {
		id: "patch-valid",
		severity: "warning",
		kind: "deterministic",
		status: "warn",
		message: "no dsh.bundle.patch pointer; nothing to validate",
		skillRef: ref
	};
	if (!isFile(path)) return {
		id: "patch-valid",
		severity: "error",
		kind: "deterministic",
		status: "fail",
		message: `patch file not found: ${path}`,
		skillRef: ref
	};
	const { errors } = validatePatch(readText(path) ?? "");
	if (errors.length > 0) return {
		id: "patch-valid",
		severity: "error",
		kind: "deterministic",
		status: "fail",
		message: "cordis.patch.yml is invalid",
		skillRef: ref,
		detail: errors
	};
	return {
		id: "patch-valid",
		severity: "error",
		kind: "deterministic",
		status: "pass",
		message: "cordis.patch.yml parses and every row is well-formed",
		skillRef: ref
	};
}
function checkPatchIdsUnique(root, pkg) {
	const ref = skillRefFor("patch-ids-unique");
	const path = patchPath(root, pkg);
	if (!path || !isFile(path)) return {
		id: "patch-ids-unique",
		severity: "error",
		kind: "deterministic",
		status: "skip",
		message: "no patch file to check for duplicate ids",
		skillRef: ref
	};
	const { rows } = validatePatch(readText(path) ?? "");
	const seen = /* @__PURE__ */ new Map();
	const dupes = [];
	rows.forEach((row, i) => {
		if (!row.id) return;
		if (seen.has(row.id)) dupes.push(`id "${row.id}" repeated at row ${seen.get(row.id)} and row ${i}`);
		else seen.set(row.id, i);
	});
	if (dupes.length > 0) return {
		id: "patch-ids-unique",
		severity: "error",
		kind: "deterministic",
		status: "fail",
		message: "duplicate row ids in cordis.patch.yml",
		skillRef: ref,
		detail: dupes
	};
	return {
		id: "patch-ids-unique",
		severity: "error",
		kind: "deterministic",
		status: "pass",
		message: `row ids are unique (${rows.length} rows)`,
		skillRef: ref
	};
}
function checkManifestBundlePatch(root, pkg) {
	const ref = skillRefFor("manifest-bundle-patch");
	const pointer = pkg?.dsh?.bundle?.patch;
	if (!pointer) return {
		id: "manifest-bundle-patch",
		severity: "warning",
		kind: "deterministic",
		status: "warn",
		message: "no dsh.bundle.patch declared (pure cordis plugin, no bundle layer)",
		skillRef: ref
	};
	const paths = patchPaths(root, pkg);
	if (paths.length === 0) return {
		id: "manifest-bundle-patch",
		severity: "error",
		kind: "deterministic",
		status: "fail",
		message: "dsh.bundle.patch must be a file path or a list of file paths",
		skillRef: ref
	};
	const missing = paths.filter((path) => !isFile(path));
	const label = Array.isArray(pointer) ? pointer.join(", ") : pointer;
	if (missing.length > 0) return {
		id: "manifest-bundle-patch",
		severity: "error",
		kind: "deterministic",
		status: "fail",
		message: `dsh.bundle.patch points at a missing file: ${label}`,
		skillRef: ref,
		detail: missing.map((path) => `not found: ${path}`)
	};
	return {
		id: "manifest-bundle-patch",
		severity: "error",
		kind: "deterministic",
		status: "pass",
		message: `dsh.bundle.patch resolves to ${label}`,
		skillRef: ref
	};
}
function checkManifestMain(root, pkg) {
	const ref = skillRefFor("manifest-main");
	const main = pkg?.main;
	if (!main) return {
		id: "manifest-main",
		severity: "error",
		kind: "deterministic",
		status: "fail",
		message: "package.json has no `main` entry",
		skillRef: ref
	};
	if (!isFile(join(root, main))) return {
		id: "manifest-main",
		severity: "warning",
		kind: "deterministic",
		status: "warn",
		message: `main entry not built yet: ${main} (run the build first)`,
		skillRef: ref
	};
	return {
		id: "manifest-main",
		severity: "error",
		kind: "deterministic",
		status: "pass",
		message: `main entry present: ${main}`,
		skillRef: ref
	};
}
function checkManifestPeers(root, pkg) {
	const ref = skillRefFor("manifest-peers");
	const peers = pkg?.peerDependencies ?? {};
	const harnessImports = [...collectedImports(listSourceFiles(root))].filter((i) => i.startsWith("@deepseek-ai/"));
	if (harnessImports.length === 0) return {
		id: "manifest-peers",
		severity: "info",
		kind: "deterministic",
		status: "pass",
		message: "no @deepseek-ai/* packages imported; peers are optional",
		skillRef: ref
	};
	const expected = {};
	for (const imp of harnessImports) if (imp === "@deepseek-ai/cordis") expected[imp] = "^4.0.2";
	else if (imp === "@deepseek-ai/schemastery") expected[imp] = "^3.18.2";
	else if (imp.startsWith("@deepseek-ai/dsh-")) expected[imp] = DSH_PEER_RANGE;
	const problems = [];
	for (const [pkgName, range] of Object.entries(expected)) {
		const declared = peers[pkgName];
		if (!declared) problems.push(`imports ${pkgName} but declares no peerDependency`);
		else if (declared !== range) problems.push(`peerDependency ${pkgName} should be "${range}", found "${declared}"`);
	}
	if (problems.length > 0) return {
		id: "manifest-peers",
		severity: "error",
		kind: "deterministic",
		status: "fail",
		message: "harness imports without a matching peerDependency",
		skillRef: ref,
		detail: problems
	};
	return {
		id: "manifest-peers",
		severity: "error",
		kind: "deterministic",
		status: "pass",
		message: `peerDependencies align with harness imports (${Object.keys(expected).length})`,
		skillRef: ref
	};
}
function checkManifestEngines(_root, pkg) {
	const ref = skillRefFor("manifest-engines");
	const node = pkg?.engines?.node;
	if (!node) return {
		id: "manifest-engines",
		severity: "error",
		kind: "deterministic",
		status: "fail",
		message: "package.json has no engines.node",
		skillRef: ref
	};
	const has22 = /\b22\b/.test(node);
	const has24 = /\b24\b/.test(node);
	if (!has22 || !has24) return {
		id: "manifest-engines",
		severity: "error",
		kind: "deterministic",
		status: "fail",
		message: `engines.node "${node}" should allow Node 22 and 24 (^22.19.0 || >=24.0.0)`,
		skillRef: ref
	};
	return {
		id: "manifest-engines",
		severity: "error",
		kind: "deterministic",
		status: "pass",
		message: `engines.node "${node}" covers Node 22 and 24`,
		skillRef: ref
	};
}
function checkManifestFiles(_root, pkg) {
	const ref = skillRefFor("manifest-files");
	const files = pkg?.files;
	if (!files || files.length === 0) return {
		id: "manifest-files",
		severity: "warning",
		kind: "deterministic",
		status: "warn",
		message: "no `files` whitelist; npm will publish everything",
		skillRef: ref
	};
	const pointer = pkg?.dsh?.bundle?.patch;
	const patchFiles = (Array.isArray(pointer) ? pointer : pointer ? [pointer] : ["cordis.patch.yml"]).map((entry) => entry.replace(/^\.\//, ""));
	const main = pkg?.main;
	const problems = [];
	for (const patchFile of patchFiles) if (!files.includes(patchFile)) problems.push(`files whitelist is missing the patch file "${patchFile}"`);
	if (main && !files.includes(main) && !files.some((f) => main.startsWith(`${f.replace(/\/$/, "")}/`))) problems.push(`files whitelist is missing the main entry "${main}"`);
	if (!files.some((f) => f === "lib" || f === "dist")) problems.push("files whitelist has no built-artifact directory (`lib` or `dist`)");
	if (problems.length > 0) return {
		id: "manifest-files",
		severity: "error",
		kind: "deterministic",
		status: "fail",
		message: "files whitelist incomplete",
		skillRef: ref,
		detail: problems
	};
	return {
		id: "manifest-files",
		severity: "error",
		kind: "deterministic",
		status: "pass",
		message: "files whitelist includes patch, entry, and built artifacts",
		skillRef: ref
	};
}
function checkManifestPackageManager(_root, pkg) {
	const ref = skillRefFor("manifest-package-manager");
	const pm = pkg?.packageManager;
	if (pm === "pnpm@11.7.0") return {
		id: "manifest-package-manager",
		severity: "warning",
		kind: "deterministic",
		status: "pass",
		message: "packageManager pinned to pnpm@11.7.0",
		skillRef: ref
	};
	if (pm) return {
		id: "manifest-package-manager",
		severity: "warning",
		kind: "deterministic",
		status: "warn",
		message: `packageManager is "${pm}"; the family standard is pnpm@11.7.0`,
		skillRef: ref
	};
	return {
		id: "manifest-package-manager",
		severity: "warning",
		kind: "deterministic",
		status: "warn",
		message: "packageManager not pinned; add \"pnpm@11.7.0\" for reproducible installs",
		skillRef: ref
	};
}
/**
* Plugin Manager and Settings read display text and an icon without activating
* the plugin, so a package that runs but ships no metadata still looks broken to
* users. Passing this check is a packaging requirement, not a runtime feature.
*/
function checkDisplayMeta(root, pkg) {
	const ref = skillRefFor("display-meta");
	const problems = [];
	const notes = [];
	const localeExport = Object.keys(pkg?.exports ?? {}).find((key) => key.includes("locale"));
	if (!localeExport) problems.push("no locale export; add { \"./locale/*.json\": \"./locale/*.json\" } and a locale file with meta.title/meta.description");
	else {
		const localeDir = join(root, "locale");
		if (!isDirectory(localeDir)) problems.push(`exports "${localeExport}" but the locale/ directory is missing`);
		else {
			const files = readdirSync(localeDir).filter((f) => f.endsWith(".json"));
			if (files.length === 0) problems.push("locale/ holds no .json files");
			if (!files.find((f) => f === "en.json")) problems.push("locale/en.json is missing (English is the required fallback)");
			for (const file of files.filter((f) => f === "en.json")) {
				const meta = readJsonIfExists(join(localeDir, file));
				const title = typeof meta?.meta?.title === "string" ? meta.meta.title.trim() : "";
				const description = typeof meta?.meta?.description === "string" ? meta.meta.description.trim() : "";
				if (title === "") problems.push(`locale/${file} has no meta.title`);
				if (description === "") problems.push(`locale/${file} has no meta.description`);
			}
			if (files.length === 1) notes.push("only locale/en.json present; add the user-facing languages too");
		}
	}
	const manifestIcon = typeof pkg?.icon === "string" && pkg.icon !== "" ? pkg.icon : void 0;
	const iconExport = Object.keys(pkg?.exports ?? {}).find((key) => key === "./icon" || key.endsWith("/icon"));
	if (!manifestIcon && !iconExport) problems.push("no icon; publish an exported \"./icon\" (or a top-level package.json \"icon\")");
	if (manifestIcon) {
		const iconPath = resolve(root, manifestIcon);
		if (!isFile(iconPath)) problems.push(`package.json icon points at a missing file: ${manifestIcon}`);
		else {
			if (!ICON_EXTENSIONS.some((ext) => iconPath.toLowerCase().endsWith(ext))) problems.push(`icon must be SVG, PNG, JPEG or WebP: ${manifestIcon}`);
			const size = statSync(iconPath).size;
			if (size > ICON_MAX_BYTES) problems.push(`icon exceeds 256 KiB (${size} bytes): ${manifestIcon}`);
			if (size === 0) problems.push(`icon file is empty: ${manifestIcon}`);
		}
	}
	if (iconExport && !manifestIcon) {
		const target = pkg?.exports?.[iconExport];
		if (typeof target === "string" && target !== "" && !ICON_EXTENSIONS.some((ext) => target.toLowerCase().endsWith(ext))) problems.push(`exported ${iconExport} must resolve to SVG, PNG, JPEG or WebP (got ${target})`);
	}
	if (problems.length > 0) return {
		id: "display-meta",
		severity: "warning",
		kind: "deterministic",
		status: "warn",
		message: "display metadata incomplete (Plugin Manager shows the raw id and default artwork)",
		skillRef: ref,
		detail: [...problems, ...notes]
	};
	return {
		id: "display-meta",
		severity: "warning",
		kind: "deterministic",
		status: "pass",
		message: "display metadata present (locale meta + exported icon)",
		skillRef: ref,
		...notes.length > 0 ? { detail: notes } : {}
	};
}
/** True when the path exists and is a directory. */
function isDirectory(path) {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}
function checkReadmeFiveLangs(root) {
	const ref = skillRefFor("readme-five-langs");
	const missing = [];
	for (const lang of README_LANGS) {
		const path = join(root, lang);
		if (!isFile(path)) missing.push(lang);
		else if ((readText(path) ?? "").trim() === "") missing.push(`${lang} (empty)`);
	}
	const missingEn = missing.includes("README.md");
	const missingOthers = missing.filter((m) => m !== "README.md");
	if (missingEn) return {
		id: "readme-five-langs",
		severity: "error",
		kind: "deterministic",
		status: "fail",
		message: "README.md (English source) is missing",
		skillRef: ref,
		detail: missing
	};
	if (missingOthers.length > 0) return {
		id: "readme-five-langs",
		severity: "warning",
		kind: "deterministic",
		status: "warn",
		message: "five-language README incomplete",
		skillRef: ref,
		detail: missingOthers
	};
	return {
		id: "readme-five-langs",
		severity: "error",
		kind: "deterministic",
		status: "pass",
		message: "all five README languages present",
		skillRef: ref
	};
}
function headingsOf(text) {
	return text.split(/\r?\n/).filter((line) => line.startsWith("## ")).map((line) => line.slice(3).trim());
}
function checkReadmeConsistency(root) {
	const ref = skillRefFor("readme-consistency");
	const existing = README_LANGS.filter((lang) => isFile(join(root, lang)));
	if (existing.length < 2) return {
		id: "readme-consistency",
		severity: "warning",
		kind: "deterministic",
		status: "skip",
		message: "fewer than two READMEs; nothing to compare",
		skillRef: ref
	};
	const base = headingsOf(readText(join(root, "README.md")) ?? "");
	const mismatches = [];
	for (const lang of existing.slice(1)) {
		const headings = headingsOf(readText(join(root, lang)) ?? "");
		const missing = base.filter((h) => !headings.includes(h));
		if (missing.length > 0) mismatches.push(`${lang} is missing headings: ${missing.join(", ")}`);
	}
	if (mismatches.length > 0) return {
		id: "readme-consistency",
		severity: "warning",
		kind: "deterministic",
		status: "warn",
		message: "README headings drifted across languages",
		skillRef: ref,
		detail: mismatches
	};
	return {
		id: "readme-consistency",
		severity: "warning",
		kind: "deterministic",
		status: "pass",
		message: `README headings match across ${existing.length} languages`,
		skillRef: ref
	};
}
/** Body of SKILL.md after its YAML frontmatter, or undefined. */
function skillBody(root) {
	const text = readText(join(root, "SKILL.md"));
	if (!text) return void 0;
	if (!text.startsWith("---\n")) return text;
	const end = text.indexOf("\n---", 4);
	if (end < 0) return text;
	return text.slice(end + 4).replace(/^\n+/, "");
}
function checkRedlinePersonaRole(root) {
	const ref = skillRefFor("redline-persona-role");
	const body = skillBody(root);
	const problems = [];
	if (body !== void 0) {
		const firstContentPara = body.split(/\r?\n\s*\r?\n/).find((p) => !/^\s*#/.test(p)) ?? "";
		const firstLine = firstContentPara.split(/\r?\n/)[0] ?? "";
		if (!/[.。?!]/.test(firstLine)) problems.push("SKILL.md instruction body does not open with a role sentence");
		else if (firstLine.length > 200) problems.push("SKILL.md opening role sentence is longer than 200 characters");
		if (firstContentPara.length > 600) problems.push("SKILL.md first paragraph is a wall of text; keep injected persona paragraphs short");
	}
	for (const file of listSourceFiles(root)) {
		const text = readText(file) ?? "";
		const re = /systemPrompt\.section\(\s*['"][^'"]*['"]\s*,\s*`([^`]+)`/g;
		let match;
		while ((match = re.exec(text)) !== null) if (match[1].length > 400) problems.push(`${relativePath(root, file)}: injected systemPrompt section is a wall of text`);
	}
	if (problems.length > 0) return {
		id: "redline-persona-role",
		severity: "warning",
		kind: "heuristic",
		status: "warn",
		message: "injected persona/prompt paragraphs should open with a short role sentence",
		skillRef: ref,
		detail: problems
	};
	if (body === void 0) return {
		id: "redline-persona-role",
		severity: "warning",
		kind: "heuristic",
		status: "skip",
		message: "no SKILL.md or systemPrompt section found to inspect",
		skillRef: ref
	};
	return {
		id: "redline-persona-role",
		severity: "warning",
		kind: "heuristic",
		status: "pass",
		message: "persona paragraphs open with a short role sentence",
		skillRef: ref
	};
}
function checkRedlineWaterfallNext(root) {
	const ref = skillRefFor("redline-waterfall-next");
	const flagged = [];
	for (const file of listSourceFiles(root)) {
		const text = readText(file) ?? "";
		if (!text.includes("waterfall")) continue;
		if (!text.includes("next")) flagged.push(`${relativePath(root, file)}: mentions waterfall but never calls next()`);
	}
	if (flagged.length > 0) return {
		id: "redline-waterfall-next",
		severity: "warning",
		kind: "heuristic",
		status: "warn",
		message: "possible waterfall listener missing next()",
		skillRef: ref,
		detail: flagged
	};
	if (!listSourceFiles(root).some((f) => (readText(f) ?? "").includes("waterfall"))) return {
		id: "redline-waterfall-next",
		severity: "warning",
		kind: "heuristic",
		status: "skip",
		message: "no waterfall listeners found",
		skillRef: ref
	};
	return {
		id: "redline-waterfall-next",
		severity: "warning",
		kind: "heuristic",
		status: "pass",
		message: "waterfall listeners call next()",
		skillRef: ref
	};
}
function checkRedlineNoHardcodedTunables(root) {
	const ref = skillRefFor("redline-no-hardcoded-tunables");
	const files = listSourceFiles(root);
	const plainObjectConfigs = [];
	const schemaConfigs = [];
	for (const file of files) {
		const text = readText(file) ?? "";
		if (/export\s+const\s+Config\s*=\s*\{/.test(text)) plainObjectConfigs.push(relativePath(root, file));
		if (/export\s+const\s+Config\s*=\s*Schema\./.test(text)) schemaConfigs.push(relativePath(root, file));
	}
	if (plainObjectConfigs.length > 0) return {
		id: "redline-no-hardcoded-tunables",
		severity: "error",
		kind: "heuristic",
		status: "fail",
		message: "Config is a plain object; it must be a Schemastery Schema",
		skillRef: ref,
		detail: plainObjectConfigs
	};
	if (schemaConfigs.length === 0) return {
		id: "redline-no-hardcoded-tunables",
		severity: "warning",
		kind: "heuristic",
		status: "skip",
		message: "no Config schema found to inspect",
		skillRef: ref
	};
	return {
		id: "redline-no-hardcoded-tunables",
		severity: "warning",
		kind: "heuristic",
		status: "pass",
		message: `Config uses Schemastery Schema (${schemaConfigs.length} file(s))`,
		skillRef: ref
	};
}
function checkRedlineEffectRegistration(root) {
	const ref = skillRefFor("redline-effect-registration");
	const files = listSourceFiles(root);
	const manualTeardown = [];
	for (const file of files) {
		const text = readText(file) ?? "";
		if (/removeListener\(|removeAllListeners\(|\.off\(/.test(text)) manualTeardown.push(`${relativePath(root, file)}: manual event-listener teardown detected; registrations must be reversible via ctx.effect()/disposer`);
	}
	if (manualTeardown.length > 0) return {
		id: "redline-effect-registration",
		severity: "warning",
		kind: "heuristic",
		status: "warn",
		message: "possible non-effect manual teardown",
		skillRef: ref,
		detail: manualTeardown
	};
	return {
		id: "redline-effect-registration",
		severity: "warning",
		kind: "heuristic",
		status: "pass",
		message: "no manual teardown patterns detected",
		skillRef: ref
	};
}
/** Registration idioms that must never run after the first `await` of an async apply. */
const ASYNC_APPLY_REGISTRATION = [
	["ctx.effect", /\bctx\.effect\s*\(/],
	["ctx.on", /\bctx\.on\s*\(/],
	["ctx.provide", /\bctx\.provide\s*\(/],
	["ctx.plugin", /\bctx\.plugin\s*\(/],
	["register()", /\.register\s*\(/]
];
/** Braces of the block whose `{` is at `openIdx`, skipping strings and comments. Returns the inner body or undefined. */
function blockBody(text, openIdx) {
	let depth = 0;
	let quote = null;
	let lineComment = false;
	let blockComment = false;
	for (let i = openIdx; i < text.length; i++) {
		const ch = text[i];
		const next = text[i + 1];
		if (lineComment) {
			if (ch === "\n") lineComment = false;
			continue;
		}
		if (blockComment) {
			if (ch === "*" && next === "/") {
				blockComment = false;
				i++;
			}
			continue;
		}
		if (quote) {
			if (ch === "\\") {
				i++;
				continue;
			}
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === "/" && next === "/") {
			lineComment = true;
			i++;
			continue;
		}
		if (ch === "/" && next === "*") {
			blockComment = true;
			i++;
			continue;
		}
		if (ch === "\"" || ch === "'" || ch === "`") {
			quote = ch;
			continue;
		}
		if (ch === "{") depth++;
		else if (ch === "}") {
			depth--;
			if (depth === 0) return text.slice(openIdx + 1, i);
		}
	}
}
/** Index just past the first top-level (brace-depth 0) `await` keyword, or -1. */
function firstTopLevelAwait(body) {
	let depth = 0;
	let quote = null;
	let lineComment = false;
	let blockComment = false;
	for (let i = 0; i < body.length - 5; i++) {
		const ch = body[i];
		const next = body[i + 1];
		if (lineComment) {
			if (ch === "\n") lineComment = false;
			continue;
		}
		if (blockComment) {
			if (ch === "*" && next === "/") {
				blockComment = false;
				i++;
			}
			continue;
		}
		if (quote) {
			if (ch === "\\") {
				i++;
				continue;
			}
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === "/" && next === "/") {
			lineComment = true;
			i++;
			continue;
		}
		if (ch === "/" && next === "*") {
			blockComment = true;
			i++;
			continue;
		}
		if (ch === "\"" || ch === "'" || ch === "`") {
			quote = ch;
			continue;
		}
		if (ch === "{") depth++;
		else if (ch === "}") depth--;
		else if (depth === 0 && ch === "a" && body.startsWith("await", i)) {
			const before = i === 0 ? "" : body[i - 1];
			const after = body[i + 5] ?? "";
			if (!/[A-Za-z0-9_$]/.test(before) && !/[A-Za-z0-9_$]/.test(after)) return i + 5;
		}
	}
	return -1;
}
/** First top-level registration idiom after `fromIdx` (nested function bodies excluded), or undefined. */
function registrationAfter(body, fromIdx) {
	let depth = 0;
	let quote = null;
	let lineComment = false;
	let blockComment = false;
	for (let i = fromIdx; i < body.length; i++) {
		const ch = body[i];
		const next = body[i + 1];
		if (lineComment) {
			if (ch === "\n") lineComment = false;
			continue;
		}
		if (blockComment) {
			if (ch === "*" && next === "/") {
				blockComment = false;
				i++;
			}
			continue;
		}
		if (quote) {
			if (ch === "\\") {
				i++;
				continue;
			}
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === "/" && next === "/") {
			lineComment = true;
			i++;
			continue;
		}
		if (ch === "/" && next === "*") {
			blockComment = true;
			i++;
			continue;
		}
		if (ch === "\"" || ch === "'" || ch === "`") {
			quote = ch;
			continue;
		}
		if (ch === "{") depth++;
		else if (ch === "}") {
			if (depth === 0) break;
			depth--;
			continue;
		}
		if (depth !== 0) continue;
		for (const [kind, re] of ASYNC_APPLY_REGISTRATION) {
			const m = re.exec(body.slice(i));
			if (m) return [kind, body.slice(i, i + Math.min(m[0].length, 40))];
		}
	}
}
function checkRedlineAsyncApplyRegistration(root) {
	const ref = skillRefFor("redline-async-apply-registration");
	const files = listSourceFiles(root);
	const flagged = [];
	for (const file of files) {
		const text = readText(file) ?? "";
		const re = /export\s+async\s+function\s+apply\s*\(/g;
		let match;
		while ((match = re.exec(text)) !== null) {
			const bodyStart = text.indexOf("{", match.index);
			if (bodyStart < 0) continue;
			const body = blockBody(text, bodyStart);
			if (body === void 0) continue;
			const awaitIdx = firstTopLevelAwait(body);
			if (awaitIdx < 0) continue;
			const hit = registrationAfter(body, awaitIdx);
			if (hit) flagged.push(`${relativePath(root, file)}: async apply calls ${hit[0]} (${hit[1]}) after its first await — registration belongs in ctx.effect()/ctx.on() or before any await`);
		}
	}
	if (flagged.length > 0) return {
		id: "redline-async-apply-registration",
		severity: "error",
		kind: "heuristic",
		status: "fail",
		message: "async apply registers after its first await (unload-window race)",
		skillRef: ref,
		detail: flagged
	};
	if (!files.some((f) => /export\s+async\s+function\s+apply\s*\(/.test(readText(f) ?? ""))) return {
		id: "redline-async-apply-registration",
		severity: "error",
		kind: "heuristic",
		status: "skip",
		message: "no async apply function found to inspect",
		skillRef: ref
	};
	return {
		id: "redline-async-apply-registration",
		severity: "error",
		kind: "heuristic",
		status: "pass",
		message: "no registration after the first await of any async apply",
		skillRef: ref
	};
}
function relativePath(root, file) {
	return file.replace(root.replace(/[\\/]$/, ""), "").replace(/^[\\/]/, "");
}

//#endregion
//#region src/cli/lib/subprocess.ts
/**
* Run a command and capture its output. Uses piped stdio so callers can read
* logs; the process is terminated on timeout or external abort.
* @param command - executable name or path.
* @param args - argument vector.
* @param options - cwd, env, timeout, and abort signal.
* @returns the exit code, captured streams, and timeout flag.
*/
function run(command, args, options = {}) {
	return new Promise((resolve) => {
		const controller = new AbortController();
		let timedOut = false;
		let settled = false;
		const finish = (result) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			options.signal?.removeEventListener("abort", onAbort);
			resolve(result);
		};
		const timer = options.timeoutMs ? setTimeout(() => {
			timedOut = true;
			controller.abort(/* @__PURE__ */ new Error(`command timed out after ${options.timeoutMs}ms`));
		}, options.timeoutMs) : void 0;
		const onAbort = () => controller.abort();
		options.signal?.addEventListener("abort", onAbort);
		const env = { ...process.env };
		for (const [key, value] of Object.entries(options.env ?? {})) if (value === void 0) delete env[key];
		else env[key] = value;
		const child = spawnCommand(command, args, {
			cwd: options.cwd,
			env,
			signal: controller.signal
		});
		let stdout = "";
		let stderr = "";
		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr?.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", (err) => {
			finish({
				code: null,
				stdout,
				stderr: `${stderr}\n${err.message}`,
				timedOut,
				signal: null
			});
		});
		child.on("close", (code, signal) => {
			finish({
				code,
				stdout,
				stderr,
				timedOut,
				signal
			});
		});
	});
}
function spawnCommand(command, args, options) {
	if (process.platform === "win32") return spawn(winCommandLine(command, args), {
		cwd: options.cwd,
		env: options.env,
		stdio: [
			"ignore",
			"pipe",
			"pipe"
		],
		signal: options.signal,
		shell: true,
		windowsHide: true
	});
	return spawn(command, args, {
		cwd: options.cwd,
		env: options.env,
		stdio: [
			"ignore",
			"pipe",
			"pipe"
		],
		signal: options.signal
	});
}
function winCommandLine(command, args) {
	return [command, ...args].map(quoteWin).join(" ");
}
function quoteWin(arg) {
	if (!/[\s"&|<>^()]/.test(arg)) return arg;
	return `"${arg.replace(/(["\\])/g, "\\$1")}"`;
}
/** Format a run result's streams into a short tail for failure reports. */
function tailOf(result, lines = 40) {
	return `${result.stdout}\n${result.stderr}`.trim().split(/\r?\n/).slice(-lines).join("\n");
}

//#endregion
//#region src/cli/commands/new.ts
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
/** Normalize and validate a user-supplied plugin name. */
function normalizeName(raw) {
	let name = raw.trim();
	if (name.startsWith("@")) {
		const slash = name.indexOf("/");
		if (slash >= 0) name = name.slice(slash + 1);
	}
	if (name.startsWith("dsh-")) name = name.slice(4);
	if (!NAME_RE.test(name)) throw new Error(`invalid plugin name "${raw}": use lowercase letters, digits, and hyphens (e.g. hello-plugin)`);
	return {
		name,
		pkgName: `dsh-${name}`
	};
}
/** True when the directory exists and contains any entry. */
function dirNonEmpty(dir) {
	if (!isDir(dir)) return false;
	return readdirSync(dir).length > 0;
}
/**
* Run the scaffolder. Returns the target directory path.
* @param cwd - current working directory.
* @param options - name, language, target dir, force, and git flags.
*/
async function runNew(cwd, options) {
	const { name, pkgName } = normalizeName(options.name);
	const targetDir = resolve(options.dir ?? join(cwd, name));
	if (dirNonEmpty(targetDir) && !options.force) throw new Error(`target directory already exists and is not empty: ${targetDir} (use --force to overwrite template files)`);
	const year = String((/* @__PURE__ */ new Date()).getFullYear());
	const files = renderScaffold(options.lang, {
		name,
		pkgName,
		version: "0.1.0",
		year
	});
	writeScaffold(targetDir, files);
	if (options.git) await initGit(targetDir);
	return {
		targetDir,
		files: files.length
	};
}
async function initGit(targetDir) {
	await run("git", ["init"], {
		cwd: targetDir,
		timeoutMs: 3e4
	});
}

//#endregion
//#region src/cli/commands/verify.ts
/**
* The verified harness line `verify` installs into its throwaway profile.
*
* Keep these in lockstep with `.github/workflows/compat.yml`, which installs the
* same versions. `dsh` rejects an incompatible plugin/base pair at install time,
* so a stale pin turns `verify` into a failure that names the *base bundle*
* rather than the plugin under test:
*
*   dsh: installation rejected: Plugin @deepseek-ai/dsh-headless@<old> is
*   incompatible with dsh <new>
*
* `tests/verify.test.ts` asserts these match compat.yml, so the two cannot drift
* apart silently again. Override per run with `--base` / `--headless`.
*/
const VERIFY_BASE_SPEC = "@deepseek-ai/dsh-base@0.2.1-alpha.1";
const VERIFY_HEADLESS_SPEC = "@deepseek-ai/dsh-headless@0.2.1-alpha.1";
const PROFILE_WORKSPACE = `# scratch profile allowlist (mirrors the repo's compat workflow)
packages:
  - .
nodeLinker: hoisted
autoInstallPeers: false
allowBuilds:
  '@deepseek-ai/dsh-subprocess-local': true
  koffi: true
  node-pty: true
  protobufjs: true
  '@google/genai': true
`;
/**
* Run the full verify smoke. Never throws for a verification failure; instead it
* returns a non-zero exit code with the failing step tail and suggestions. Temp
* directories are always cleaned up in `finally`.
*/
async function runVerify(options) {
	const root = resolve(options.root);
	const pkgName = readJsonIfExists(join(root, "package.json"))?.name ?? "plugin";
	const workDir = createTempDir("verify");
	const homeDir = createTempDir("home");
	const steps = [];
	let failure;
	const push = (step, result) => {
		const ok = result.code === 0 && !result.timedOut;
		steps.push({
			step,
			ok,
			detail: ok ? "ok" : tailOf(result)
		});
	};
	try {
		const pack = await run(options.pnpmBin, [
			"pack",
			"--pack-destination",
			workDir
		], {
			cwd: root,
			timeoutMs: options.timeoutMs
		});
		push("pack", pack);
		if (pack.code !== 0) {
			failure = {
				error: "pnpm pack failed",
				suggestions: suggestionsFor("pack", pack)
			};
			return {
				steps,
				exitCode: 1,
				...failure
			};
		}
		const tarball = findTarball(workDir);
		if (!tarball) {
			failure = {
				error: `no tarball produced in ${workDir}`,
				suggestions: ["run `pnpm pack --pack-destination <dir>` manually and inspect the output"]
			};
			return {
				steps,
				exitCode: 1,
				...failure
			};
		}
		const profileDir = join(homeDir, "profiles", options.profile);
		writeFileDeep(join(profileDir, "pnpm-workspace.yaml"), PROFILE_WORKSPACE);
		const add = await run(options.dshBin, [
			"plugin",
			"--profile",
			options.profile,
			"add",
			options.base,
			options.headless,
			tarball
		], {
			cwd: homeDir,
			env: { DSH_HOME: homeDir },
			timeoutMs: options.timeoutMs
		});
		push("install", add);
		if (add.code !== 0) {
			failure = {
				error: "profile install failed",
				suggestions: suggestionsFor("install", add)
			};
			return {
				steps,
				exitCode: 1,
				...failure
			};
		}
		const dump = await run(options.dshBin, [
			"--profile",
			options.profile,
			"--dump-config"
		], {
			cwd: homeDir,
			env: { DSH_HOME: homeDir },
			timeoutMs: options.timeoutMs
		});
		push("dump-config", dump);
		if (dump.code !== 0) {
			failure = {
				error: "dump-config failed",
				suggestions: suggestionsFor("dump-config", dump)
			};
			return {
				steps,
				exitCode: 1,
				...failure
			};
		}
		if (!dump.stdout.includes(pkgName)) {
			failure = {
				error: `bundle row "${pkgName}" did not mount`,
				suggestions: [`dump-config output did not contain "${pkgName}"`]
			};
			return {
				steps,
				exitCode: 1,
				...failure
			};
		}
		const smoke = await run(options.dshBin, [
			"--profile",
			options.profile,
			"Reply with exactly: ok"
		], {
			cwd: homeDir,
			env: { DSH_HOME: homeDir },
			timeoutMs: options.smokeTimeoutMs
		});
		const smokeOk = isSmokeOk(smoke.stdout, smoke.stderr);
		steps.push({
			step: "headless-smoke",
			ok: smokeOk,
			detail: smokeOk ? `${smoke.stdout}\n${smoke.stderr}`.includes("MISSING_CREDENTIAL") ? "ok (keyless)" : "ok (with key)" : tailOf(smoke)
		});
		if (!smokeOk) {
			failure = {
				error: "headless smoke did not prove tree load",
				suggestions: suggestionsFor("headless", smoke)
			};
			return {
				steps,
				exitCode: 1,
				...failure
			};
		}
		const remove = await run(options.dshBin, [
			"plugin",
			"--profile",
			options.profile,
			"remove",
			pkgName
		], {
			cwd: homeDir,
			env: { DSH_HOME: homeDir },
			timeoutMs: options.timeoutMs
		});
		push("uninstall", remove);
		if (remove.code !== 0) {
			failure = {
				error: "uninstall failed",
				suggestions: suggestionsFor("uninstall", remove)
			};
			return {
				steps,
				exitCode: 1,
				...failure
			};
		}
		return {
			steps,
			exitCode: 0,
			suggestions: []
		};
	} finally {
		cleanupAllTempDirs();
	}
}
function findTarball(dir) {
	for (const entry of readdirSync(dir)) if (entry.endsWith(".tgz")) return join(dir, entry);
}
function suggestionsFor(step, result) {
	const base = [`tail of "${step}":\n${tailOf(result)}`];
	if (result.timedOut) base.push(`command timed out; raise --timeout or --smoke-timeout`);
	if (step === "install") {
		base.push("ensure the dsh CLI is @deepseek-ai/dsh@0.2.1-alpha.1 (older builds such as the rc.6 line do not satisfy the compat pin)");
		base.push("confirm the profile allowlist matches the repo compat workflow (native builds allowlisted)");
	}
	if (step === "headless") base.push("a hang usually means an injected service stayed pending; the smoke timeout surfaces exactly that");
	return base;
}
/** Error signatures a headless smoke prints only *after* the tree loaded. */
const SMOKE_LOADED_SIGNATURES = [
	"MISSING_CREDENTIAL",
	"TRANSPORT:",
	"transport failed",
	"UNAUTHORIZED",
	"invalid api key",
	"API key is invalid"
];
/**
* True when a headless smoke run proves the plugin tree loaded. Three accepted
* outcomes, all of which require that the tree mounted and the turn dispatched:
* a keyless run printing `MISSING_CREDENTIAL`, a keyed run printing `ok`, or a
* keyed run whose provider call failed at the transport/auth layer.
*
* The third case is not a fallback for a broken plugin: a plugin that never
* mounted produces no provider traffic at all, so it prints none of these
* signatures and still fails this check.
*
* @param stdout - captured stdout.
* @param stderr - captured stderr.
*/
function isSmokeOk(stdout, stderr) {
	const text = `${stdout}\n${stderr}`;
	if (SMOKE_LOADED_SIGNATURES.some((signature) => text.includes(signature))) return true;
	return /(^|[^a-z])ok([^a-z]|$)/i.test(text);
}
/** Resolve the dsh binary: explicit flag/env first, then PATH `dsh`. */
function resolveDsh(flag) {
	return flag ?? process.env.DSH_PLUGIN_DEV_DSH ?? "dsh";
}
/** Resolve the pnpm binary: explicit flag/env first, then PATH `pnpm`. */
function resolvePnpm(flag) {
	return flag ?? process.env.DSH_PLUGIN_DEV_PNPM ?? "pnpm";
}
/** Format the verify steps for the console. */
function renderVerifySteps(root, steps) {
	const lines = [`verify: ${root}`, ""];
	for (const step of steps) lines.push(`${step.ok ? "✓" : "✗"} ${step.step}${step.ok ? "" : `\n${step.detail}`}`);
	return lines.join("\n");
}

//#endregion
//#region src/cli/main.ts
const HELP = `dsh-plugin-dev — the DeepSeek Harness plugin-development CLI

Usage:
  dsh-plugin-dev <command> [options]

Commands:
  new <name>      Scaffold a TypeScript or JavaScript plugin repo skeleton
                  (src/index.ts contract template, Schemastery Config, tests,
                  tsdown/vitest, cordis.patch.yml, five-language READMEs).
                  Flags: --lang <ts|js> --dir <path> --force --git
  check           Run static plugin checks and emit a CI-consumable report.
                  Flags: --cwd <dir> --json --strict
  verify          pnpm pack, then install/start/uninstall the bundle in a clean
                  mkdtemp DSH_HOME profile (aligned with verify:self-contained).
                  Flags: --cwd <dir> --dsh <bin> --pnpm <bin> --profile <name>
                         --base <spec> --headless <spec> --timeout <ms>
                         --smoke-timeout <ms>

Global:
  -h, --help      Show this help
  -V, --version   Print the CLI version

Environment tunables:
  DSH_PLUGIN_DEV_TEMPLATES     override the scaffold templates directory
  DSH_PLUGIN_DEV_DSH           override the dsh CLI used by verify
  DSH_PLUGIN_DEV_PNPM          override the pnpm binary used by verify
  DSH_PLUGIN_DEV_TIMEOUT       install/pack timeout in ms (default 300000)
  DSH_PLUGIN_DEV_SMOKE_TIMEOUT headless smoke timeout in ms (default 120000)
`;
const DEFAULT_TIMEOUT_MS = 3e5;
const DEFAULT_SMOKE_TIMEOUT_MS = 12e4;
/** Parse a millisecond integer flag with an env-tunable fallback. */
function timeoutMs(flags, key, envKey, fallback) {
	const raw = flagString(flags, key, process.env[envKey]);
	if (raw === void 0) return fallback;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`invalid ${key} value "${raw}": expected a positive millisecond count`);
	return parsed;
}
/**
* Run the CLI and return a process exit code.
* @param argv - process.argv.slice(2) style input.
* @param cwd - working directory (injectable for tests).
*/
async function main(argv, cwd = process.cwd()) {
	const { positionals, flags } = parseArgs(argv);
	if (flagBool(flags, "version") || flags.V === true) {
		process.stdout.write(`${readCliVersion()}\n`);
		return 0;
	}
	if (flagBool(flags, "help") || flags.h === true || positionals.length === 0) {
		process.stdout.write(HELP);
		return 0;
	}
	const command = positionals[0];
	try {
		switch (command) {
			case "new": {
				const name = positionals[1];
				if (!name) throw new Error("missing plugin name: dsh-plugin-dev new <name>");
				const lang = flagString(flags, "lang", "ts");
				if (lang !== "ts" && lang !== "js") throw new Error(`--lang must be "ts" or "js", got "${lang}"`);
				const result = await runNew(cwd, {
					name,
					lang,
					dir: flagString(flags, "dir"),
					force: flagBool(flags, "force"),
					git: flagBool(flags, "git")
				});
				process.stdout.write(`scaffolded ${result.files} files into ${result.targetDir}\n`);
				return 0;
			}
			case "check": {
				const root = flagString(flags, "cwd", cwd) ?? cwd;
				const { report, exitCode } = runCheck({
					root,
					strict: flagBool(flags, "strict")
				});
				printCheckReport(report, flagBool(flags, "json") ? "json" : "text");
				return exitCode;
			}
			case "verify": {
				const root = flagString(flags, "cwd", cwd) ?? cwd;
				const result = await runVerify({
					root,
					dshBin: resolveDsh(flagString(flags, "dsh")),
					pnpmBin: resolvePnpm(flagString(flags, "pnpm")),
					profile: flagString(flags, "profile", "compat") ?? "compat",
					base: flagString(flags, "base", "@deepseek-ai/dsh-base@0.2.1-alpha.1") ?? "@deepseek-ai/dsh-base@0.2.1-alpha.1",
					headless: flagString(flags, "headless", "@deepseek-ai/dsh-headless@0.2.1-alpha.1") ?? "@deepseek-ai/dsh-headless@0.2.1-alpha.1",
					timeoutMs: timeoutMs(flags, "timeout", "DSH_PLUGIN_DEV_TIMEOUT", DEFAULT_TIMEOUT_MS),
					smokeTimeoutMs: timeoutMs(flags, "smoke-timeout", "DSH_PLUGIN_DEV_SMOKE_TIMEOUT", DEFAULT_SMOKE_TIMEOUT_MS)
				});
				process.stdout.write(renderVerifySteps(root, result.steps));
				process.stdout.write("\n");
				if (result.error) {
					process.stdout.write(`FAIL: ${result.error}\n`);
					for (const suggestion of result.suggestions) process.stdout.write(`  - ${suggestion}\n`);
				} else process.stdout.write("verify: OK\n");
				return result.exitCode;
			}
			default:
				process.stderr.write(`unknown command "${command}"\n\n${HELP}`);
				return 2;
		}
	} catch (err) {
		process.stderr.write(`dsh-plugin-dev: ${err instanceof Error ? err.message : String(err)}\n`);
		return 1;
	}
}

//#endregion
//#region src/cli/entry.ts
main(process.argv.slice(2)).then((code) => {
	process.exitCode = code;
}, (err) => {
	process.stderr.write(`dsh-plugin-dev: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
	process.exitCode = 1;
});

//#endregion
export {  };