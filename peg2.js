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

// class Dot extends Node {}

const Peg = {
  DOT() {},
  Class() { return 1; },
};

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
  const mustc = (c) => testc(c) || error(`Missing '${c}' at pos '${cursor}'`);
  const must = (c) => match(c) || error(`Missing '${c}' at pos '${cursor}'`);
  const eos = () => cursor === source.length;
  const consume = (predicate) => {
    let chars = "";
    while (predicate()) chars += nextc();
    return chars;
  };
  const backtrack = (exp) => {
    const saved = cursor;
    try { return exp(); }
    catch (e) { cursor = saved; throw e; }
  };
  // Wrapper for primitives that need backtracking
  const Choice = (...a) => choice(...a.map(x => () => backtrack(x)));
  // const Not = (x) => backtrack(() => not(x));

  // PEG Parser

  // const G = () => {
  //   parseSpacing();
  //   return oneOrMore(parseDefinition);
  // };
  // const parseDefinition = () => {
  //   const id = parseIdentifier();
  //   parseArrow();
  //   return [id, parseExpression()];
  // };

  // const parseSlash = () => must('/') && parseSpacing();
  // const parseExpression = () =>
  //   [parseSequence()].concat(
  //     zeroOrMore(() => {
  //       parseSlash();
  //       return parseSequence();
  //     }));

  // const parseSequence = () => parsePrefix();

  // const parseAnd = () => [must('&'), parseSpacing(), and].pop();
  // const parseNot = () => [must('!'), parseSpacing(), not].pop();

  // const parsePrefix = () =>
  //   [optional(() => choice(parseAnd, parseNot)), parseSuffix()];

  // const parseSuffix = () => parsePrimary();

  // const parsePrimary = () =>
  //   choice(Literal, Class, Dot);

  const Grammar = () => [Spacing(), oneOrMore(Definition), EndOfFile()][1];
  const Definition = () => [Identifier(), LEFTARROW(), Expression()];

  const Expression = () => [Sequence(), zeroOrMore(() => SLASH() && Sequence())];
  const Sequence = () => zeroOrMore(Prefix);
  const Prefix = () => {
    const [prefix, primary] = [optional(() => choice(AND, NOT)), Primary()];
    return prefix ? [prefix, primary] : primary;
  };
  const Suffix = () => {
    const [primary, suffix] = [Primary(), optional(() => choice(QUESTION, STAR, PLUS))];
    return suffix ? [primary, suffix] : primary;
  };
  const Primary = () => choice(Literal, Class, DOT);

  // # Lexical syntax
  const Identifier = () => {
    const isIdentStart = () => /[A-Za-z_]/.test(currc());
    const isIdentCont = () => /[A-Za-z0-9_]/.test(currc());
    const identifier = isIdentStart() && consume(isIdentCont);
    Spacing();
    return Symbol.for(identifier) || error("Expected Identifier");
  };
  const _mkLiteral = (ch) => () => [
    must(ch),
    zeroOrMore(() => not(() => mustc(ch)) && Char()),
    must(ch),
    Spacing()][1].join("");
  const Literal = () => Choice(_mkLiteral("'"), _mkLiteral('"'));
  const Class = () => [Peg.Class, [
    must('['),
    zeroOrMore(() => not(() => mustc(']')) && Range()),
    must(']'),
    Spacing()][1]];

  const Range = () => Choice(() => [Char(), must('-'), Char()].filter((_, i) => i !== 1), Char);
  const Char = () => {
    if (match('\\')) {
      const eschr = ['n', 'r', 't', "'", '"', '[', ']', '\\'];
      if (eschr.includes(currc())) return match(currc());
      return error(`Expected either of ${eschr}`);
    }
    return nextc();
  };

  const LEFTARROW  = () => must("<") && must("-") && Spacing();
  const SLASH      = () => must('/') && Spacing();
  const AND        = () => must('&') && Spacing();
  const NOT        = () => must('!') && Spacing();
  const QUESTION   = () => must('?') && Spacing();
  const STAR       = () => must('*') && Spacing();
  const PLUS       = () => must('+') && Spacing();
  const OPEN       = () => must('(') && Spacing();
  const CLOSE      = () => must(')') && Spacing();
  const DOT        = () => must('.') && Spacing() && [Peg.DOT];

  const Spacing    = () => zeroOrMore(() => choice(Space, Comment));
  const Comment    = () => [must('#'), zeroOrMore(() => not(EndOfLine) && Char()), EndOfLine()];
  const Space      = () => Choice(( ) => must(' '), () => must('\t'), EndOfLine);
  const EndOfLine  = () => Choice(
    () => must('\r') && must('\n'),
    () => must('\n'),
    () => must('\r'));
  const EndOfFile  = () => eos() || error("Expected EOS");

  return {
    // useful for tests
    currc,
    cursor,
    eos,
    // Actual thing
    Grammar,
    Definition,

    Expression,
    Sequence,
    Prefix,
    Suffix,
    Primary,

    Identifier,
    Literal,
    Class,
    Range,
    Char,

    LEFTARROW,
    SLASH,
    AND,
    NOT,
    QUESTION,
    STAR,
    PLUS,
    OPEN,
    CLOSE,
    DOT,

    Spacing,
    Comment,
    Space,
    EndOfLine,
    EndOfFile,
  };
}

function peg(source) {
  const g = parse(source).Grammar();
  return (input) => {
    console.log('GRAMMAR', g);
  };
}

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
  Peg,
  peg,
};
