const { parse } = require('../lang');

describe("Parse", () => {
  describe("Expression", () => {
    describe("Number", () => {
      it("DEC", () => {
        parse("1");
      });
    });
  });
});
