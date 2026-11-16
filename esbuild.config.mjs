import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { readFileSync } from "fs";

const production = process.argv[2] === "production";

// The plugin reports its own version to the service (the hippocampus-client-version header, shown on
// the topology view), and manifest.json is where that version lives.
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		...builtins,
	],
	format: "cjs",
	// ES2020 for BigInt: hippocampus-client carries int64 fields as bigint. Every Electron Obsidian
	// ships runs it.
	target: "es2020",
	logLevel: "info",
	sourcemap: production ? false : "inline",
	treeShaking: true,
	define: {
		__PLUGIN_VERSION__: JSON.stringify(manifest.version),
	},
	outfile: "main.js",
});

if (production) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
