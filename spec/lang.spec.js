const { coObj, parse, translate, translateScope } = require('../lang');

describe("Scope", () => {
  it("should generate LOAD_GLOBAL when variable is declared in the module scope", () => {
    const tree = parse(`a = 1; f = fn(p) p+a+1; f(1)`);
    const [scope, scopeTree] = translateScope(tree);

    const subScope = {
      node: 'lambda',
      uses: ['p', 'a'],
      defs: ['p'],
      fast: ['p'],
      globals: ['a', 'f'],      // `a' was defined outside `f'.
      children: [], cell: [], free: [], deref: [], lex: [],
    };
    const topScope = {
      node: 'module',
      uses: ['f'],
      defs: ['a', 'f'],
      _g: ['a', 'f'],
      children: [subScope],
      globals: [],
      cell: [], free: [], deref: [], fast: [], lex: [],
    };
    expect(scope).toEqual([topScope, subScope]);
  });
});

describe("Translate", () => {
  describe("expression", () => {
    describe("value type", () => {

      describe("numbers", () => {
        it("should translate decimal", () => {
          const tree = parse("123");
          const code = translate(tree);

          expect(code).toEqual(coObj({
            constants: [123, null],
            instructions: [
              ['load-const', 0],
              ['pop-top'],
              ['load-const', 1],
              ['return-value'],
            ],
          }));
        });

        it("should translate hexdecimal", () => {
          const tree = parse("0x123");
          const code = translate(tree);

          expect(code).toEqual(coObj({
            constants: [291, null],
            instructions: [
              ['load-const', 0],
              ['pop-top'],
              ['load-const', 1],
              ['return-value'],
            ],
          }));
        });
      });

      describe("booleans", () => {
        it("should work with true", () => {
          const tree = parse('true');
          const code = translate(tree);
          expect(code).toEqual(coObj({
            constants: [true, null],
            instructions: [
              ['load-const', 0],
              ['pop-top'],
              ['load-const', 1],
              ['return-value'],
            ],
          }));
        });

        it("should work with false", () => {
          const tree = parse('false');
          const code = translate(tree);
          expect(code).toEqual(coObj({
            constants: [false, null],
            instructions: [
              ['load-const', 0],
              ['pop-top'],
              ['load-const', 1],
              ['return-value'],
            ],
          }));
        });
      });

      describe("strings", () => {
        it("should work with double quotes", () => {
          const tree = parse('"oi"');
          const code = translate(tree);

          expect(code).toEqual(coObj({
            constants: ['oi', null],
            instructions: [
              ['load-const', 0],
              ['pop-top'],
              ['load-const', 1],
              ['return-value'],
            ],
          }));
        });
      });

      describe("list", () => {
        it("should accept empty lists", () => {
          const tree = parse('[]');
          const code = translate(tree);

          expect(code).toEqual(coObj({
            constants: [null],
            instructions: [
              ['build-list', 0],
              ['pop-top'],
              ['load-const', 0],
              ['return-value'],
            ],
          }));
        });

        it("should accept single item lists", () => {
          const tree = parse('[1]');
          const code = translate(tree);

          expect(code).toEqual(coObj({
            constants: [1, null],
            instructions: [
              ['load-const', 0],
              ['build-list', 1],
              ['pop-top'],
              ['load-const', 1],
              ['return-value'],
            ],
          }));
        });

        it("should accept multiple item lists", () => {
          const tree = parse('[1, 2, 3, 4]');
          const code = translate(tree);

          expect(code).toEqual(coObj({
            constants: [1, 2, 3, 4, null],
            instructions: [
              ['load-const', 0],
              ['load-const', 1],
              ['load-const', 2],
              ['load-const', 3],
              ['build-list', 4],
              ['pop-top'],
              ['load-const', 4],
              ['return-value'],
            ],
          }));
        });
      });
    });                         // Values
    describe("Call", () => {
      it("with no parameters", () => {
        const tree = parse("print()");
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [null],
          names: ['print'],
          instructions: [
            ['load-name', 0],
            ['call-function', 0],
            ['pop-top'],
            ['load-const', 0],
            ['return-value'],
          ],
        }));
      });

      it("with one number parameter", () => {
        const tree = parse("print(42)");
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [42, null],
          names: ['print'],
          instructions: [
            ['load-name', 0],
            ['load-const', 0],
            ['call-function', 1],
            ['pop-top'],
            ['load-const', 1],
            ['return-value'],
          ],
        }));
      });

      it("with two number parameter", () => {
        const tree = parse("print(42, 43)");
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [42, 43, null],
          names: ['print'],
          instructions: [
            ['load-name', 0],
            ['load-const', 0],
            ['load-const', 1],
            ['call-function', 2],
            ['pop-top'],
            ['load-const', 2],
            ['return-value'],
          ],
        }));
      });

      it("with many parameter", () => {
        const tree = parse('print(42, 43, "a", foo())');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [42, 43, "a", null],
          names: ['print', 'foo'],
          instructions: [
            ['load-name', 0],
            ['load-const', 0],
            ['load-const', 1],
            ['load-const', 2],
            ['load-name', 1],
            ['call-function', 0],
            ['call-function', 4],
            ['pop-top'],
            ['load-const', 3],
            ['return-value'],
          ],
        }));
      });

      it("should execute two fun calls in a row", () => {
        const tree = parse(`print(1); print(2)`);
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [1, 2, null],
          names: ['print'],
          instructions: [
            ['load-name', 0],
            ['load-const', 0],
            ['call-function', 1],
            ['pop-top'],
            ['load-name', 0],
            ['load-const', 1],
            ['call-function', 1],
            ['pop-top'],
            ['load-const', 2],
            ['return-value'],
          ],
        }));
      });

      it("should work with expressions as params", () => {
        const tree = parse(`print(f()+4)`);
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [4, null],
          names: ['print', 'f'],
          instructions: [
            ['load-name', 0],
            ['load-name', 1],
            ['call-function', 0],
            ['load-const', 0],
            ['binary-add'],
            ['call-function', 1],
            ['pop-top'],
            ['load-const', 1],
            ['return-value'],
          ],
        }));
      });
    });                         // Call

    describe("Unary", () => {
      it("should provide negative operation", () => {
        const tree = parse('-a');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [null],
          names: ['a'],
          instructions: [
            ['load-name', 0],
            ['unary-negative'],
            ['pop-top'],
            ['load-const', 0],
            ['return-value'],
          ],
        }));
      });
    });                         // Unary

    describe('BinOp', () => {
      it("should support simple summation", () => {
        const tree = parse('2 + 3 * 4');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [2, 3, 4, null],
          instructions: [
            ['load-const', 0],
            ['load-const', 1],
            ['load-const', 2],
            ['binary-multiply'],
            ['binary-add'],
            ['pop-top'],
            ['load-const', 3],
            ['return-value'],
          ],
        }));
      });
      it("should work within function calls", () => {
        const tree = parse('print(2 + 3)');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [2, 3, null],
          names: ['print'],
          instructions: [
            ['load-name', 0],
            ['load-const', 0],
            ['load-const', 1],
            ['binary-add'],
            ['call-function', 1],
            ['pop-top'],
            ['load-const', 2],
            ['return-value'],
          ],
        }));
      });
      it("should provide bit shifting operators", () => {
        const tree = parse('2 >> 3');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [2, 3, null],
          instructions: [
            ['load-const', 0],
            ['load-const', 1],
            ['binary-rshift'],
            ['pop-top'],
            ['load-const', 2],
            ['return-value'],
          ],
        }));
      });
    });                         // BinOp

    describe("Comparison", () => {
      it("should support equality", () => {
        const tree = parse('1 == 1');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [1, null],
          instructions: [
            ['load-const', 0],
            ['load-const', 0],
            ['compare-op', 2],
            ['pop-top'],
            ['load-const', 1],
            ['return-value'],
          ],
        }));
      });
    });

    describe("BoolOp", () => {
      it("should work with two operands", () => {
        const tree = parse('true and false');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [true, false, null],
          instructions: [
            ['load-const', 0],
            ['jump-if-false-or-pop', 6],
            ['load-const', 1],
            ['pop-top'],
            ['load-const', 2],
            ['return-value'],
          ],
        }));
      });

      it("should work with many operands", () => {
        const tree = parse('true and false or 1');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [true, false, 1, null],
          instructions: [
            ['load-const', 0],
            ['jump-if-false-or-pop', 6],
            ['load-const', 1],
            ['jump-if-true-or-pop', 10],
            ['load-const', 2],
            ['pop-top'],
            ['load-const', 3],
            ['return-value'],
          ],
        }));
      });
    });

    describe("Attribute", () => {
      it("should work with function calls", () => {
        const tree = parse('a(b.c(d)).e([]).f');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [null],
          names: ['a', 'b', 'c', 'd', 'e', 'f'],
          instructions: [
            ['load-name', 0],   // a
            ['load-name', 1],   // b
            ['load-method', 2], // c
            ['load-name', 3],   // d
            ['call-method', 1],
            ['call-function', 1],
            ['load-method', 4], // e
            ['build-list', 0],
            ['call-method', 1],
            ['load-attr', 5],   // f
            ['pop-top'],
            ['load-const', 0],
            ['return-value'],
          ],
        }));
      });

      it("should provide attribute access", () => {
        const tree = parse('print.__doc__');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [null],
          names: ['print', '__doc__'],
          instructions: [
            ['load-name', 0],
            ['load-attr', 1],
            ['pop-top'],
            ['load-const', 0],
            ['return-value'],
          ],
        }));
      });

      it("should provide method calling", () => {
        const tree = parse('print.__doc__.__str__()');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [null],
          names: ['print', '__doc__', '__str__'],
          instructions: [
            ['load-name', 0],
            ['load-attr', 1],
            ['load-method', 2],
            ['call-method', 0],
            ['pop-top'],
            ['load-const', 0],
            ['return-value'],
          ],
        }));
      });

      it("should provide method calling with parameters", () => {
        const tree = parse('object.__doc__.zfill(20)');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [20, null],
          names: ['object', '__doc__', 'zfill'],
          instructions: [
            ['load-name', 0],
            ['load-attr', 1],
            ['load-method', 2],
            ['load-const', 0],
            ['call-method', 1],
            ['pop-top'],
            ['load-const', 1],
            ['return-value'],
          ],
        }));
      });
    });

    describe("Callables", () => {
      it("lambda with single expression on the body", () => {
        const tree = parse('fn() 1');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [coObj({
            constants: [1, null],
            name: '<lambda>',
            instructions: [
              ['load-const', 0],
              ['return-value'],
              ['load-const', 1],
              ['return-value'],
            ],
          }), '<lambda>', null],
          instructions: [
            ['load-const', 0],
            ['load-const', 1],
            ['make-function', 0],
            ['pop-top'],
            ['load-const', 2],
            ['return-value'],
          ],
        }));
      });

      it("should support lambdas with multiple parameters in fn definition", () => {
        const tree = parse('fn(x, y, z) 1');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [coObj({
            name: '<lambda>',
            nlocals: 3,
            argcount: 3,
            constants: [1, null],
            varnames: ['x', 'y', 'z'],
            instructions: [
              ['load-const', 0],
              ['return-value'],
              ['load-const', 1],
              ['return-value'],
            ],
          }), '<lambda>', null],
          instructions: [
            ['load-const', 0],
            ['load-const', 1],
            ['make-function', 0],
            ['pop-top'],
            ['load-const', 2],
            ['return-value'],
          ],
        }));
      });

      it("should support function with single expression on the body", () => {
        const tree = parse('fn f() 1');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [coObj({
            constants: [1, null],
            name: 'f',
            instructions: [
              ['load-const', 0],
              ['return-value'],
              ['load-const', 1],
              ['return-value'],
            ],
          }), 'f', null],
          names: ['f'],
          instructions: [
            ['load-const', 0],
            ['load-const', 1],
            ['make-function', 0],
            ['store-name', 0],
            ['load-const', 2],
            ['return-value'],
          ],
        }));
      });
    });                         // Lambda

    describe('Nested Scopes', () => {
      it("should use global if no enclosing scope redefines name", () => {
        // `a' is defined in the module scope and used in the function
        // scope, so when it's used within a nested scope, it's
        // accessed via `load-global' which takes an index within the
        // `names' tuple.
        const tree = parse(`a = 1; f = fn(p) p+a+1; f(1) # 2\n`);
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [
            1,
            coObj({
              name: '<lambda>',
              nlocals: 1,
              argcount: 1,
              constants: [1, null],
              names: ['a'],
              varnames: ['p'],
              instructions: [
                ['load-fast', 0],
                ['load-global', 0],
                ['binary-add'],
                ['load-const', 0],
                ['binary-add'],
                ['return-value'],
                ['load-const', 1],
                ['return-value'],
              ],
            }),
            '<lambda>',
            null,
          ],
          names: ['a', 'f'],
          instructions: [
            ['load-const', 0],  // 1
            ['store-name', 0],  // a
            ['load-const', 1],  // <lambda>
            ['load-const', 2],  // 'lambda'
            ['make-function', 0],
            ['store-name', 1],  // f

            // statement 3
            ['load-name', 1],   // f
            ['load-const', 0],  // 0
            ['call-function', 1],
            ['pop-top'],

            ['load-const', 3],
            ['return-value'],
          ],
        }));
      });

      it("should use store-fast for local names and arguments", () => {
        // `a' is defined and used locally only, so it should be
        // stored within the local scope array
        const tree = parse(`fn(p) { a = p+1; return a }`);
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [coObj({
            name: '<lambda>',
            nlocals: 2,
            argcount: 1,
            constants: [1, null],
            varnames: ['p', 'a'],
            instructions: [
              ['load-fast', 0],
              ['load-const', 0],
              ['binary-add'],
              ['store-fast', 1],
              ['load-fast', 1],
              ['return-value'],
              ['load-const', 1],
              ['return-value'],
            ],
          }), '<lambda>', null ],
          names: [],
          varnames: [],
          freevars: [],
          cellvars: [],
          instructions: [
            ['load-const', 0],
            ['load-const', 1],
            ['make-function', 0],
            ['pop-top'],
            ['load-const', 2],
            ['return-value'],
          ],
        }));
      });

      it("with single parameter", () => {
        const tree = parse(`
f = fn(p) {
  x = fn(y) p+y
  p = p+2         # p=3
  return x(2)+p+1 # p+2+p+1
}
print(f(1))       # 9
`);
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [
            coObj({
              name: '<lambda>',
              nlocals: 2,
              argcount: 1,
              constants: [
                coObj({
                  name: '<lambda>',
                  nlocals: 1,
                  argcount: 1,
                  varnames: ['y'],
                  freevars: ['p'],
                  constants: [null],
                  instructions: [
                    ['load-deref', 0], // p
                    ['load-fast', 0],  // y
                    ['binary-add'],
                    ['return-value'],
                    ['load-const', 0],
                    ['return-value'],
                  ],
                }),
                '<lambda>',
                2,
                1,
                null,
              ],
              varnames: ['p', 'x'],
              cellvars: ['p'],
              instructions: [
                ['load-closure', 0],
                ['build-tuple', 1],
                ['load-const', 0],  // code for lambda stored in x
                ['load-const', 1],  // 'lambda'
                ['make-function', 8],
                ['store-fast', 1],  // save above lambda into local `x'

                ['load-deref', 0],  // `p' from above scope
                ['load-const', 2],  // 2
                ['binary-add'],
                ['store-deref', 0], // `p'

                ['load-fast', 1],   // `x'
                ['load-const', 2],  // 2
                ['call-function', 1],
                ['load-deref', 0],  // `p'
                ['binary-add'],
                ['load-const', 3],  // 1
                ['binary-add'],
                ['return-value'],

                ['load-const', 4],
                ['return-value'],
              ],
            }),
            '<lambda>',
            1,
            null,
          ],
          names: ['f', 'print'],
          instructions: [
            ['load-const', 0],    // Code object to be stored in 'f'
            ['load-const', 1],    // 'lambda'
            ['make-function', 0],
            ['store-name', 0],    // 'f'

            ['load-name', 1],     // 'print'
            ['load-name', 0],     // 'f'
            ['load-const', 2],    // 1
            ['call-function', 1], // 'f'
            ['call-function', 1], // 'print'
            ['pop-top'],

            ['load-const', 3],
            ['return-value'],
          ],
        }));
      });
    });                         // Scopes
  });                           // Expression

  describe('Statement', () => {
    describe('Assignment', () => {
      it("should work with one variable", () => {
        const tree = parse(`a = 51; print(a)`);
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [51, null],
          names: ['a', 'print'],
          instructions: [
            ['load-const', 0],
            ['store-name', 0],
            ['load-name', 1],
            ['load-name', 0],
            ['call-function', 1],
            ['pop-top'],
            ['load-const', 1],
            ['return-value'],
          ],
        }));
      });

      it("should support let", () => {
        const tree = parse(`
f = fn() {
  let x = 1
  foo = fn(v) x = x + v
  foo(1)
  return x
}
print(f()) # 2
      `);
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [
            coObj({
              constants: [
                1,
                coObj({
                  name: '<lambda>',
                  varnames: ['v'],
                  freevars: ['x'],
                  nlocals: 1,
                  argcount: 1,
                  constants: [null],
                  instructions: [
                    ['load-deref', 0],
                    ['load-fast', 0],
                    ['binary-add'],
                    ['store-deref', 0],
                    ['load-const', 0],
                    ['return-value'],
                  ],
                }),
                '<lambda>',
                null,
              ],
              name: '<lambda>',
              nlocals: 1,
              varnames: ['foo'],
              cellvars: ['x'],
              instructions: [
                ['load-const', 0],
                ['store-deref', 0],
                ['load-closure', 0],
                ['build-tuple', 1],
                ['load-const', 1 ],
                ['load-const', 2 ],
                ['make-function', 8 ],
                ['store-fast', 0],
                ['load-fast', 0],
                ['load-const', 0],
                ['call-function', 1],
                ['pop-top'],
                ['load-deref', 0],
                ['return-value'],
                ['load-const', 3],
                ['return-value'],
              ],
            }),
            '<lambda>',
            null,
          ],
          names: ['f', 'print'],
          instructions: [
            ['load-const', 0],
            ['load-const', 1],
            ['make-function', 0],
            ['store-name', 0],

            ['load-name', 1],
            ['load-name', 0],
            ['call-function', 0],
            ['call-function', 1],
            ['pop-top'],

            ['load-const', 2],
            ['return-value'],
          ],
        }));
      });
    });                         // Assignment

    describe('If', () => {
      it("should provide if statement", () => {
        const tree = parse('if true 1');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [true, 1, null],
          names: [],
          instructions: [
            ['load-const', 0],
            ['pop-jump-if-false', 8],
            ['load-const', 1],
            ['pop-top'],
            ['load-const', 2],
            ['return-value'],
          ],
        }));
      });

      it("should provide else statement", () => {
        const tree = parse('if true 1 else 2');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [true, 1, 2, null],
          instructions: [
            /* 02 */ ['load-const', 0],
            /* 04 */ ['pop-jump-if-false', 10],
            /* 06 */ ['load-const', 1],
            /* 08 */ ['pop-top'],
            /* 10 */ ['jump-forward', 4],
            /* 12 */ ['load-const', 2],
            /* 14 */ ['pop-top'],
            /* 16 */ ['load-const', 3],
            /* 18 */ ['return-value'],
          ],
        }));
      });
    });                         // If

    describe('For', () => {
      it("should translate basic loop code", () => {
        const tree = parse('for i in a print(i)');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          names: ['a', 'i', 'print'],
          constants: [null],
          instructions: [
            /* 02 */ ['setup-loop', 20],
            /* 04 */ ['load-name', 0],
            /* 06 */ ['get-iter'],
            /* 08 */ ['for-iter', 12],
            /* 10 */ ['store-name', 1],
            /* 12 */ ['load-name', 2],
            /* 14 */ ['load-name', 1],
            /* 16 */ ['call-function', 1],
            /* 18 */ ['pop-top'],
            /* 20 */ ['jump-absolute', 6],
            /* 22 */ ['pop-block'],
            /* 24 */ ['load-const', 0],
            /* 26 */ ['return-value'],
          ],
        }));
      });
    });

    describe('While', () => {
      it("should translate basic case", () => {
        const tree = parse('while true 1');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [true, 1, null],
          instructions: [
            /* 02 */ ['setup-loop', 12],
            /* 04 */ ['load-const', 0],
            /* 06 */ ['pop-jump-if-false', 14],
            /* 08 */ ['load-const', 1],
            /* 10 */ ['pop-top'],
            /* 12 */ ['jump-absolute', 2],
            /* 14 */ ['pop-block'],
            /* 16 */ ['load-const', 2],
            /* 18 */ ['return-value'],
          ],
        }));
      });

      it("should translate break statements", () => {
        const tree = parse('while true break');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [true, null],
          instructions: [
            ['setup-loop', 10],
            ['load-const', 0],
            ['pop-jump-if-false', 12],
            ['break-loop'],
            ['jump-absolute', 2],
            ['pop-block'],
            ['load-const', 1],
            ['return-value'],
          ],
        }));
      });

    });                         // While

    describe('Try/Catch', () => {
      it("should translate basic case", () => {
        const tree = parse('try a catch Err as err b');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [null],
          names: ['a', 'Err', 'err', 'b'],
          instructions: [
            /* 00 */ ['setup-except', 8],
            /* 02 */ ['load-name', 0],   // a
            /* 04 */ ['pop-top'],
            /* 06 */ ['pop-block'],
            /* 08 */ ['jump-forward', 38],

            /* 10 */ ['dup-top'],
            /* 12 */ ['load-name', 1],   // Err
            /* 14 */ ['compare-op', 10],
            /* 16 */ ['pop-jump-if-false', 46],
            /* 18 */ ['pop-top'],
            /* 20 */ ['store-name', 2],
            /* 22 */ ['pop-top'],
            /* 24 */ ['setup-finally', 8],

            /* 26 */ ['load-name', 3],   // b
            /* 28 */ ['pop-top'],
            /* 30 */ ['pop-block'],
            /* 32 */ ['load-const', 0],
            /* 34 */ ['load-const', 0],

            /* 36 */ ['store-name', 2],  // err
            /* 38 */ ['delete-name', 2], // err
            /* 40 */ ['end-finally'],
            /* 42 */ ['pop-except'],
            /* 44 */ ['jump-forward', 2],
            /* 46 */ ['end-finally'],

            /* 46 */ ['load-const', 0],
            /* 48 */ ['return-value'],
          ],
        }));
      });
    });                         // Try/Catch

  });                           // Statement
});
