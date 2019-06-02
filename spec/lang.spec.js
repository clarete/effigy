const { parse, translate } = require('../lang');
const { sym } = require('../peg');

describe("Translate", () => {
  describe("Expression", () => {
    describe("FunCall", () => {
      it("should work with no parameters", () => {
        const tree = parse("print()");
        const code = translate(tree);

        expect(code).toEqual({
          constants: [null],
          names: ['print'],
          instructions: [
            ['load-name', 0],
            ['call-function', 0],
            ['pop-top'],
            ['load-const', 0],
            ['return-value'],
          ],
        });
      });

      it("should work with one number parameter", () => {
        const tree = parse("print(42)");
        const code = translate(tree);

        expect(code).toEqual({
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
        });
      });

      it("should work with two number parameter", () => {
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
            ['pop-top'],
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
            ['pop-top'],
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
            ['pop-top'],
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
            ['pop-top'],
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
            ['pop-top'],
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
            ['pop-top'],
            ['load-const', 2],
            ['return-value'],
          ],
        });
      });
    });                         // BinOp
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
            ['pop-top'],
            ['load-const', 1],
            ['return-value'],
          ],
        });
      });
    });
  });

});
