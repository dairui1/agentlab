PYTHON ?= python3

.PHONY: validate test list

validate:
	PYTHONPATH=src $(PYTHON) -m agentlab validate

test:
	PYTHONPATH=src $(PYTHON) -m unittest discover -s tests

list:
	PYTHONPATH=src $(PYTHON) -m agentlab list
