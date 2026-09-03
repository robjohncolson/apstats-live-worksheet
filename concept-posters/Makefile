TECTONIC ?= tectonic
PDFTOPPM ?= pdftoppm
PDFTOCAIRO ?= pdftocairo
GS ?= gs

POSTERS := p02-summary-statistics p09-confidence-intervals p15-residuals-model-fit
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
	$(TECTONIC) --outdir rendered $<

rendered/%-letter.pdf: rendered/%.pdf | rendered
	@safe_area_pdf="$@.safe-area.tmp.pdf"; \
	trap 'rm -f "$$safe_area_pdf"' EXIT; \
	$(PDFTOCAIRO) -pdf -paperw 576 -paperh 756 "$<" "$$safe_area_pdf"; \
	$(PDFTOCAIRO) -pdf -paper letter -noshrink "$$safe_area_pdf" "$@"

rendered/%.png: rendered/%.pdf
	$(PDFTOPPM) -png -r 55 -singlefile $< rendered/$*

rendered/apstats-concept-poster-mockups.pdf: $(PDFS)
	$(GS) -q -dNOPAUSE -dBATCH -dPDFSTOPONERROR -sDEVICE=pdfwrite \
		-sOutputFile=$@ $(PDFS)

rendered/apstats-concept-poster-mockups-letter.pdf: $(LETTER_PDFS)
	$(GS) -q -dNOPAUSE -dBATCH -dPDFSTOPONERROR -sDEVICE=pdfwrite \
		-sOutputFile=$@ $(LETTER_PDFS)

rendered:
	mkdir -p rendered

clean:
	rm -f rendered/*.aux rendered/*.log rendered/*.out rendered/*.pdf rendered/*.png
