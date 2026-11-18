// Application guards (docs/SECURITY.md §2, §9; EVALUATION S5, S11, S12). Fails CI on violation.
//  1. Every exported Server Action under src/app/app/ verifies the user first: its first statement
//     is `requireRequestContext()` (EVALUATION S5/S6/A7 — rejected before any service call).
//  2. No console.* anywhere in src/: nothing can write message content, drafts or tokens to logs (S11).
//  3. No `use cache`, unstable_cache or cacheLife in src/: private data is never cached (S12).
//  4. No send capability (PRD v0.1): no fetch/XHR/beacon/mailto in src/ outside the AI provider
//     adapters, and no email or messaging library among the dependencies.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) files.push(p);
  }
})("src");

const errors = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (/\bconsole\.(log|info|warn|error|debug|trace|dir)\b/.test(line)) errors.push(`${file}:${i + 1}: console.* is not allowed in src/ (no logging of private data)`);
    if (/["']use cache["']|\bunstable_cache\b|\bcacheLife\b|\bcacheTag\b/.test(line)) errors.push(`${file}:${i + 1}: caching is not allowed for private workspace data`);
    if (!file.startsWith(join("src", "lib", "ai", "providers")) && /\bfetch\(|XMLHttpRequest|sendBeacon|mailto:/.test(line)) {
      errors.push(`${file}:${i + 1}: outbound requests are not allowed outside src/lib/ai/providers (v0.1 has no send capability)`);
    }
  });

  if (file.startsWith(join("src", "app", "app")) && /^\s*["']use server["'];?/m.test(text)) {
    const re = /export\s+async\s+function\s+(\w+)\s*\(/g;
    let m;
    while ((m = re.exec(text))) {
      // Find the function body's opening brace (after the parameter list and return type).
      let depth = 0;
      let i = m.index + m[0].length - 1;
      for (; i < text.length; i++) {
        if (text[i] === "(") depth++;
        else if (text[i] === ")") depth--;
        else if (text[i] === "{" && depth === 0) {
          // Skip object-typed return annotations such as `Promise<{ a: string }>`.
          const before = text.slice(m.index, i);
          if ((before.match(/</g) ?? []).length === (before.match(/>/g) ?? []).length) break;
        }
      }
      const first = text.slice(i + 1).trimStart().split("\n")[0];
      if (!/^(const\s+\w+\s*=\s*)?await requireRequestContext\(\);/.test(first)) {
        const line = text.slice(0, m.index).split("\n").length;
        errors.push(`${file}:${line}: Server Action ${m[1]} must start with \`await requireRequestContext()\``);
      }
    }
  }
}

const deps = Object.keys(JSON.parse(readFileSync("package.json", "utf8")).dependencies ?? {});
for (const d of deps) {
  if (/mail|smtp|resend|sendgrid|postmark|mailgun|twilio|slack|discord|gmail|googleapis/i.test(d)) errors.push(`package.json: dependency ${d} looks like a sending capability (not allowed in v0.1)`);
}

if (errors.length) {
  for (const e of errors) console.error(`::error::${e}`);
  process.exit(1);
}
console.log(`app guards ok (${files.length} files checked)`);
