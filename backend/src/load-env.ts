// Side-effect module: import first, before config.ts reads process.env.
// Loads ENV_FILE if set, else backend/.env. Real environment variables always win.
import { loadDotEnv } from "./env.js";

loadDotEnv(process.env.ENV_FILE ?? new URL("../../.env", import.meta.url));
