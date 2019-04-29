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

// Helper for flattening sequences
const singleOrList = (x) => (Array.isArray(x) && x.length === 1 && x[0]) || x;

// Basic machinery to parse things
function scan(source) {
  let cursor = 0;
  const error = (msg) => { throw new Error(msg + ` at pos ${cursor}`); };
  const checkeos = () => eos() && error('End of stream');
  const currc = () => source[cursor] || '';
  const nextc = () => checkeos() || source[cursor++];
  const testc = (c) =>  currc() === c;
  const match = (c) => testc(c) ? nextc() : false;
  const mustc = (c) => testc(c) || error(`Missing '${c} (mustc)'`);
  const range = ([a, b]) => {
    if (currc() >= a && currc() <= b) return currc();
    return error(`Missing '${currc()}' (range)`);
  };
  const must = (c) => match(c) || error(`Missing '${c}' (must)`);
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
  const Choice = (...a) => choice(...a.map(x => () => backtrack(x)));
  const Not = (p) => {
    const saved = cursor;
    try { return not(p); }
    finally { cursor = saved; }
    throw new Error('Unreachable');
  };
  const Range = (p) => singleOrList(Array.isArray(p)) ? range(p) : must(p);

  return {
    Not, Choice, Range,
    currc, consume, mustc, must, match, eos, error, nextc,
  };
}

// PEG Parser
function peg(s) {
  // If a list is the representation of Expression or Lambda
  const isLambdaAst = (n) => Array.isArray(n) && n.length > 0 && typeof n[0] === 'symbol';

  // PEG Parser
  const Grammar = () => [Spacing(), oneOrMore(Definition), EndOfFile()][1];
  const Definition = () => [Identifier(), LEFTARROW(), Expression()].filter((_, i) => i !== 1);

  const mc = (l) => l.length === 1 ? l : [sym('choice')].concat(l);
  const Expression = () => mc([Sequence()].concat(zeroOrMore(() => SLASH() && Sequence())));
  const Sequence = () => singleOrList(zeroOrMore(Prefix));
  const Prefix = () => {
    const [prefix, suffix] = [optional(() => s.Choice(AND, NOT)), Suffix()];
    return prefix ? [prefix, suffix] : suffix;
  };
  const Suffix = () => {
    const [primary, suffix] = [Primary(), optional(() => s.Choice(QUESTION, STAR, PLUS))];
    return suffix ? [suffix, primary] : primary;
  };
  const Primary = () => s.Choice(
    () => [Identifier(), not(LEFTARROW)][0],
    () => [OPEN(), Expression(), CLOSE()][1],
    Literal, Class, DOT);

  // # Lexical syntax
  const Identifier = () => {
    const isIdentStart = () => /[A-Za-z_]/.test(s.currc());
    const isIdentCont = () => /[A-Za-z0-9_]/.test(s.currc());
    const identifier = isIdentStart() && s.consume(isIdentCont);
    Spacing();
    if (identifier) return Symbol.for(identifier);
    return s.error("Expected Identifier");
  };
  const _mkLiteral = (ch) => () => [
    s.must(ch),
    zeroOrMore(() => not(() => s.mustc(ch)) && Char()),
    s.must(ch),
    Spacing()][1].join("");
  const Literal = () => s.Choice(_mkLiteral("'"), _mkLiteral('"'));
  const Class = () => {
    s.must('[');
    const cls = singleOrList(zeroOrMore(() => s.Not(() => s.mustc(']')) && Range()));
    s.must(']');
    Spacing();
    return typeof cls === 'string' || isLambdaAst(cls)
      ? singleOrList(cls)
      : [sym('choice'), ...cls];
  };

  const Range = () => s.Choice(() => [sym('range'), Char(), s.must('-'), Char()].filter((_, i) => i !== 2), Char);
  const Char = () => {
    if (s.match('\\')) {
      const eschr = ['n', 'r', 't', "'", '"', '[', ']', '\\'];
      if (eschr.includes(s.currc())) return s.match(s.currc());
      return s.error(`Expected either of ${eschr}`);
    }
    return s.nextc();
  };

  const LEFTARROW  = () => s.must("<") && s.must("-") && Spacing();
  const SLASH      = () => s.must('/') && Spacing();
  const AND        = () => s.must('&') && Spacing() && sym('and');
  const NOT        = () => s.must('!') && Spacing() && sym('not');
  const QUESTION   = () => s.must('?') && Spacing() && sym('optional');
  const STAR       = () => s.must('*') && Spacing() && sym('zeroOrMore');
  const PLUS       = () => s.must('+') && Spacing() && sym('oneOrMore');
  const OPEN       = () => s.must('(') && Spacing();
  const CLOSE      = () => s.must(')') && Spacing();
  const DOT        = () => s.must('.') && Spacing() && sym('any');

  const Spacing    = () => zeroOrMore(() => s.Choice(Space, Comment));
  const Comment    = () =>
    s.must('#') && zeroOrMore(() => s.Not(EndOfLine) && Char()) &&
    optional(EndOfLine);
  const Space      = () => s.Choice(( ) => s.must(' '), () => s.must('\t'), EndOfLine);
  const EndOfLine  = () => s.Choice(
    () => s.must('\r') && s.must('\n'),
    () => s.must('\n'),
    () => s.must('\r'));
  const EndOfFile  = () => s.eos() || s.error("Expected EOS");

  return {
    // useful for tests
    currc: s.currc,
    eos: s.eos,
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

function parse(source) {
  return peg(scan(source));
}

// Transforms the PEG tree in a dictionary where keys are the
// Non-terminals and their values are expressions
function pegt(g) {
  const m = {};
  const start = g[0][0];
  for (const definition of g) {
    const [identifier, ...expression ] = definition;
    m[identifier] = expression;
  }
  return { grammar: m, start };
}

function pegc(g) {
  const { grammar: G, start } = pegt(parse(g).Grammar());

  const match = (input) => {
    const s = scan(input);
    const thunk = (v) => () => matchexpr(v);
    // Recursive Eval
    const matchexpr = (e) => {
      if (typeof e === 'object' && Array.isArray(e)) {
        // This is our lambda. It's an array where the first item is a
        // symbol
        if (typeof e[0] === 'symbol') {
          const fn = env[e[0]];
          if (!fn) throw new Error(`Can't find ${e[0].toString()}`);
          if (e[0] === sym('range')) return fn(e.slice(1));
          return fn(...e.slice(1).map(thunk));
        }
        // This is an actual list
        return e.map(matchexpr);
      } else if (typeof e === 'string') {
        return s.must(e);
      }
      throw new Error('Unreachable');
    };
    // Primitives + Non-Terminals
    const env = {
      [sym('zeroOrMore')]: zeroOrMore,
      [sym('oneOrMore')]: oneOrMore,
      [sym('choice')]: s.Choice,
      [sym('range')]: s.Range,
      [sym('optional')]: optional,
      [sym('not')]: not,
      [sym('and')]: and,
      ...G,
    };
    // Kickoff eval
    return matchexpr(G[start]);
  };
  return { match };
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
  scan,
  peg,
  pegc,
  sym,
};
