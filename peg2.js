const sym = Symbol.for;

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
  // Helper for flattening sequence
  const singleOrList = (x) => (Array.isArray(x) && x.length === 1 && x[0]) || x;

  // PEG Parser
  const Grammar = () => [Spacing(), oneOrMore(Definition), EndOfFile()][1];
  const Definition = () => [Identifier(), LEFTARROW(), Expression()].filter((_, i) => i !== 1);

  const Expression = () => [Sequence()].concat(zeroOrMore(() => SLASH() && Sequence()));
  const Sequence = () => singleOrList(zeroOrMore(Prefix));
  const Prefix = () => {
    const [prefix, suffix] = [optional(() => Choice(AND, NOT)), Suffix()];
    return prefix ? [prefix, suffix] : suffix;
  };
  const Suffix = () => {
    const [primary, suffix] = [Primary(), optional(() => Choice(QUESTION, STAR, PLUS))];
    return suffix ? [suffix, primary] : primary;
  };
  const Primary = () => Choice(
    () => [Identifier(), not(LEFTARROW)][0],
    () => [OPEN(), Expression(), CLOSE()][1],
    Literal, Class, DOT);

  // # Lexical syntax
  const Identifier = () => {
    const isIdentStart = () => /[A-Za-z_]/.test(currc());
    const isIdentCont = () => /[A-Za-z0-9_]/.test(currc());
    const identifier = isIdentStart() && consume(isIdentCont);
    Spacing();
    if (identifier) return Symbol.for(identifier);
    return error("Expected Identifier");
  };
  const _mkLiteral = (ch) => () => [
    must(ch),
    zeroOrMore(() => not(() => mustc(ch)) && Char()),
    must(ch),
    Spacing()][1].join("");
  const Literal = () => Choice(_mkLiteral("'"), _mkLiteral('"'));
  const Class = () => [sym('Class'), [
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
  const AND        = () => must('&') && Spacing() && sym('and');
  const NOT        = () => must('!') && Spacing() && sym('not');
  const QUESTION   = () => must('?') && Spacing() && sym('optional');
  const STAR       = () => must('*') && Spacing() && sym('zeroOrMore');
  const PLUS       = () => must('+') && Spacing() && sym('oneOrMore');
  const OPEN       = () => must('(') && Spacing();
  const CLOSE      = () => must(')') && Spacing();
  const DOT        = () => must('.') && Spacing() && sym('any');

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
  peg,
  sym,
};
