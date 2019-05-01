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
const singleOrList = (x) => (Array.isArray(x) && // It's a list
                            typeof x[0] !== 'symbol' && // And not a function
                            x.length === 1
                            && x[0]) || x;

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
    if (currc() >= a && currc() <= b) return nextc();
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
  const Range = (p) => Array.isArray(p) ? range(p) : must(p);
  return {
    Not, Choice, Range,
    currc, consume, mustc, must, match, eos, error, nextc,
  };
}

// PEG Parser
function peg(s) {
  // If a list is the representation of Expression or Function
  const isFunc = (n) => typeof n[0] === 'symbol' || n[0] instanceof PrimFun;
  const isFuncAst = (n) => Array.isArray(n) && n.length > 0 && isFunc(n);

  // PEG Parser
  const Grammar = () => [Spacing(), oneOrMore(Definition), EndOfFile()][1];
  const Definition = () => [Identifier(), LEFTARROW(), Expression()].filter((_, i) => i !== 1);

  const mc = (l) => l.length === 1 ? l : [prim('choice')].concat(l);
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
    if (identifier) return sym(identifier);
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
    return typeof cls === 'string' || isFuncAst(cls)
      ? singleOrList(cls)
      : [prim('choice'), ...cls];
  };

  const Range = () => s.Choice(() => [prim('range'), Char(), s.must('-'), Char()].filter((_, i) => i !== 2), Char);
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
  const AND        = () => s.must('&') && Spacing() && prim('and');
  const NOT        = () => s.must('!') && Spacing() && prim('not');
  const QUESTION   = () => s.must('?') && Spacing() && prim('optional');
  const STAR       = () => s.must('*') && Spacing() && prim('zeroOrMore');
  const PLUS       = () => s.must('+') && Spacing() && prim('oneOrMore');
  const OPEN       = () => s.must('(') && Spacing();
  const CLOSE      = () => s.must(')') && Spacing();
  const DOT        = () => s.must('.') && Spacing() && prim('any');

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

// Find a key within an object or error if it doesn't exist
const V = (e, k) => {
  const i = e[k];
  if (i) return i;
  throw new Error(`Can't find ${k.toString()}`);
};

// How regular values are separated from functions
class PrimFun { constructor(n) { this.name = n; } }
const prim = (n) => new PrimFun(n);
const sym = Symbol.for;

function pegc(g) {
  const { grammar: G, start } = pegt(parse(g).Grammar());

  const match = (input) => {
    const s = scan(input);
    const prims = {
      zeroOrMore,
      oneOrMore,
      choice: s.Choice,
      range: s.Range,
      optional,
      not,
      and,
    };

    // How we call functions
    const thunk = (v) => () => matchexpr(v);
    const call = (fn, args) => fn(...args.slice(1).map(thunk));
    const callprim = (e) => {
      const fn = V(prims, e[0].name);
      if (e[0].name === 'range') return fn(e.slice(1));
      return call(fn, e);
    };

    // Clean up remains of zeroOrMore successful match that doesn't
    // consume any input and leaves a dangling []. There's probably a
    // better way to do this.
    const cleanList = (l) => {
      if (!Array.isArray(l)) return l;
      const out = l.filter(x => x);
      return out.length > 0 ? out : null;
    };
    const cl = (l) => singleOrList(cleanList(l));

    // If the identifier starts with an underscore (_) this not quite
    // elegant piece of code will prevent it from being captured in
    // the parse tree. That doesn't apply to the first rule though.
    const skipcapture = (s) => s.toString().match(/Symbol\(\_/);

    // Recursive Eval
    const matchexpr = (e) => {
      if (Array.isArray(e) && e[0] instanceof PrimFun) {
        // This is our function. It's an array where the first item is
        // a symbol or a primitive
        return cl(callprim(e));
      } else if (Array.isArray(e)) {
        // This is an actual list
        return cl(e.map(matchexpr));
      } else if (typeof e === 'string') {
        const out = [];
        for (const x of e) s.must(x) && out.push(x);
        return out.join('');
      } else if (typeof e === 'symbol') {
        if (skipcapture(e)) {
          matchexpr(V(G, e));
          return null;
        }
        return [e, cl(matchexpr(V(G, e)))];
      }
      throw new Error('Unreachable');
    };
    // Kickoff eval
    return [start, matchexpr(G[start])];
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
  prim,
};
