import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const violations = [];
const forbiddenPaths = [".data/", "source-materials/", "dist/", "dist-server/", "test-results/", "playwright-report/"];
const forbiddenExtensions = /\.(?:db|db-wal|db-shm|zip|rar|7z|epub)$/i;
const secretPatterns = [
  { label: "provider API key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { label: "embedded bearer token", pattern: /\bBearer\s+[A-Za-z0-9._~-]{32,}\b/g },
  { label: "credential in URL", pattern: /https?:\/\/[^\s/@:]+:[^\s/@]+@/g },
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];

for (const file of tracked) {
  if (forbiddenPaths.some((prefix) => file.startsWith(prefix)) || forbiddenExtensions.test(file) || /(^|\/)\.env(?:\.|$)/.test(file)) {
    violations.push(`${file}: forbidden tracked release artifact`);
    continue;
  }
  if (statSync(file).size > 2_000_000) continue;
  const content = readFileSync(file);
  if (content.includes(0)) continue;
  const text = content.toString("utf8");
  for (const { label, pattern } of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) violations.push(`${file}: ${label}`);
  }
}

if (violations.length) {
  console.error("Release security check failed. No secret values are printed.");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Release security check passed: ${tracked.length} tracked files, no forbidden private artifacts or credential patterns.`);
