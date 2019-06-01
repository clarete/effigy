const { parse, translate } = require('../lang');
const { sym } = require('../peg');

describe("Translate", () => {
  describe("Expression", () => {
    describe("FunCall", () => {
      it("with no parameters", () => {
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
            ['pop-top'],
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
            ['pop-top'],
            ['load-const', 2],
            ['return-value'],
          ],
        });
      });
    });
  });
});
