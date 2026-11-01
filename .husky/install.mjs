// Installs the git hooks for local development. Skipped on CI and Vercel, where devDependencies
// may be missing and hooks aren't needed.
if (process.env.CI || process.env.VERCEL || process.env.NODE_ENV === "production") process.exit(0);

try {
  const { default: husky } = await import("husky");
  const message = husky();
  if (message) console.log(message);
} catch {
  // husky isn't installed (e.g. --omit=dev): nothing to set up.
}
