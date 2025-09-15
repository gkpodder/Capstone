# Makefile for compiling .tex files

# Define the pdflatex command
PDFLATEX_CMD = pdflatex -interaction=nonstopmode

# Define the compile step for pdflatex
define COMPILE_TEX
	cd $(dir $1) && $(PDFLATEX_CMD) $(notdir $1) || { echo "Error: pdflatex failed for $1"; exit 1; }
endef

# Define the bibtex command
BIBTEX_CMD = [ -f $(basename $(notdir $1)).aux ] && bibtex $(basename $(notdir $1)) || echo "No bibtex references found" || { echo "Error: bibtex failed for $1"; exit 1; }

# Define the compile step for bibtex
define COMPILE_BIBTEX
	cd $(dir $1) && $(BIBTEX_CMD)
endef

# Default target: Compile all .tex files if no specific target is given
all: $(patsubst %.tex, %.pdf, $(wildcard **/*.tex))

# Rule for compiling .tex to .pdf
%.pdf: %.tex
	@echo "Compiling $< to $@"
	$(call COMPILE_TEX,$<)
	$(call COMPILE_BIBTEX,$<)
	$(call COMPILE_TEX,$<)
	$(call COMPILE_TEX,$<)

# Clean generated files
clean:
	find . -name "*.aux" -o -name "*.log" -o -name "*.pdf" -o -name "*.toc" -o -name "*.out" -o -name "*.bbl" -o -name "*.blg" -exec rm -f {} +

.PHONY: all clean