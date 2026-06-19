PYTHON ?= python3
NPM ?= npm

.PHONY: validate test list generated docs-stats sync-sources source-sync-job site-install site-dev site-build site-preview

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

sync-sources:
	$(PYTHON) scripts/sync_sources.py

source-sync-job:
	bash scripts/run_source_sync_job.sh

site-install:
	cd site && $(NPM) install

site-dev:
	cd site && $(NPM) run dev

site-build:
	cd site && $(NPM) run build

site-preview:
	cd site && $(NPM) run preview
