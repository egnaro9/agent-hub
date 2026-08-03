// The app has no @types/node dependency and this suite does not warrant adding
// one — the config only reads two env vars. Delete this file if @types/node
// ever lands in package.json (it would collide).
declare const process: { env: Record<string, string | undefined> };
