---
"cloudroutes-map": patch
---

- Fixed the Vercel build failing with `Cannot find name 'fetch' / 'process' / 'Response'` in `vite.config.ts`. The dev proxy added there uses node globals, but `@types/node` was never a dependency of this project — locally it resolved from a stray copy in a parent directory, so `tsc -b` passed here and failed in CI. It is now a declared devDependency, and `tsconfig.node.json` states `"types": ["node"]` so a missing copy fails loudly instead of being satisfied from outside the project.
