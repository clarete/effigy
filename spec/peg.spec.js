const {
  zeroOrMore,
  oneOrMore,
  choice,
  optional,
  not,
  and,
  parse,
} = require("../peg2");

// deftest("aaa");            assertEq(zeroOrMore(() => must('a')), ['a', 'a', 'a']);
// deftest("some 123\nchrs"); assert.equal(zeroOrMore(parseChar).join(''), 'some 123\nchrs');
// deftest("# comment\n  ");  assertEq(parseSpacing(), [' comment', '  ']);
// deftest("a-z");            assertEq(parseRange(), ['a', 'z']);
// deftest("f");              assert.equal(parseRange(), 'f');
// deftest("a");              assertEq(not(() => match("]")), true);
// deftest("]");              let call = false;
// try { not(() => match("]")); }
// catch (e) { call = true; };
// assert (call); assert(cursor === 0);
// deftest("[a]");            assertEq(parseClass(), [class_, 'a']);
// deftest("[a-z]");          assertEq(parseClass(), [class_, ['a', 'z']]);
// deftest("'oi'");           assertEq(parseLiteral(), 'oi');
// deftest('"oi"');           assertEq(parseLiteral(), 'oi');
// deftest('.');              assertEq(parseDot(), any);
// deftest('[a-b] / "oi"');   console.log(parseExpression());//assertEq(parseExpression(), [[['a', 'b']], 'oi']);

// deftest('![a]');             console.log(parseExpression());//assertEq(parseExpression(), []);

describe("peg parser", () => {
  describe("#parseArrow", () => {
    it("should parse arrow at cursor", () => {
      const p = parse("<- ");
      p.LEFTARROW();
      expect(p.eos()).toBe(true);
    });
  });
  describe("#Spacing", () => {
    it("should parse spaces", () => {
      const p = parse("  ");
      expect(p.Spacing()).toEqual([' ', ' ']);
      expect(p.eos()).toBe(true);
    });
    it("should parse comments", () => {
      const p = parse("# foo bar baz  ");
      expect(p.Spacing()).toEqual([]);
      expect(p.eos()).toBe(true);
    });
  });
});

describe("peg primitives", () => {
  describe("Star Operator (*)", () => {
    it("should return nothing if it doesnt match anything", () => {
      function* gencombinator() { throw new Error ("foo"); }
      const combinator = gencombinator();
      expect(zeroOrMore(() => combinator.next().value)).toEqual([]);
    });
    it("should match as much as possible", () => {
      function* gencombinator() { yield 'a'; yield 'b'; throw new Error ("foo"); }
      const combinator = gencombinator();
      expect(zeroOrMore(() => combinator.next().value)).toEqual(['a', 'b']);
    });
  });
  describe("Plus Operator (+)", () => {
    it("should fail if it doesnt match anything", () => {
      function* gencombinator() { throw new Error ("foo"); }
      const combinator = gencombinator();
      expect(() => oneOrMore(() => combinator.next().value)).toThrow(new Error('foo'));
    });
    it("should match as much as possible", () => {
      function* gencombinator() { yield 'a'; yield 'b'; throw new Error ("foo"); }
      const combinator = gencombinator();
      expect(oneOrMore(() => combinator.next().value)).toEqual(['a', 'b']);
    });
  });
  describe("Choice Operator (/)", () => {
    it("should return last error exhaust all options", () => {
      function err0() { throw new Error("err0"); }
      function err1() { throw new Error("err1"); }
      function err2() { throw new Error("err2"); }
      expect(() => choice(err0, err1, err2)).toThrow(new Error("err2"));
    });
    it("should select first successful match", () => {
      function err0() { throw new Error("err0"); }
      function suc1() { return "yay"; }
      function err2() { throw new Error("err2"); }
      expect(choice(err0, suc1, err2)).toEqual("yay");
    });
  });
  describe("Optional Operator (?)", () => {
    it("should return empty when it doesn't match", () => {
      function err0() { throw new Error("err0"); }
      expect(optional(err0)).toBe(null);
    });
    it("should result of match on success", () => {
      const success = () => "awessome";
      expect(optional(success)).toEqual("awessome");
    });
  });
  describe("Not Operator (!)", () => {
    it("should return true when it doesn't match", () => {
      function err0() { throw new Error("err0"); }
      expect(not(err0)).toBe(true);
    });
    it("should return false when it matches", () => {
      const success = () => "awessome";
      expect(() => not(success)).toThrow(new Error);
    });
  });
  describe("And Operator (&)", () => {
    it("should return true when it matches", () => {
      const success = () => "awessome";
      expect(and(success)).toBe(true);
    });
    it("should return false when it doesn't match", () => {
      function err0() { throw new Error("err0"); }
      expect(() => and(err0)).toThrow(new Error);
    });
  });
});
