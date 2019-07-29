all: compile

SRC := $(wildcard *.ef)
PYC := $(SRC:.ef=.pyc)

compile: $(PYC)
clean:; -rm $(PYC)

%.pyc: %.ef; cd .. ; ./compile t/$<

