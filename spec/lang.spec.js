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
            ['load-name', 0],
            ['load-const', 1],
            ['call-function', 1],
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
            ['load-const', 2],
            ['return-value'],
          ],
        }));
      });
    });                         // BinOp

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
            ['load-const', 3],
            ['return-value'],
          ],
        }));
      });
    });

    describe("Attribute", () => {
      it("should parse deep attribute access correctly", () => {
        const tree0 = parse('print.__doc__');
        expect(tree0).toEqual(
          ['Module',
           ['Statement',
            ['Attribute',
             [['Load', 'print'],
              ['LoadAttr', '__doc__']]]]]);
        const tree1 = parse('print.__doc__.__str__().__str__');
        expect(tree1).toEqual(
          ['Module',
           ['Statement',
            ['Attribute',
             [['Load', 'print'],
              ['LoadAttr', '__doc__'],
              ['MethodCall', [['LoadMethod', '__str__']]],
              ['LoadAttr', '__str__']]]]]);
      });

      it("should translate deep attribute access correctly", () => {
        const tree = parse('print.__doc__.zfill');
        const [,scope] = translateScope(tree);

        expect(tree).toEqual(
          ['Module',
           ['Statement',
            ['Attribute',
             [['Load', 'print'],
              ['LoadAttr', '__doc__'],
              ['LoadAttr', 'zfill']]]]]);
        expect(scope).toEqual(
          ['Module',
           ['Statement',
            ['Attribute',
             [['Load', 'print'],
              ['LoadAttr', '__doc__'],
              ['LoadAttr', 'zfill']]]]]);
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
            constants: [1],
            name: '<lambda>',
            instructions: [
              ['load-const', 0],
              ['return-value'],
            ],
          }), '<lambda>', null],
          instructions: [
            ['load-const', 0],
            ['load-const', 1],
            ['make-function', 0],
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
            constants: [1],
            varnames: ['x', 'y', 'z'],
            instructions: [
              ['load-const', 0],
              ['return-value'],
            ],
          }), '<lambda>', null],
          instructions: [
            ['load-const', 0],
            ['load-const', 1],
            ['make-function', 0],
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
            constants: [1],
            name: 'f',
            instructions: [
              ['load-const', 0],
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
              constants: [1],
              names: ['a'],
              varnames: ['p'],
              instructions: [
                ['load-fast', 0],
                ['load-global', 0],
                ['binary-add'],
                ['load-const', 0],
                ['binary-add'],
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
            ['load-const', 3],
            ['return-value'],
          ],
        }));
      });

      it("should use store-fast for local names and arguments", () => {
        // `a' is defined and used locally only, so it should be
        // stored within the local scope array
        const tree = parse(`fn(p) { a = p+1; a }`);
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [coObj({
            name: '<lambda>',
            nlocals: 2,
            argcount: 1,
            constants: [1],
            varnames: ['p', 'a'],
            instructions: [
              ['load-fast', 0],
              ['load-const', 0],
              ['binary-add'],
              ['store-fast', 1],
              ['load-fast', 1],
              ['return-value'],
            ],
          }), '<lambda>', null ],
          names: [],
          varnames: [],
          freevars: [],
          cellvars: [],
          instructions: [
            [ 'load-const', 0 ],
            [ 'load-const', 1 ],
            [ 'make-function', 0],
            [ 'load-const', 2 ],
            [ 'return-value' ],
          ],
        }));
      });

      it("with single parameter", () => {
        const tree = parse(`
f = fn(p) {
  x = fn(y) p+y
  p = p+2        # p=3
  x(2)+p+1       # p+2+p+1
}
print(f(1))      # 9
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
                  instructions: [
                    ['load-deref', 0], // p
                    ['load-fast', 0],  // y
                    ['binary-add'],
                    ['return-value'],
                  ],
                }),
                '<lambda>',
                2,
                1,
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
            ['load-const', 1],
            ['return-value'],
          ],
        }));
      });

      it("should support let", () => {
        const tree = parse(`
f = fn() {
  let x = 1;
  foo = fn(v) { x = x + v; x };
  foo(1);
  x
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
                  instructions: [
                    ['load-deref', 0],
                    ['load-fast', 0],
                    ['binary-add' ],
                    ['store-deref', 0],
                    ['load-deref', 0],
                    ['return-value' ],
                  ],
                }),
                '<lambda>' ],
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
                ['load-deref', 0],
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
            ['pop-jump-if-false', 6],
            ['load-const', 1],
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
            ['load-const', 0],
            ['pop-jump-if-false', 8],
            ['load-const', 1],
            ['jump-forward', 2],
            ['load-const', 2],
            ['load-const', 3],
            ['return-value'],
          ],
        }));
      });
    });                         // If

    describe('While', () => {
      it("should translate basic case", () => {
        const tree = parse('while true 1');
        const code = translate(tree);

        expect(code).toEqual(coObj({
          constants: [true, 1, null],
          instructions: [
            ['setup-loop', 12],
            ['load-const', 0],
            ['pop-jump-if-false', 12],
            ['load-const', 1],
            ['jump-absolute', 0],
            ['pop-block'],
            ['load-const', 2],
            ['return-value'],
          ],
        }));
      });
    });

  });                           // Statement
});
