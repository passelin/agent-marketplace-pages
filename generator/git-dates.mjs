#!/usr/bin/env node

import { execSync } from "child_process";

/**
 * Get the last modification date for all tracked files in specified directories.
 * Returns a Map of file path -> ISO date string.
 *
 * @param {string[]} directories - Array of directory paths to scan
 * @param {string} rootDir - Root directory for relative paths
 * @returns {Map<string, string>} Map of relative file path to ISO date string
 */
export function getGitFileDates(directories, rootDir) {
  const fileDates = new Map();

  try {
    const gitArgs = [
      "--no-pager",
      "log",
      "--format=%aI",
      "--name-only",
      "--diff-filter=ACMR",
      "--",
      ...directories,
    ];

    const output = execSync(`git ${gitArgs.join(" ")}`, {
      encoding: "utf8",
      cwd: rootDir,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let currentDate = null;
    const lines = output.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
        currentDate = trimmed;
      } else if (currentDate && trimmed) {
        if (!fileDates.has(trimmed)) {
          fileDates.set(trimmed, currentDate);
        }
      }
    }
  } catch (error) {
    console.warn("Warning: Could not get git dates:", error.message);
  }

  return fileDates;
}

/**
 * Get the last modification date for a single file.
 *
 * @param {string} filePath - Path to the file (relative to git root)
 * @param {string} rootDir - Root directory
 * @returns {string|null} ISO date string or null if not found
 */
export function getGitFileDate(filePath, rootDir) {
  try {
    const output = execSync(
      `git --no-pager log -1 --format="%aI" -- "${filePath}"`,
      { encoding: "utf8", cwd: rootDir, stdio: ["pipe", "pipe", "pipe"] }
    );
    return output.trim() || null;
  } catch {
    return null;
  }
}
