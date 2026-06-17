PYTHON ?= python3
NPM ?= npm

.PHONY: validate test list generated docs-stats site-install site-dev site-build site-preview

validate:
	PYTHONPATH=src $(PYTHON) -m agentlab validate

test:
	PYTHONPATH=src $(PYTHON) -m unittest discover -s tests

list:
	PYTHONPATH=src $(PYTHON) -m agentlab list

generated:
	$(PYTHON) scripts/build_site_index.py

docs-stats: generated
	$(PYTHON) scripts/docs_stats.py

site-install:
	cd site && $(NPM) install

site-dev:
	cd site && $(NPM) run dev

site-build:
	cd site && $(NPM) run build

site-preview:
	cd site && $(NPM) run preview
