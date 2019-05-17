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
  });
});
