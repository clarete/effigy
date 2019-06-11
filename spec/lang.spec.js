const { parse, translate } = require('../lang');

describe("Translate", () => {
  describe("Expression", () => {
    describe("Call", () => {
      it("with no parameters", () => {
        const tree = parse("print()");
        const code = translate(tree);

        expect(code).toEqual({
          constants: [null],
          names: ['print'],
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
          instructions: [
            ['load-const', 0],
            ['load-const', 1],
            ['binary-rshift'],
            ['load-const', 2],
            ['return-value'],
          ],
        });
      });

      it("should parse deep attribute access correctly", () => {
        const tree0 = parse('print.__doc__');
        expect(tree0).toEqual(
          ['Module',
            ['Attribute',
             [['Identifier', 'print'],
              ['LoadAttr', '__doc__']]]]);
        const tree1 = parse('print.__doc__.__str__().__str__');
        expect(tree1).toEqual(
          ['Module',
           ['Attribute',
            [['Identifier', 'print'],
             ['LoadAttr', '__doc__'],
             ['MethodCall', ['LoadMethod', '__str__']],
             ['LoadAttr', '__str__']]]]);
      });

      it("should provide attribute access", () => {
        const tree = parse('print.__doc__');
        const code = translate(tree);

        expect(code).toEqual({
          constants: [null],
          names: ['print', '__doc__'],
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

      it("should provide method calling", () => {
        const tree = parse('print.__doc__.__str__()');
        const code = translate(tree);

        expect(code).toEqual({
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
        });
      });

      it("should provide method calling with parameters", () => {
        const tree = parse('object.__doc__.zfill(20)');
        const code = translate(tree);

        expect(code).toEqual({
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
        });
      });
    });                         // BinOp

    describe("Lambda", () => {
      it("with single expression on the body", () => {
        const tree = parse('fn() 1');
        const code = translate(tree);

        expect(code).toEqual({
          constants: [{
            constants: [1],
            names: [],
            instructions: [
              ['load-const', 0],
              ['return-value'],
            ],
          }, '<lambda>', null],
          names: [],
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
  });                           // Expression

  describe('Statement', () => {
    describe('Assignment', () => {
      it("should work with one variable", () => {
        const tree = parse(`a = 51; print(a)`);
        const code = translate(tree);

        expect(code).toEqual({
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
        });
      });
    });
  });

});
