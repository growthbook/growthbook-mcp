#!/usr/bin/env node

/**
 * Sync version across package.json, manifest.json, server.json, and .cursor-plugin/plugin.json
 * Reads version from package.json and updates the other files
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

const packageJsonPath = join(rootDir, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const version = packageJson.version;

if (!version) {
  console.error("Error: No version found in package.json");
  process.exit(1);
}

console.log(`Syncing version ${version} across all files...`);

const manifestPath = join(rootDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
manifest.version = version;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`✓ Updated manifest.json`);

const serverPath = join(rootDir, "server.json");
const server = JSON.parse(readFileSync(serverPath, "utf-8"));
server.version = version;
if (server.packages && server.packages[0]) {
  server.packages[0].version = version;
}
writeFileSync(serverPath, JSON.stringify(server, null, 2) + "\n");
console.log(`✓ Updated server.json`);

const cursorPluginPath = join(rootDir, ".cursor-plugin", "plugin.json");
const cursorPlugin = JSON.parse(readFileSync(cursorPluginPath, "utf-8"));
cursorPlugin.version = version;
writeFileSync(cursorPluginPath, JSON.stringify(cursorPlugin, null, 2) + "\n");
console.log(`✓ Updated .cursor-plugin/plugin.json`);

console.log(`\nVersion ${version} successfully synced across all files!`);
