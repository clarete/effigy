const {
  zeroOrMore,
  oneOrMore,
  choice,
  optional,
  not,
  and,

  parse,
  scan,
  pegc,
  peg,
  sym,
  prim,
  lst,
} = require("../peg");

describe("action driver", () => {
  it("should gen some code", () => {
    const fj = (x) => Array.isArray(x) && x.join('') || x;

    const pa = {
      [sym('N')]: (_, x) => parseInt(fj(x), 10),
      [sym('T')]: (_, x) => x,
      [sym('P')]: (_, x) => '+',
    };
    const pg = pegc(
      'T <- N ((P / M) N)*\n' +
      'N <- [0-9]+        \n' +
      'P <- "+"           \n' +
      'M <- "-"           \n',
      pa);

    const ta = { [sym('S')]: (_, x) => fj(x) };
    const tg = pegc(
      'T <- { V { { "+" V }* } }    \n' +
      'V <- !{ .* } .               \n',
      ta);

    const matched = pg.match('12+345+8');
    expect(tg.matchl(matched)).toEqual([
      'T',
      lst([
        ['V', 12],
        lst([
          lst(['+', ['V', 345]]),
          lst(['+', ['V',   8]]),
        ])
      ])
    ]);
  });
});

describe("list matcher", () => {
  it("should match the any operator", () => {
    const g = pegc('S <- .');
    expect(g.matchl("A")).toEqual(['S', "A"]);
  });
  it("should parse atoms", () => {
    const g = pegc('S <- !{ .* } .');
    expect(() => g.matchl([])).toThrow(new Error('Predicate at /'));
    expect(g.matchl("A")).toEqual(['S', "A"]);
    expect(g.matchl(true)).toEqual(['S', true]);
    expect(g.matchl(10)).toEqual(['S', 10]);
    // Do I need this?
    // expect(g.matchl(sym('foo'))).toEqual([sym('S'), sym('foo')]);
  });
  it("should matchl an empty list", () => {
    const g = pegc('S <- { }');
    expect(g.matchl([])).toEqual(['S', null]);
  });
  it("should parse atom inside list", () => {
    const g = pegc('S <- { "Atom" }');
    expect(g.matchl(["Atom"])).toEqual(['S', lst("Atom")]);
  });
  it("should parse multiple atoms inside list", () => {
    const g = pegc('S <- { "a" "b" "c" }');
    expect(g.matchl(["a", "b", "c"])).toEqual(
      ['S', lst(["a", "b", "c"])]);
  });
  it("should parse lists recursively", () => {
    const g = pegc('S <- { "a" { "b" { "c" } } }');
    expect(g.matchl(["a", ["b", ["c"]]])).toEqual(
      ['S', lst(['a', lst(['b', lst('c')])])]);
  });
  it("should parse lists recursively defined in other non-terminals", () => {
    const g = pegc(
      'S <- { "a" T }  \n' +
      'T <- { "b" U }  \n' +
      'U <- { "c" V }  \n' +
      'V <- { "d" }    \n'
    );
    expect(g.matchl(["a", ["b", ["c", ["d"]]]])).toEqual(
      ['S', lst(['a', ['T', lst(['b', ['U', lst(['c', ['V', lst('d')]])]])]])]);
  });
  it("should match atom recursively", () => {
    const g = pegc(
      'S <- { "a" A }    \n'+
      'A <- !{ .* } .    \n');
    expect(g.matchl(["a", 10])).toEqual(
      ['S', lst(['a', ['A', 10]])]);
  });

  it("should parse atom inside list", () => {
    const g = pegc('S <- { "A" }', { [sym('S')]: (_, x) => `y${x}y` });
    expect(g.matchl(["A"])).toBe("yAy");
  });
});

describe("input parser", () => {
  describe("Actions", () => {
    it("should execute action for Non-Terminal", () => {
      const a = { [sym('Num')]: (_, x) => parseInt((Array.isArray(x) && x.join('') || x)) };
      const g = pegc("Num <- [0-9]+", a);
      expect(g.match("1")).toBe(1);
    });
  });
  describe("#Plus", () => {
    it("should match a single element", () => {
      const g = pegc("A <- 'a'+");
      expect(g.match("a")).toEqual(['A', 'a']);
    });
    it("should match multiple elements", () => {
      const g = pegc("A <- 'a'+");
      expect(g.match("aaaa")).toEqual([
        'A',
        ['a', 'a', 'a', 'a'],
      ]);
    });
    it("should match the digit example", () => {
      const g = pegc("A <- [0-9]+");
      expect(g.match("2019")).toEqual(['A', ['2', '0', '1', '9']]);
    });
  });
  describe("#Class", () => {
    it("should capture class of single char", () => {
      const g = pegc("A <- [a]");
      expect(g.match("a")).toEqual(['A', 'a']);
    });
    it("should capture class of multi char", () => {
      const g = pegc("A <- [ab]");
      expect(g.match("a")).toEqual(['A', 'a']);
      expect(g.match("b")).toEqual(['A', 'b']);
    });
    it("should capture class with single range", () => {
      const g = pegc("A <- [a-z]");
      expect(g.match("a")).toEqual(['A', 'a']);
      expect(g.match("f")).toEqual(['A', 'f']);
    });
    it("should capture class with multi range", () => {
      const g = pegc("A <- [a-z0-9]");
      expect(g.match("a")).toEqual(['A', 'a']);
      expect(g.match("5")).toEqual(['A', '5']);
    });
  });
  describe("#Literal", () => {
    it("should capture literals", () => {
      const g = pegc("A <- 'b' 'a'* / 'c'");
      expect(g.match("b")).toEqual(['A', 'b']);
      expect(g.match("baa")).toEqual(['A', ['b', ['a', 'a']]]);
      expect(g.match("c")).toEqual(['A', "c"]);
    });
    it("should capture multichar literals", () => {
      const g = pegc("A <- 'test'");
      expect(g.match("test")).toEqual(['A', 'test']);
    });
  });
  describe("#DOT", () => {
    it("should match anything but `b'", () => {
      const g = pegc("A <- !'b' .");
      expect(g.match("a")).toEqual(['A', 'a']);
      expect(g.match("c")).toEqual(['A', 'c']);
      expect(() => g.match("b")).toThrow(new Error);
    });
    it("should match any char", () => {
      const g = pegc("A <- .");
      expect(g.match("t")).toEqual(['A', 't']);
    });
  });
});

describe("peg parser", () => {
  describe("#Grammar", () => {
    it("should match one definition", () => {
      const p = parse("A <- 'lit'");
      expect(p.Grammar()).toEqual([
        [sym('A'), ['lit']],
      ]);
      expect(p.eos()).toBe(true);
    });
    it("should match more than one definition", () => {
      const p = parse("A <- 'a'\nB <- 'b'");
      expect(p.Grammar()).toEqual([
        [sym('A'), ['a']],
        [sym('B'), ['b']],
      ]);
      expect(p.eos()).toBe(true);
    });
  });
  describe("#Definition", () => {
    it("should match a definition", () => {
      const p = parse("A <- 'lit'");
      expect(p.Definition()).toEqual([sym('A'), ['lit']]);
      expect(p.eos()).toBe(true);
    });
  });
  describe("#Expression", () => {
    it("should match single item", () => {
      const p = parse("'lit'");
      expect(p.Expression()).toEqual(['lit']);
      expect(p.eos()).toBe(true);
    });
    it("should match more than one sequence", () => {
      const p = parse("'0' / '1' / '2' / '3'");
      expect(p.Expression()).toEqual([prim('choice'), '0', '1', '2', '3']);
      expect(p.eos()).toBe(true);
    });
  });
  describe("#Sequence", () => {
    it("should match single item", () => {
      const p = parse("'lit'");
      expect(p.Sequence()).toEqual('lit');
      expect(p.eos()).toBe(true);
    });
  });
  describe("#Prefix", () => {
    it("should match Prefix without any prefix", () => {
      const p = parse("'lit'");
      expect(p.Prefix()).toEqual('lit');
      expect(p.eos()).toBe(true);
    });
    it("should match Prefix Not", () => {
      const p = parse("!A");
      expect(p.Prefix()).toEqual([prim('not'), sym('A')]);
      expect(p.eos()).toBe(true);
    });
    it("should match Prefix And", () => {
      const p = parse("&A");
      expect(p.Prefix()).toEqual([prim('and'), sym('A')]);
      expect(p.eos()).toBe(true);
    });
  });
  describe("#Suffix", () => {
    it("should match Suffix without any suffix", () => {
      const p = parse("'lit'");
      expect(p.Suffix()).toEqual('lit');
      expect(p.eos()).toBe(true);
    });
    it("should match Suffix Star Operator", () => {
      const p = parse("A*");
      expect(p.Suffix()).toEqual([prim('zeroOrMore'), sym('A')]);
      expect(p.eos()).toBe(true);
    });
    it("should match Suffix Plus Operator", () => {
      const p = parse("A+");
      expect(p.Suffix()).toEqual([prim('oneOrMore'), sym('A')]);
      expect(p.eos()).toBe(true);
    });
    it("should match Suffix Optional Operator", () => {
      const p = parse("A?");
      expect(p.Suffix()).toEqual([prim('optional'), sym('A')]);
      expect(p.eos()).toBe(true);
    });
  });
  describe("#Primary", () => {
    it("should match Identifier", () => {
      const p = parse("A");
      expect(p.Primary()).toEqual(sym('A'));
      expect(p.eos()).toBe(true);
    });
    it("should match Literal", () => {
      const p = parse("'a'");
      expect(p.Primary()).toEqual('a');
      expect(p.eos()).toBe(true);
    });
    it("should match Class", () => {
      const p = parse("[a-b]");
      expect(p.Primary()).toEqual([prim('range'), 'a', 'b']);
      expect(p.eos()).toBe(true);
    });
    it("should match DOT", () => {
      const p = parse(".");
      expect(p.Primary()).toEqual(prim('any'));
      expect(p.eos()).toBe(true);
    });
    it("should match lists", () => {
      const p = parse("{ a }");
      expect(p.Primary()).toEqual([prim('list'), [sym('a')]]);
      expect(p.eos()).toBe(true);
    });
    it("should match lists with multiple items", () => {
      const p = parse("{ a b }");
      expect(p.Primary())
        .toEqual([prim('list'), [sym('a'), sym('b')]]);
      expect(p.eos()).toBe(true);
    });
  });
  describe("#Identifier", () => {
    it("should match an identifier", () => {
      const p = parse("oi");
      expect(p.Identifier()).toEqual(sym('oi'));
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
      expect(p.Class()).toEqual('a');
      expect(p.eos()).toBe(true);
    });
    it("should match single range char classes", () => {
      const p = parse("[0-9]");
      expect(p.Class()).toEqual([prim('range'), '0', '9']);
      expect(p.eos()).toBe(true);
    });
    it("should match multi char classes", () => {
      const p = parse("[@$]");
      expect(p.Class()).toEqual([prim('choice'), '@', '$']);
      expect(p.eos()).toBe(true);
    });
    it("should match multi range char classes", () => {
      const p = parse("[a-z0-9]");
      expect(p.Class()).toEqual([
        prim('choice'),
        [prim('range'), 'a', 'z'],
        [prim('range'), '0', '9']
      ]);
      expect(p.eos()).toBe(true);
    });
    it("should match mix of multi & single range chars ", () => {
      const p = parse("[a-z0-9_]");
      expect(p.Class()).toEqual([
        prim('choice'),
        [prim('range'), 'a', 'z'],
        [prim('range'), '0', '9'],
        '_',
      ]);
      expect(p.eos()).toBe(true);
    });
  });
  describe("#Range", () => {
    it("should match single char", () => {
      const p = parse("f");
      expect(p.Range()).toEqual('f');
      expect(p.eos()).toBe(true);
    });
    it("should match char range", () => {
      const p = parse("0-9");
      expect(p.Range()).toEqual([prim('range'), '0', '9']);
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
      const p = parse("# a\n#b");
      expect(p.Spacing()).toEqual(['\n', null]);
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
