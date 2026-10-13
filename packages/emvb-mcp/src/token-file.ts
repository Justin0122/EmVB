import { readFileSync, statSync } from "node:fs";
import { OptionsError } from "./options.ts";

/**
 * Reads --token-file (W-474). A file other users can read gets a warning, like ssh gives for a
 * loose key; a missing or unreadable file is a plain message, not a stack trace.
 */
export const readTokenFile =
  (warn: (message: string) => void, fs = { readFileSync, statSync }) =>
  (path: string): string => {
    try {
      const { mode } = fs.statSync(path);
      if (process.platform !== "win32" && (mode & 0o077) !== 0) {
        warn(
          `${path} can be read by other users of this computer (mode ${(mode & 0o777).toString(8)}). Run: chmod 600 ${path}`,
        );
      }
      return fs.readFileSync(path, "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") throw new OptionsError(`No token file at ${path}.`);
      if (code === "EACCES")
        throw new OptionsError(`Can't read the token file ${path}: permission denied.`);
      throw new OptionsError(
        `Can't read the token file ${path}: ${String((error as Error).message)}`,
      );
    }
  };
