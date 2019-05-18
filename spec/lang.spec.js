const { parse, translate } = require('../lang');
const { sym } = require('../peg');

describe("Translate", () => {
  describe("Expression", () => {
    it("Number", () => {
      const obj = translate(parse("42"));

      expect(obj).toEqual({
        constants: [42, null],
        names: [],
        code: [
          ['load-const', 0],
          ['pop-top'],
          ['load-const', 1],
          ['return-value'],
        ],
      });
    });

    it("FunCall", () => {
      const tree = parse("print()");
      const obj = translate(tree);

      expect(obj).toEqual({
        constants: [null],
        names: ['print'],
        code: [
          ['load-name', 0],
          ['call-function', 0],
          ['pop-top'],
          ['load-const', 0],
          ['return-value'],
        ],
      });
    });
  });
});
