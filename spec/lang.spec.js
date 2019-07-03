const { parse, translate, translateScope } = require('../lang');

describe("Scope", () => {
  it("should generate LOAD_GLOBAL when variable is declared in the module scope", () => {
    const tree = parse(`a = 1; f = fn(p) p+a+1; f(1)`);
    const [scope, scopeTree] = translateScope(tree);

    const subScope = {
      node: 'lambda',
      uses: ['a', 'p'],
      defs: ['p'],
      fast: ['p'],
      globals: ['a', 'f'],      // `a' was defined outside `f'.
      children: [], cell: [], free: [], deref: [],
    };
    const topScope = {
      node: 'module',
      uses: ['f'],
      defs: ['a', 'f'],
      children: [subScope],
      globals: [],
      cell: [], free: [], deref: [], fast: [],
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
          constants: [null],
          names: ['print'],
          varnames: [],
          freevars: [],
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
          constants: [42, null],
          names: ['print'],
          varnames: [],
          freevars: [],
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
          constants: [42, 43, null],
          names: ['print'],
          varnames: [],
          freevars: [],
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
          constants: [1, 2, null],
          names: ['print'],
          varnames: [],
          freevars: [],
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
    });                         // FunCall

    describe("Unary", () => {
      it("should provide negative operation", () => {
        const tree = parse('-a');
        const code = translate(tree);

        expect(code).toEqual({
          constants: [ null ],
          names: ['a'],
          varnames: [],
          freevars: [],
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
          constants: [3, 4, 2, null],
          names: [],
          varnames: [],
          freevars: [],
          instructions: [
            ['load-const', 0],
            ['load-const', 1],
            ['binary-multiply'],
            ['load-const', 2],
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
          constants: [3, 2, null],
          names: ['print'],
          varnames: [],
          freevars: [],
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
          constants: [3, 2, null],
          names: [],
          varnames: [],
          freevars: [],
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
             ['MethodCall', ['LoadMethod', '__str__']],
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
          constants: [null],
          names: ['print', '__doc__'],
          varnames: [],
          freevars: [],
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
          constants: [null],
          names: ['print', '__doc__', '__str__'],
          varnames: [],
          freevars: [],
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
          constants: [20, null],
          names: ['object', '__doc__', 'zfill'],
          varnames: [],
          freevars: [],
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
          constants: [{
            constants: [1],
            names: [],
            varnames: [],
            freevars: [],
            instructions: [
              ['load-const', 0],
              ['return-value'],
            ],
          }, '<lambda>', null],
          names: [],
          varnames: [],
          freevars: [],
          instructions: [
            ['load-const', 0],
            ['load-const', 1],
            ['make-function'],
            ['load-const', 2],
            ['return-value'],
          ],
        });
      });
    });

    describe('Closures', () => {
      it("should gen globals", () => {
        const tree = parse(`a = 1; f = fn(p) p+a+1; f(1) # 2\n`);
        const code = translate(tree);

        expect(code).toEqual({
          constants: [1, {
            constants: [1],
            names: ['a'],
            varnames: ['p'],
            freevars: [],
            instructions: [
              ['load-const', 0],
              ['load-global', 0],
              ['load-fast', 0],
              ['binary-add'],
              ['binary-add'],
              ['return-value'],
            ],
          }, '<lambda>', null],
          names: ['a', 'f'],
          varnames: [],
          freevars: [],
          instructions: [
            ['load-const', 0],  // 1
            ['store-name', 0],  // a
            ['load-const', 1],  // <lambda>
            ['load-const', 2],  // 'lambda'
            ['make-function'],
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
        return;

        expect(code).toEqual({
          constants: [null],
          names: ['f', 'print'],
          varnames: [],
          freevars: [],
          instructions: [
            ['load-name', 0],
            ['call-function', 0],
            ['load-const', 0],
            ['return-value'],
          ],
        });

      });
    });                         // Scopes
  });                           // Expression

  describe('Statement', () => {
    describe('Assignment', () => {
      it("should work with one variable", () => {
        const tree = parse(`a = 51; print(a)`);
        const code = translate(tree);

        expect(code).toEqual({
          constants: [51, null],
          names: ['a', 'print'],
          varnames: [],
          freevars: [],
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
