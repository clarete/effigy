// --- PEG Primitives (Doesn't include lexer) ---

// Star Operator (*)
const zeroOrMore = (combinator) => {
  const output = [];
  while (true) {
    try { output.push(combinator()); }
    catch (e) { return output; }
  }
  return output;
};
// Plus Operator (+)
const oneOrMore = (combinator) =>
  [combinator()].concat(zeroOrMore(combinator));
// Choice Operator (/)
const choice = (...a) => {
  let last = null;
  for (const nth of a) {
    try { return nth(); }
    catch (e) { last = e; }
  }
  throw last;
};
// Optional Operator (?)
const optional = (combinator) => {
  try { return combinator(); }
  catch (e) { return null; }
};
// Not Operator (!)
const not = (thing) => {
  try { thing(); }
  catch (e) { return true; }
  throw new Error;
};
// And Operator (&)
const and = (thing) => not(() => not(thing));

// Basic machinery to parse things
function parse(source) {
  let cursor = 0;
  const error = (msg) => { throw new Error(msg); };
  const checkeos = () => eos() && error('End of stream');
  // Lexer
  const currc = () => source[cursor] || '';
  const nextc = () => checkeos() || source[cursor++];
  const testc = (c) =>  currc() === c;
  const match = (c) => testc(c) ? nextc() : false;
  const must = (c) => match(c) || error(`Missing '${c}' at pos '${cursor}'`);
  const eos = () => cursor === source.length;
  const consume = (predicate) => {
    let chars = "";
    while (predicate()) chars += nextc();
    return chars;
  };


  const G = () => {
    parseSpacing();
    return oneOrMore(parseDefinition);
  };
  const parseDefinition = () => {
    const id = parseIdentifier();
    parseArrow();
    return [id, parseExpression()];
  };

  const parseSlash = () => must('/') && parseSpacing();
  const parseExpression = () =>
    [parseSequence()].concat(
      zeroOrMore(() => {
        parseSlash();
        return parseSequence();
      }));

  const parseSequence = () => parsePrefix();

  const parseAnd = () => [must('&'), parseSpacing(), and].pop();
  const parseNot = () => [must('!'), parseSpacing(), not].pop();

  const parsePrefix = () =>
    [optional(() => choice(parseAnd, parseNot)), parseSuffix()];

  const parseSuffix = () => parsePrimary();

  const parsePrimary = () =>
    choice(parseLiteral, parseClass, parseDot);

  const parseLiteral = () => {
    if (match('"')) {
      const out = consume(() => !testc('"'));
      must('"'); parseSpacing();
      return out;
    } else if (match("'")) {
      const out = consume(() => !testc("'"));
      must("'"); parseSpacing();
      return out;
    }
    return error("No literal found");
  };

  const parseIdentifier = () => {
    const isIdentStart = () => /[A-Za-z_]/.test(currc());
    const isIdentCont = () => /[A-Za-z0-9_]/.test(currc());
    const identifier = isIdentStart() && consume(isIdentCont);
    parseSpacing();
    return identifier || error("Expected Identifier");
  };

  const parseClass = () => {
    must('[');
    const ranges = zeroOrMore(() =>
      not(() => match(']')) && parseRange());
    must(']');
    parseSpacing();
    return ranges;
  };
  const parseRange = () => {
    const ch1 = parseChar();
    if (match('-')) return [ch1, parseChar()];
    return ch1;
  };
  const parseChar = () => {
    if (match('\\')) {
      const eschr = ['n', 'r', 't', "'", '"', '[', ']', '\\'];
      for (const s of eschr) {
        const m = match(s);
        if (m) return m;
      }
      return error(`Expected either of ${eschr}`);
    }
    const tmp = currc(); nextc();
    return tmp;
  };
  const parseDot = () =>
    [must('.'), parseSpacing(), any].pop();
  const parseArrow = () =>
    must("<") && must("-") && parseSpacing();

  // Comments & Spacing
  const parseComment = () => {
    must("#");
    const comment = consume(() => !isEndOfLine());
    if (consume(isEndOfLine).length < 1)
      error('Cant find end of line for comment');
    return comment;
  };
  const isEndOfLine = () =>
    ['\r\n', '\n', '\r'].includes(currc());
  const isSpace = () =>
    [' ', '\t'].includes(currc()) || isEndOfLine();
  const parseSpace = () =>
    consume(isSpace) || error('Cant find space');
  const parseSpacing = () =>
    zeroOrMore(() => choice(parseComment, parseSpace));

  return {
    parseSpacing,
  };
}



// // Any Operator (.)
// const any = () => nextc();     // Should be next in the input, not source
// // Class Operator ([])
// const class_ = (c) => typeof c === 'string' ? c : range(c);
// const range = (c) => c;
// // Sequence Operator
// const sequence = (s) => s;

module.exports = {
  // Primitives
  zeroOrMore,
  oneOrMore,
  choice,
  optional,
  not,
  and,
  // Parser Interface
  parse,
};
