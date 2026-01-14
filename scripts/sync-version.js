#!/usr/bin/env node

/**
 * Sync version across package.json, manifest.json, and server.json
 * Reads version from package.json and updates the other files
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

// Read version from package.json
const packageJsonPath = join(rootDir, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const version = packageJson.version;

if (!version) {
  console.error("Error: No version found in package.json");
  process.exit(1);
}

console.log(`Syncing version ${version} across all files...`);

// Update manifest.json
const manifestPath = join(rootDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
manifest.version = version;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`✓ Updated manifest.json`);

// Update server.json (both the root version and packages[0].version)
const serverPath = join(rootDir, "server.json");
const server = JSON.parse(readFileSync(serverPath, "utf-8"));
server.version = version;
if (server.packages && server.packages[0]) {
  server.packages[0].version = version;
}
writeFileSync(serverPath, JSON.stringify(server, null, 2) + "\n");
console.log(`✓ Updated server.json`);

console.log(`\nVersion ${version} successfully synced across all files!`);
