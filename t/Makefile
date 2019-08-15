all: compile

SRC := $(wildcard *.efg)
PYC := $(SRC:.efg=.pyc)

compile: $(PYC)
clean:; -rm $(PYC)

%.pyc: %.efg; ../compile $<
