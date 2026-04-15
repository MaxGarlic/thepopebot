/**
 * Vault write helper — appends chat summaries to CLAUDE.md files in the vault.
 *
 * The vault is bind-mounted into the container at VAULT_MOUNT (default /vault).
 * Paths passed to appendSummaryToVault are RELATIVE to VAULT_MOUNT (e.g.
 * 'AREAS/SALES/generals-recruitment/vince-citro/CLAUDE.md').
 *
 * All writes are fail-soft: errors are logged but do not throw to callers.
 */
import fs from 'fs/promises';
import path from 'path';

const VAULT_MOUNT = process.env.VAULT_MOUNT || '/vault';
// AREAS is the root of the bucket tree inside the vault mount.
// All vault_path values are normalized to be under AREAS/ so they land on the
// bind-mounted host folder instead of the ephemeral container filesystem.
const AREAS_PREFIX = 'AREAS/';

/**
 * Resolve a vault_path to an absolute path under VAULT_MOUNT/AREAS.
 * Auto-prepends 'AREAS/' if not already present so bucket paths (e.g. 'SALES/foo/CLAUDE.md')
 * resolve correctly. Guards against path traversal (../ escapes).
 */
function resolveVaultPath(relativePath) {
  if (!relativePath) throw new Error('vault_path is empty');
  // Strip leading slash
  let clean = relativePath.replace(/^\/+/, '');
  // Normalize: ensure path starts under AREAS/
  if (!clean.startsWith(AREAS_PREFIX)) {
    clean = AREAS_PREFIX + clean;
  }
  const abs = path.resolve(VAULT_MOUNT, clean);
  // Ensure the resolved path is still inside VAULT_MOUNT/AREAS (no traversal)
  const areasReal = path.resolve(VAULT_MOUNT, 'AREAS');
  if (!abs.startsWith(areasReal + path.sep) && abs !== areasReal) {
    throw new Error(`vault_path escapes AREAS: ${relativePath}`);
  }
  return abs;
}

/**
 * Format a summary block with timestamp header.
 * Timestamp uses local ISO-ish format for human readability.
 */
function formatSummaryBlock(chatTitle, summary, trigger) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const triggerLabel = trigger === 'manual' ? '(manual /save)' : '(auto)';
  return (
    `\n## ${timestamp} — Chat Summary ${triggerLabel}\n` +
    (chatTitle ? `**Chat:** ${chatTitle}\n\n` : '') +
    `${summary.trim()}\n\n---\n`
  );
}

/**
 * Append a summary to the target CLAUDE.md file in the vault.
 * Creates the file (and parent directories) if missing.
 *
 * @param {string} relativePath - e.g. 'AREAS/SALES/generals-recruitment/vince-citro/CLAUDE.md'
 * @param {string} chatTitle - Chat title for context in the summary header
 * @param {string} summary - Summary text
 * @param {'finalize'|'manual'} trigger - What triggered the write
 */
export async function appendSummaryToVault(relativePath, chatTitle, summary, trigger = 'manual') {
  const absPath = resolveVaultPath(relativePath);
  const block = formatSummaryBlock(chatTitle, summary, trigger);

  // Ensure parent dir exists
  await fs.mkdir(path.dirname(absPath), { recursive: true });

  // If file doesn't exist yet, seed it with a header
  let exists = true;
  try {
    await fs.access(absPath);
  } catch {
    exists = false;
  }

  if (!exists) {
    const base = path.basename(path.dirname(absPath)) || 'Project';
    const seed =
      `# ${base}\n\n` +
      `Auto-created by PopeBot on ${new Date().toISOString().slice(0, 10)}.\n\n` +
      `## Chat Summary Log\n`;
    await fs.writeFile(absPath, seed, 'utf8');
  }

  await fs.appendFile(absPath, block, 'utf8');
  return { path: absPath, relativePath };
}
