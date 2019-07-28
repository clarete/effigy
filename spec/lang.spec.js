const { parse, translate, translateScope } = require('../lang');

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
      nparams: 1,
    };
    const topScope = {
      node: 'module',
      uses: ['f'],
      defs: ['a', 'f'],
      _g: ['a', 'f'],
      children: [subScope],
      globals: [],
      cell: [], free: [], deref: [], fast: [], lex: [],
      nparams: 0,
    };
    expect(scope).toEqual([topScope, subScope]);
  });
});

describe("Translate", () => {
  describe("Expression", () => {
    describe("Call", () => {
      it("with no parameters", () => {
        const tree = parse("print()");
        const code = translate(tree);

        expect(code).toEqual({
          nlocals: 0,
          argcount: 0,
          constants: [null],
          names: ['print'],
          varnames: [],
          freevars: [],
          cellvars: [],
          instructions: [
            ['load-name', 0],
            ['call-function', 0],
            ['load-const', 0],
            ['return-value'],
          ],
        });
      });

      it("with one number parameter", () => {
        const tree = parse("print(42)");
        const code = translate(tree);

        expect(code).toEqual({
          nlocals: 0,
          argcount: 0,
          constants: [42, null],
          names: ['print'],
          varnames: [],
          freevars: [],
          cellvars: [],
          instructions: [
            ['load-name', 0],
            ['load-const', 0],
            ['call-function', 1],
            ['load-const', 1],
            ['return-value'],
          ],
        });
      });

      it("with two number parameter", () => {
        const tree = parse("print(42, 43)");
        const code = translate(tree);

        expect(code).toEqual({
          nlocals: 0,
          argcount: 0,
          constants: [42, 43, null],
          names: ['print'],
          varnames: [],
          freevars: [],
          cellvars: [],
          instructions: [
            ['load-name', 0],
            ['load-const', 0],
            ['load-const', 1],
            ['call-function', 2],
            ['load-const', 2],
            ['return-value'],
          ],
        });
      });

      it("should execute two fun calls in a row", () => {
        const tree = parse(`print(1); print(2)`);
        const code = translate(tree);

        expect(code).toEqual({
          nlocals: 0,
          argcount: 0,
          constants: [1, 2, null],
          names: ['print'],
          varnames: [],
          freevars: [],
          cellvars: [],
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
        });
      });
    });                         // Call

    describe("Unary", () => {
      it("should provide negative operation", () => {
        const tree = parse('-a');
        const code = translate(tree);

        expect(code).toEqual({
          nlocals: 0,
          argcount: 0,
          constants: [ null ],
          names: ['a'],
          varnames: [],
          freevars: [],
          cellvars: [],
          instructions: [
            ['load-name', 0],
            ['unary-negative'],
            ['load-const', 0],
            ['return-value'],
          ],
        });
      });
    });                         // Unary

    describe('BinOp', () => {
      it("should support simple summation", () => {
        const tree = parse('2 + 3 * 4');
        const code = translate(tree);

        expect(code).toEqual({
          nlocals: 0,
          argcount: 0,
          constants: [2, 3, 4, null],
          names: [],
          varnames: [],
          freevars: [],
          cellvars: [],
          instructions: [
            ['load-const', 0],
            ['load-const', 1],
            ['load-const', 2],
            ['binary-multiply'],
            ['binary-add'],
            ['load-const', 3],
            ['return-value'],
          ],
        });
      });
      it("should work within function calls", () => {
        const tree = parse('print(2 + 3)');
        const code = translate(tree);

        expect(code).toEqual({
          nlocals: 0,
          argcount: 0,
          constants: [2, 3, null],
          names: ['print'],
          varnames: [],
          freevars: [],
          cellvars: [],
          instructions: [
            ['load-name', 0],
            ['load-const', 0],
            ['load-const', 1],
            ['binary-add'],
            ['call-function', 1],
            ['load-const', 2],
            ['return-value'],
          ],
        });
      });
      it("should provide bit shifting operators", () => {
        const tree = parse('2 >> 3');
        const code = translate(tree);

        expect(code).toEqual({
          nlocals: 0,
          argcount: 0,
          constants: [2, 3, null],
          names: [],
          varnames: [],
          freevars: [],
          cellvars: [],
          instructions: [
            ['load-const', 0],
            ['load-const', 1],
            ['binary-rshift'],
            ['load-const', 2],
            ['return-value'],
          ],
        });
      });
    });                         // BinOp

    describe("Attribute", () => {
      it("should parse deep attribute access correctly", () => {
        const tree0 = parse('print.__doc__');
        expect(tree0).toEqual(
          ['Module',
            ['Attribute',
             [['Load', 'print'],
              ['LoadAttr', '__doc__']]]]);
        const tree1 = parse('print.__doc__.__str__().__str__');
        expect(tree1).toEqual(
          ['Module',
           ['Attribute',
            [['Load', 'print'],
             ['LoadAttr', '__doc__'],
             ['MethodCall', [['LoadMethod', '__str__'], ['CallParams', null]]],
             ['LoadAttr', '__str__']]]]);
      });

      it("should translate deep attribute access correctly", () => {
        const tree = parse('print.__doc__.zfill');
        const [,scope] = translateScope(tree);
        expect(tree).toEqual(
          ['Module',
            ['Attribute',
             [['Load', 'print'],
              ['LoadAttr', '__doc__'],
              ['LoadAttr', 'zfill']]]]);
        expect(scope).toEqual(
          ['Module',
           ['Attribute',
            [['Load', 'print'],
             ['LoadAttr', '__doc__'],
             ['LoadAttr', 'zfill']]]]);
      });

      it("should provide attribute access", () => {
        const tree = parse('print.__doc__');
        const code = translate(tree);

        expect(code).toEqual({
          nlocals: 0,
          argcount: 0,
          constants: [null],
          names: ['print', '__doc__'],
          varnames: [],
          freevars: [],
          cellvars: [],
          instructions: [
            ['load-name', 0],
            ['load-attr', 1],
            ['load-const', 0],
            ['return-value'],
          ],
        });
      });

      it("should provide method calling", () => {
        const tree = parse('print.__doc__.__str__()');
        const code = translate(tree);

        expect(code).toEqual({
          nlocals: 0,
          argcount: 0,
          constants: [null],
          names: ['print', '__doc__', '__str__'],
          varnames: [],
          freevars: [],
          cellvars: [],
          instructions: [
            ['load-name', 0],
            ['load-attr', 1],
            ['load-method', 2],
            ['call-method', 0],
            ['load-const', 0],
            ['return-value'],
          ],
        });
      });

      it("should provide method calling with parameters", () => {
        const tree = parse('object.__doc__.zfill(20)');
        const code = translate(tree);

        expect(code).toEqual({
          nlocals: 0,
          argcount: 0,
          constants: [20, null],
          names: ['object', '__doc__', 'zfill'],
          varnames: [],
          freevars: [],
          cellvars: [],
          instructions: [
            ['load-name', 0],
            ['load-attr', 1],
            ['load-method', 2],
            ['load-const', 0],
            ['call-method', 1],
            ['load-const', 1],
            ['return-value'],
          ],
        });
      });
    });

    describe("Lambda", () => {
      it("with single expression on the body", () => {
        const tree = parse('fn() 1');
        const code = translate(tree);
        expect(code).toEqual({
          nlocals: 0,
          argcount: 0,
          constants: [{
            nlocals: 0,
            argcount: 0,
            constants: [1],
            names: [],
            varnames: [],
            freevars: [],
            cellvars: [],
            instructions: [
              ['load-const', 0],
              ['return-value'],
            ],
          }, '<lambda>', null],
          names: [],
          varnames: [],
          freevars: [],
          cellvars: [],
          instructions: [
            ['load-const', 0],
            ['load-const', 1],
            ['make-function', 0],
            ['load-const', 2],
            ['return-value'],
          ],
        });
      });

      it("should be callable", () => {
        const tree = parse(`print((fn() 3)())`);
        console.log(tree);
        const code = translate(tree);
        console.log(code);
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

        expect(code).toEqual({
          nlocals: 0,
          argcount: 0,
          constants: [
            1,
            {
              nlocals: 1,
              argcount: 1,
              constants: [1],
              names: ['a'],
              varnames: ['p'],
              freevars: [],
              cellvars: [],
              instructions: [
                ['load-fast', 0],
                ['load-global', 0],
                ['binary-add'],
                ['load-const', 0],
                ['binary-add'],
                ['return-value'],
              ],
            },
            '<lambda>',
            null,
          ],
          names: ['a', 'f'],
          varnames: [],
          freevars: [],
          cellvars: [],
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
        });
      });

      it("should use store-fast for local names and arguments", () => {
        // `a' is defined and used locally only, so it should be
        // stored within the local scope array
        const tree = parse(`fn(p) { a = p+1; a }`);
        const code = translate(tree);

        expect(code).toEqual({
          nlocals: 0,
          argcount: 0,
          constants: [{
            nlocals: 2,
            argcount: 1,
            constants: [1],
            names: [],
            varnames: ['p', 'a'],
            freevars: [],
            cellvars: [],
            instructions: [
              [ 'load-fast', 0 ],
              [ 'load-const', 0 ],
              [ 'binary-add' ],
              [ 'store-fast', 1 ],
              [ 'load-fast', 1 ],
              [ 'return-value' ],
            ],
          }, '<lambda>', null ],
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
        });
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

        expect(code).toEqual({
          nlocals: 0,
          argcount: 0,
          constants: [
            {
              nlocals: 2,
              argcount: 1,
              constants: [
                {
                  nlocals: 1,
                  argcount: 1,
                  constants: [],
                  names: [],
                  varnames: ['y'],
                  freevars: ['p'],
                  cellvars: [],
                  instructions: [
                    ['load-deref', 0], // p
                    ['load-fast', 0],  // y
                    ['binary-add'],
                    ['return-value'],
                  ],
                },
                '<lambda>',
                2,
                1,
              ],
              names: [],
              varnames: ['p', 'x'],
              freevars: [],
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
            },
            '<lambda>',
            1,
            null,
          ],
          names: ['f', 'print'],
          varnames: [],
          freevars: [],
          cellvars: [],
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
        });
      });
    });                         // Scopes

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

      expect(code).toEqual({
        constants: [
          {
            constants: [
              1,
              {
                constants: [],
                names: [],
                varnames: ['v'],
                freevars: ['x'],
                cellvars: [],
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
              },
              '<lambda>' ],
            nlocals: 1,
            argcount: 0,
            names: [],
            varnames: ['foo'],
            freevars: [],
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
          },
          '<lambda>',
          null ],
        names: ['f', 'print'],
        varnames: [],
        freevars: [],
        cellvars: [],
        nlocals: 0,
        argcount: 0,
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
      });
    });

    describe('Value', () => {
      it("should support lists", () => {
        // const tree = parse(`a = [1, 2, (fn() 3)()]`);
        // console.log(tree);
        // const code = translate(tree);
      });
    });                         // Value
  });                           // Expression

  describe('Statement', () => {
    describe('Assignment', () => {
      it("should work with one variable", () => {
        const tree = parse(`a = 51; print(a)`);
        const code = translate(tree);

        expect(code).toEqual({
          nlocals: 0,
          argcount: 0,
          constants: [51, null],
          names: ['a', 'print'],
          varnames: [],
          freevars: [],
          cellvars: [],
          instructions: [
            ['load-const', 0],
            ['store-name', 0],
            ['load-name', 1],
            ['load-name', 0],
            ['call-function', 1],
            ['load-const', 1],
            ['return-value'],
          ],
        });
      });
    });
  });
});
