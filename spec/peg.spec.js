const {
  zeroOrMore,
  oneOrMore,
  choice,
  optional,
  not,
  and,
  parse,
  Peg,
  peg,
} = require("../peg2");

describe("input parser", () => {
  describe("#Literal", () => {
    it("should capture literals", () => {
      const parse = peg('A <- "a"');
      // expect(parse("a").A()).toBe('a');
    });
  });
});

describe("peg parser", () => {
  describe("#Grammar", () => {
    it("should match one definition", () => {
      const p = parse("A <- 'lit'");
      expect(p.Grammar()).toEqual([
        [Symbol.for('A'), [' '], [['lit'], []]],
      ]);
      expect(p.eos()).toBe(true);
    });
    it("should match various definitions", () => {
      const p = parse("A <- 'a'\nB <- 'b'");
      expect(p.Grammar()).toEqual([
        [Symbol.for('A'), [' '], [['a'], []]],
        [Symbol.for('B'), [' '], [['b'], []]],
      ]);
      expect(p.eos()).toBe(true);
    });
  });
  describe("#Definition", () => {
    it("should match a definition", () => {
      const p = parse("A <- 'lit'");
      expect(p.Definition()).toEqual([
        Symbol.for('A'), [' '], [['lit'], []]]);
      expect(p.eos()).toBe(true);
    });
  });
  describe("#Expression", () => {
    it("should match single item", () => {
      const p = parse("'lit'");
      expect(p.Expression()).toEqual([['lit'], []]);
      expect(p.eos()).toBe(true);
    });
    it("should match more than one sequence", () => {
      const p = parse("'0' / '1'");
      expect(p.Expression()).toEqual([['0'], [['1']]]);
      expect(p.eos()).toBe(true);
    });
  });
  describe("#Sequence", () => {
    it("should match single item", () => {
      const p = parse("'lit'");
      expect(p.Sequence()).toEqual(['lit']);
      expect(p.eos()).toBe(true);
    });
  });
  describe("#Prefix", () => {
    it("should match Prefix without any prefix", () => {
      const p = parse("'lit'");
      expect(p.Prefix()).toEqual('lit');
      expect(p.eos()).toBe(true);
    });
  });
  describe("#Suffix", () => {
    it("should match Suffix without any suffix", () => {
      const p = parse("'lit'");
      expect(p.Suffix()).toEqual('lit');
      expect(p.eos()).toBe(true);
    });
  });
  describe("#Primary", () => {
    it("should match Class", () => {
      const p = parse("[a-b]");
      expect(p.Primary()).toEqual([Peg.Class, [['a', 'b']]]);
      expect(p.eos()).toBe(true);
    });
    it("should match DOT", () => {
      const p = parse(".");
      expect(p.Primary()).toEqual([Peg.DOT]);
      expect(p.eos()).toBe(true);
    });
  });
  describe("#Identifier", () => {
    it("should match an identifier", () => {
      const p = parse("oi");
      expect(p.Identifier()).toEqual(Symbol.for('oi'));
      expect(p.eos()).toBe(true);
    });
  });
  describe("#Literal", () => {
    it("should match single quoted chars", () => {
      const p = parse("'oi'");
      expect(p.Literal()).toEqual('oi');
      expect(p.eos()).toBe(true);
    });
    it("should match double quoted chars", () => {
      const p = parse('"oi"');
      expect(p.Literal()).toEqual('oi');
      expect(p.eos()).toBe(true);
    });

    it("should match single quoted chars spaces after", () => {
      const p = parse("'oi'  \n  ");
      expect(p.Literal()).toEqual('oi');
      expect(p.eos()).toBe(true);
    });
  });
  describe("#Class", () => {
    it("should match single char classes", () => {
      const p = parse("[a]");
      expect(p.Class()).toEqual([Peg.Class, ['a']]);
      expect(p.eos()).toBe(true);
    });
    it("should match range char classes", () => {
      const p = parse("[0-9]");
      expect(p.Class()).toEqual([Peg.Class, [['0', '9']]]);
      expect(p.eos()).toBe(true);
    });
  });
  describe("#Range", () => {
    it("should match single char range", () => {
      const p = parse("f");
      expect(p.Range()).toEqual('f');
      expect(p.eos()).toBe(true);
    });
  });
  describe("#LEFTARROW", () => {
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
  describe("#EndOfLine", () => {
    it("should match \r\n", () => {
      const p = parse("\r\n");
      expect(p.EndOfLine()).toEqual('\n');
      expect(p.eos()).toBe(true);
    });
    it("should match \n", () => {
      const p = parse("\n");
      expect(p.EndOfLine()).toEqual('\n');
      expect(p.eos()).toBe(true);
    });
    it("should match \r", () => {
      const p = parse("\r");
      expect(p.EndOfLine()).toEqual('\r');
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
