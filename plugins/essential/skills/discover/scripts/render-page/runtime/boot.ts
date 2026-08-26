import { safeStore } from "./store.ts";
import { applyScheme, readScheme } from "./theme.ts";

// this runs in the head, before the body exists and before the first paint.
// Applying the saved scheme any later would show the reader the system's
// colours first and then replace them, which is the flash a manual override is
// supposed to remove.
applyScheme(document.documentElement, readScheme(safeStore()));
