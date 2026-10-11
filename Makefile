# Makefile for backend/query.py (VIIRS night-lights map -> lights.html)

PYTHON   ?= python3
VENV     := .venv
VPY      := $(VENV)/bin/python
STAMP    := $(VENV)/.installed
SCRIPT   := backend/query.py
OUTPUT   := lights.html

.DEFAULT_GOAL := all

.PHONY: all run venv auth open check-env clean distclean help

all: $(OUTPUT)

$(OUTPUT): $(SCRIPT) $(STAMP)
	@$(MAKE) --no-print-directory check-env
	$(VPY) $(SCRIPT)

run: $(STAMP) check-env
	$(VPY) $(SCRIPT)

venv: $(STAMP)

$(STAMP): requirements.txt
	$(PYTHON) -m venv $(VENV)
	$(VPY) -m pip install --upgrade pip
	$(VPY) -m pip install -r requirements.txt
	touch $(STAMP)

check-env:
	@if [ ! -f .env ] && [ ! -f backend/.env ]; then \
		echo "Missing .env (project root or backend/). Create it with:"; \
		echo "  CARTO_API_KEY=your_key"; \
		echo "  GOOGLE_CLOUD_PROJECT=your_gcp_project_id"; \
		exit 1; \
	fi

auth: $(STAMP)
	$(VPY) -c "import ee; ee.Authenticate()"

open: $(OUTPUT)
	@$(VPY) -c "import webbrowser,os; webbrowser.open('file://'+os.path.abspath('$(OUTPUT)'))"

clean:
	rm -f $(OUTPUT)

distclean: clean
	rm -rf $(VENV)

help:
	@echo "make            Build $(OUTPUT)"
	@echo "make run        Re-run $(SCRIPT) unconditionally"
	@echo "make auth       Authenticate Google Earth Engine"
	@echo "make open       Build and open in browser"
	@echo "make clean      Remove $(OUTPUT)"
	@echo "make distclean  Remove $(OUTPUT) and the virtualenv"
