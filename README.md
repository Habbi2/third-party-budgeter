# Third‑Party Script Budgeter

Find, measure, and control third‑party scripts and styles on your site. Quickly list external JS/CSS, estimate sizes, flag blocking scripts, and group by domain to spot heavy vendors.

## Quick Start

```bash
npm install
npm run dev
# open http://localhost:3000
```

## API

GET /api/budget?url=https://example.com

Responds with JSON summary: resource list, totals, and per‑domain aggregates.

## Notes
- Sizes are best‑effort via HEAD content-length (may be null if not provided).
- Blocking script = script without async/defer/module attribute.
- Private network and non‑HTTPS targets are rejected.

## Roadmap
- Har-like waterfall estimates via Preload/Resource Hints
- Budgets and allowlists with pass/fail
- CSV export and copyable remediation checklist
- Duplicate library detection (same pkg across vendors)

MIT License.