
# Table of Contents

1.  [Effigy](#org5d39d4c)
    1.  [How to play with it](#org621487b)
        1.  [Currently Supported Types of Values](#org992f1d0)
        2.  [Language Features](#orge5b409f)
        3.  [Very useful things missing](#org51823ef)
    2.  [Host Language](#org846b001)
    3.  [Resources](#org22ae7ca)
        1.  [On Parsing & Parsing Expression Grammars](#orgffad6e2)
        2.  [On the Python Compiler & Bytecode Format](#orgd0f4722)


<a id="org5d39d4c"></a>

# Effigy

This is an experiment on building a small language compiler on top
of a home brewed parsing expression grammar implementation.

The language implemented in this project, effigy, currently compiles
down to a subset of the Python 3.7 bytecode format. More
specifically, the Effigy compiler produces `.pyc` files.

Effigy's runtime is the Python 3.7 Virtual Machine. The difference
is just how the bytecode gets generated. Most idioms like declaring
literals, calling functions, assigning variables etc have the exact
same semantics as in regular Python code.

Effigy differs from Python on the use of functions for control flow
a little more often and the absence of classes (might be added
later).

More to come!


<a id="org621487b"></a>

## How to play with it

Effigy is currently a teeny little JavaScript program. You can
install it with `npm i efgc`.

Here's what's available and some of what's not:


<a id="org992f1d0"></a>

### Currently Supported Types of Values

-   integers
-   strings
-   lists
-   functions


<a id="orge5b409f"></a>

### Language Features

-   [X] Arithmetic Operators
-   [X] Logic Operators
-   [X] Comparison Operators
-   [-] Flow Control (if/else/while/for)
-   [-] Exceptions
-   [ ] Imports


<a id="org51823ef"></a>

### Very useful things missing

-   [ ] Slice notation
-   [ ] Variadic arguments
-   [ ] Named/Default parameters
-   [-] floating points


<a id="org846b001"></a>

## Host Language

Although the first target of the little compiler is a subset of
Python, JavaScript was chosen as the host language for a few
reasons:

1.  I didn't want to do it in Python because it'd be very tempting
    to use one of its modules for parsing, scope analysis or code
    generation. I wanted to implement all the pieces of the compiler
    to be able to reason how far I could leverage the PEG to do
    those tasks.

2.  Python and JavaScript have very similar semantics for closures
    but present slight differences in how side-effect (assignment)
    of values declared in enclosed scopes work. Java Script
    separates assignment from declaration, Python provides the
    `nonlocal` keyword.
    
    I wanted something right in the middle for Effigy: Assignment is
    coupled to declaring a variable, but provides the keyword `let`
    to mark names to be saved as closures so assignments in deeper
    scopes will know its not a new value.

3.  It doesn't really matter. The goal is to rewrite Effigy with
    Effigy.


<a id="org22ae7ca"></a>

## Resources


<a id="orgffad6e2"></a>

### On Parsing & Parsing Expression Grammars

-   [Parsing Expression Grammars: A Recognition-Based Syntactic Foundation](https://bford.info/pub/lang/peg.pdf)
-   [Parsing Expression Grammars for Structured Data](http://www.lua.inf.puc-rio.br/publications/mascarenhas11parsing.pdf)
-   [PEG-based transformer provides front-, middle and back-end stages in a simple compiler](http://www.vpri.org/pdf/tr2010003_PEG.pdf)
-   [Modular Semantic Actions](https://ohmlang.github.io/pubs/dls2016/modular-semantic-actions.pdf)


<a id="orgd0f4722"></a>

### On the Python Compiler & Bytecode Format

-   <https://devguide.python.org/compiler>
-   <https://github.com/python/cpython/tree/master/Python>
-   <https://codewords.recurse.com/issues/seven/dragon-taming-with-tailbiter-a-bytecode-compiler>

