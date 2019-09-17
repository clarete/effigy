all: build

EMACS	?= $(shell which emacs)
TARGET	:= README.md

build: $(TARGET)
clean:; -rm $(TARGET) index.tex index.html *~
%.md: %.org; $(EMACS) $< -Q --batch --eval '(org-md-export-to-markdown)'

.PHONY:	build clean
