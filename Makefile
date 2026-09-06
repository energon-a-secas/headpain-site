.DEFAULT_GOAL := help

PORT = 8846

# ── Help ──────────────────────────────────────────────────────────────────────
.PHONY: help
help:
	@echo ""
	@echo "  make serve         Start dev server → http://localhost:$(PORT)"
	@echo "  make test          Run the unit suite (no npm install needed)"
	@echo "  make test-mutants  Prove the suite catches real breakage"
	@echo "  make test-browser  Serve the in-browser integration harness"
	@echo "  make kill          Kill this project's HTTP server"
	@echo ""

# ── Dev server ────────────────────────────────────────────────────────────────
.PHONY: serve
serve:
	@echo "Serving → http://localhost:$(PORT)"
	@if [ -f ../../scripts/serve.py ]; then python3 ../../scripts/serve.py $(PORT); else python3 -m http.server $(PORT); fi

# ── Tests ─────────────────────────────────────────────────────────────────────
# Zero dependencies: Node's own runner, no npm install, no node_modules.
# --import loads the browser-global shim before any module under test evaluates.
# --disable-warning silences MODULE_TYPELESS_PACKAGE_JSON: js/ has no
# package.json on purpose (this site has no npm footprint) and the browser
# loads those files with <script type="module"> regardless.
NODE_TEST = node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./tests/shim.mjs

.PHONY: test
test:
	@$(NODE_TEST) tests/*.test.mjs

.PHONY: test-watch
test-watch:
	@$(NODE_TEST) --watch tests/*.test.mjs

# Proves the suite bites: mutates the source in known ways and fails if the
# tests stay green. A test that cannot fail is worse than no test.
.PHONY: test-mutants
test-mutants:
	@node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/mutants.mjs

# Integration checks that need a real DOM and WebGL. Serves the site and prints
# the URL; open it and read the result table.
.PHONY: test-browser
test-browser:
	@echo "Browser tests → http://localhost:$(PORT)/tests/browser.html"
	@$(MAKE) --no-print-directory serve

# ── Kill ──────────────────────────────────────────────────────────────────────
.PHONY: kill
kill:
	@lsof -ti :$(PORT) | xargs kill 2>/dev/null && echo "Stopped server on port $(PORT)" || echo "No server running on port $(PORT)"
