TECTONIC ?= tectonic
ENGINE ?= tectonic
XELATEX ?= xelatex
PYTHON ?= python
PDFTOPPM ?= pdftoppm
PDFTOCAIRO ?= pdftocairo
GS ?= gs

POSTERS := $(sort $(patsubst %.tex,%,$(wildcard p[0-9][0-9]-*.tex)))
PDFS := $(POSTERS:%=rendered/%.pdf)
LETTER_PDFS := $(POSTERS:%=rendered/%-letter.pdf)
PREVIEWS := $(POSTERS:%=rendered/%.png)

.PHONY: all pdfs letter-pdfs previews clean
.DELETE_ON_ERROR:

all: pdfs letter-pdfs previews \
	rendered/apstats-concept-poster-mockups.pdf \
	rendered/apstats-concept-poster-mockups-letter.pdf

pdfs: $(PDFS)

letter-pdfs: $(LETTER_PDFS) rendered/apstats-concept-poster-mockups-letter.pdf

previews: $(PREVIEWS)

rendered/%.pdf: %.tex apstats-poster.sty | rendered
ifeq ($(ENGINE),xelatex)
	$(XELATEX) -interaction=nonstopmode -halt-on-error -output-directory=rendered $<
	$(XELATEX) -interaction=nonstopmode -halt-on-error -output-directory=rendered $<
else
	$(TECTONIC) --outdir rendered $<
endif

rendered/%-letter.pdf: rendered/%.pdf make_letter.py | rendered
	$(PYTHON) make_letter.py "$<" "$@" --pdftocairo "$(PDFTOCAIRO)"

rendered/%.png: rendered/%.pdf
	$(PDFTOPPM) -png -r 55 -singlefile $< rendered/$*

rendered/apstats-concept-poster-mockups.pdf: $(PDFS)
	$(GS) -q -dNOPAUSE -dBATCH -dPDFSTOPONERROR -sDEVICE=pdfwrite -sOutputFile=$@ $(PDFS)

rendered/apstats-concept-poster-mockups-letter.pdf: $(LETTER_PDFS)
	$(GS) -q -dNOPAUSE -dBATCH -dPDFSTOPONERROR -sDEVICE=pdfwrite -sOutputFile=$@ $(LETTER_PDFS)

rendered:
	$(PYTHON) -c "from pathlib import Path; Path('rendered').mkdir(exist_ok=True)"

clean:
	$(PYTHON) clean_rendered.py
