
# Table of Contents

1.  [Effigy](#org298377f)
    1.  [How to play with it](#org961e90d)
        1.  [Currently Supported Types of Values](#org8daedde)
        2.  [Language Features](#org9d8f1ee)
        3.  [Very useful things missing](#org1f0a087)
    2.  [How does it work](#org7809076)
        1.  [Parser Generator for Parsing Expression Grammars (PEG)](#orgdf15c10)
    3.  [Host Language](#orgfa2955a)
    4.  [Resources](#org8a9d27f)
        1.  [On Parsing & Parsing Expression Grammars](#org1a05dfe)
        2.  [On the Python Compiler & Bytecode Format](#org7331218)


<a id="org298377f"></a>

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


<a id="org961e90d"></a>

## How to play with it

Effigy is currently a teeny little JavaScript program. You can
install it with `npm i efgc`. After that, you can type your effigy
programs in a file and then run `efgc yourfile.efg`. That will
generate a `.pyc` file in the same directory as the source file
that can be ran with Python (currently only 3.7).

Here's what's available and some of what's not:


<a id="org8daedde"></a>

### Currently Supported Types of Values

-   integers
-   strings (double quotes only. Single quotes currently yield
    syntax error)
-   lists
-   functions (named and anonymous)


<a id="org9d8f1ee"></a>

### Language Features

-   [X] Arithmetic Operators
-   [X] Logic Operators
-   [X] Comparison Operators
-   [X] Flow Control (if/else/while/for &#x2013; for loops didn't land
    yet)
-   [X] Exceptions (single catch block for now)
-   [ ] Imports


<a id="org1f0a087"></a>

### Very useful things missing

-   Slice notation
-   Variadic arguments
-   Named/Default parameters
-   Floating points


<a id="org7809076"></a>

## How does it work

As mentioned in the introduction, Effigy is an experiment. So it
probably won't be a good example of how to write the next industry
standard compiler, but it should give insights about what compilers
do and at least one way of doing it.

The current version of the `efgc` compiler is broken down into
three main pieces: 1) PEG parser-generator, 2) bytecode
translator, 3) assembler. Let's look at them separately.


<a id="orgdf15c10"></a>

### Parser Generator for Parsing Expression Grammars (PEG)

The PEG is the most basic component of this compiler. It's what
the compiler uses to 1) Parse the program text into a parse tree
and 2) to transform the parse tree into `bytecode`.

PEGs provide very similar functionality compared to Context Free
Grammars. The most relevant difference is 1. being
deterministic 2. allowing infinite lookahead via predicates. This
allows PEGs to provide functionality for both syntactical and
semantic matching. To read beyond this vague definition, I suggest
reading the [article](https://bford.info/pub/lang/peg.pdf) that introduced the concept.

The API for parsing text currently looks like this:

    > const g = peg.pegc('Digit <- [0-9]+');  // Compile Grammar
    > g.match('123')                          // Match some input
    ['Digit', ['1', '2', '3']]

There's also an API for matching data structures (lists):

    > peg.pegc('List <- { "a" { "b" } }').matchl(["a", ["b"]])
    ['L', ['a', ['b']]]

In very practical terms, this home grown PEG implementation is
being used in the [parser](./lang.peg) and the [translator](./lang.tr) pieces. And besides
the grammar language, this PEG also provides semantic actions
exposed via the JavaScript API (not in the grammar
language). Allowing the user to declare traversals for the output
trees captured from successful matching. E.g.:

    > const join = x => Array.isArray(x) ? x.join('') : x; // Helper for joining lists of strings together
    > const g = peg.pegc('Digit <- [0-9]+') // Compile Grammar
    > const r = g.bind({ Digit: ({ visit }) => parseInt(join(visit()), 10) }); // Bind semantic actions
    > r('123')
    123

It is worth mentioning that `bindl()` is also available for
binding semantic actions to a generator that will process data
structures (lists) instead of text.

The semantic actions [are modular](https://ohmlang.github.io/pubs/dls2016/modular-semantic-actions.pdf). They're not executed until the
whole match is finished successfully. That way, the user of the
PEG engine doesn't ever have to think about the backtracking that
happens behind the scenes.

This PEG implementation has no dependencies besides the host
language used to write the file `peg.js`.

Sadly there are a few valuable things that I didn't get to
implement yet that would considerably increase the quality of the
PEG implementation:

-   Error Reporting. Although parser generators sometimes get bad
    fame for their error reporting, there is some modern literature
    on how to allow pretty good error reporting. The best this PEG
    does is to report accurately the farther failure position
    heuristics that tell how far on the input the current grammar
    was able to match before the error happened. [Link for the
    aforementioned modern literature](https://arxiv.org/pdf/1405.6646.pdf). Current error reporting on
    list matching is awful to say the least. It literally only tells
    you that it didn't match a list.

-   Arity of PEG operators. The operator `OneOrMore (+)` returns an
    item if it matches one and a list if it matches many. And the
    list is flattened. The `ZeroOrMore (*)` operator behaves
    similarly to `(+)` but can also return nothing. Which is
    represented with `null`. These are a bit confusing but I'm not
    really sure if I found all the answers to design something
    better yet.

-   Left recursion. There's a branch for supporting that. It
    currently misses mutual left recursion support so it's not
    merged yet. The [implementation leverages bounded left recursion](https://arxiv.org/pdf/1207.0443).


<a id="orgfa2955a"></a>

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


<a id="org8a9d27f"></a>

## Resources


<a id="org1a05dfe"></a>

### On Parsing & Parsing Expression Grammars

-   [Parsing Expression Grammars: A Recognition-Based Syntactic Foundation](https://bford.info/pub/lang/peg.pdf)
-   [Parsing Expression Grammars for Structured Data](http://www.lua.inf.puc-rio.br/publications/mascarenhas11parsing.pdf)
-   [PEG-based transformer provides front-, middle and back-end stages in a simple compiler](http://www.vpri.org/pdf/tr2010003_PEG.pdf)
-   [Modular Semantic Actions](https://ohmlang.github.io/pubs/dls2016/modular-semantic-actions.pdf)


<a id="org7331218"></a>

### On the Python Compiler & Bytecode Format

-   <https://devguide.python.org/compiler>
-   <https://github.com/python/cpython/tree/master/Python>
-   <https://codewords.recurse.com/issues/seven/dragon-taming-with-tailbiter-a-bytecode-compiler>

