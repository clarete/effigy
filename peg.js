// peg.js - dynamic teeny lil parser generator

// Copyright (C) 2019  Lincoln Clarete

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

// --- PEG Primitives (Doesn't include lexer) ---

class MatchError extends Error {};
class PredicateError extends MatchError {};

// Star Operator (*)
const zeroOrMore = (combinator) => {
  const output = [];
  while (true) {
    try { output.push(combinator()); }
    catch (e) { break; }
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
    catch (e) {
      if (e instanceof MatchError) last = e;
      else throw e;
    }
  }
  throw last;
};
// Optional Operator (?)
const optional = (combinator) => {
  try { return combinator(); }
  catch (e) {
    if (e instanceof MatchError) return null;
    else throw e;
  }
};
// Not Operator (!)
const not = (thing) => {
  try { thing(); }
  catch (e) {
    if (e instanceof MatchError) return true;
    else throw e;
  }
  throw new PredicateError;
};
// And Operator (&)
const and = (thing) => not(() => not(thing));

// --- Helpers ---

// Helper for flattening sequences
const singleOrList = (x) => {
  if (consp(x)                 && // It's a list
      !(x instanceof List)     && // But not a user list
      typeof x[0] !== 'symbol' && // And not a function
      x.length === 1)             // And has a single element
    return x[0];
  return x;
};

// We lisp yet
const car = ([h, ...t]) => h;
const cdr = ([h, ...t]) => t;
const consp = Array.isArray;

// --- Scanners ---

// Basic machinery to parse things
function scan(source) {
  let cursor = 0;
  let ffp = 0;
  // Track Farthest Failure Position
  const ipp = (x) => {
    if (++cursor > ffp) ffp = cursor;
    return x;
  };

  const error = (msg) => { throw new MatchError(`${msg} at pos ${ffp}`); };
  const checkeos = () => eos() && error('End of stream');
  const currc = () => source[cursor] || '';
  const nextc = () => checkeos() || ipp(source[cursor]);
  const testc = (c) => currc() === c;
  const match = (c) => testc(c) ? nextc() : false;
  const expect = (c) => testc(c) || error(`Missing '${c}' (expect)`);
  const range = ([a, b]) => {
    if (currc() >= a && currc() <= b) return nextc();
    return error(`Missing '${currc()}' (range)`);
  };

  const mustAtom = (c) => {
    const out = [];
    for (const x of c) must(x) && out.push(x);
    return out.join('');
  };

  const must = (c) => match(c) || error(`Missing '${c}' (must)`);
  const mustCharOrAtom = c => c.length === 1 ? must(c) : mustAtom(c);

  const any = () => checkeos() || nextc();
  const eos = () => cursor === source.length;
  const backtrack = (exp) => {
    const saved = cursor;
    try { return exp(); }
    catch (e) { cursor = saved; throw e; }
  };
  const Choice = (...a) => choice(...a.map(x => () => backtrack(x)));
  const Not = (p) => {
    const saved = cursor;
    try { not(p); return pred(); }
    catch (e) { cursor = saved; return error(`Predicate`); }
  };
  const Range = (p) => consp(p) ? range(p) : must(p);
  return {
    Not, Choice, Range,
    currc, expect, must: mustCharOrAtom,
    match, eos, error, nextc, any,
  };
}

function scanl(tree) {
  let current = tree;

  const error = (m) => { throw new MatchError(m); };
  const eos = () => currc() === undefined;
  const checkeos = () => eos() && error('End of stream');
  const testc = (c) => currc() === c;
  const match = (c) => {
    if (testc(c)) {
      const c = currc();
      nextc();
      return c;
    }
    return false;
  };
  const must = (c) => match(c) ||
        error(`Expected '${c}' (${typeof c}), ` +
              `got '${currc()}' (${typeof currc()})`);

  const currc = () => car(current);

  const any = () => {
    const curr = currc();
    nextc();
    return curr;
  };

  const nextc = () => {
    checkeos();
    current = cdr(current);
    return current;
  };

  let listStack = [];

  // JavaScript doesn't like `[] === []` for some reason :/
  const isTheEmptyList = (l) =>
    Boolean(consp(l) && l.length === 0);

  const errorStack = [];
  const errPath = () => errorStack.join('/') || '/';

  const list = (fn) => {
    if (!consp(currc())) error(`Expected list at ${errPath()}`);
    listStack.push(cdr(current));
    current = car(current);
    errorStack.push(car(current));
    try {
      const r = fn();
      if (!isTheEmptyList(current)) error("Unmatched sublist");
      current = listStack.pop();
      return lst(r);
    } finally {
      errorStack.pop();
    }
  };

  const backtrack = (exp) => {
    const saved = current;
    const savedList = listStack.slice();
    try { return exp(); }
    catch (e) { current = saved; listStack = savedList; throw e; }
  };

  const Choice = (...a) =>
    choice(...a.map(x => () => backtrack(x)));

  const Not = (p) => {
    const saved = current;
    try { return not(p) && pred(); }
    catch (e) { return error(`Predicate at ${errPath()}`); }
    finally { current = saved; }
  };

  return {
    Not, Choice, any, list,
    currc, must, error,
  };
}

// PEG Parser
function peg(s) {
  // If a list is the representation of Expression or Function
  const isFunc = (n) => typeof n[0] === 'symbol' || n[0] instanceof PrimFun;
  const isFuncAst = (n) => consp(n) && n.length > 0 && isFunc(n);

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
    () => [OPEN(), singleOrList(Expression()), CLOSE()][1],
    List, Literal, Class, DOT);
  const List = () =>
    [prim('list'),
     [LSTOPEN(), singleOrList(Expression()), LSTCLOSE()][1]];

  // # Lexical syntax
  const Identifier = () => {
    const isIdentStart = () => /[A-Za-z_]/.test(s.currc());
    const isIdentCont = () => /[A-Za-z0-9_]/.test(s.currc()) && s.nextc() || s.error('End');
    const identifier = isIdentStart() && zeroOrMore(isIdentCont).join("");
    Spacing();
    if (identifier) return sym(identifier);
    return s.error("Expected Identifier");
  };
  const _mkLiteral = (ch) => () => [
    s.must(ch),
    zeroOrMore(() => not(() => s.expect(ch)) && Char()),
    s.must(ch),
    Spacing(),
  ][1].join("");
  const Literal = () => s.Choice(
    _mkLiteral("'"),
    _mkLiteral('"'));
  const Class = () => {
    s.must('[');
    const cls = singleOrList(zeroOrMore(() => s.Not(() => s.expect(']')) && Range()));
    s.must(']');
    Spacing();
    return typeof cls === 'string' || isFuncAst(cls)
      ? singleOrList(cls)
      : [prim('choice'), ...cls];
  };
  const Range = () => {
    const _range = () => {
      const [left,, right] = [Char(), s.must('-'), Char()];
      return [prim('range'), left, right];
    };
    return s.Choice(_range, Char);
  };
  const Char = () => {
    if (s.match('\\')) {
      const eschr = ['n', 'r', 't', "'", '"', '[', ']', '\\'];
      const map = { n: '\n', r: '\r', t: '\t', '\\': '\\' };
      if (eschr.includes(s.currc())) {
        const n = s.match(s.currc());
        return map[n] || n;
      }
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

  const LSTOPEN    = () => s.must('{') && Spacing();
  const LSTCLOSE   = () => s.must('}') && Spacing();

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

// How lists are separated from expressions
class List extends Array {}
const lst = (l) => consp(l) ? new List(...l) : new List(l);

// CLean up predicates from parse tree
class Predicate {}
const pred = () => new Predicate();

function pegc(g) {
  const { grammar: G, start } = pegt(peg(scan(g)).Grammar());

  // Clean up remains of zeroOrMore successful match that doesn't
  // consume any input and leaves a dangling []. There's probably a
  // better way to do this.
  const cleanList = (l) => {
    if (!consp(l)) return l;
    const out = l.filter(x => x !== null);
    return out.length > 0 ? out : null;
  };
  const cl = (l) => singleOrList(cleanList(l));

  const match = (s, actionfn) => {
    const prims = {
      zeroOrMore,
      oneOrMore,
      optional,
      choice: s.Choice,
      range: s.Range,
      not: s.Not,
      and,
      list: s.list,
      any: s.any,
    };

    // How we call functions
    const thunk = (v) => () => cl(matchexpr(v));
    const call = (fn, args) => fn(...args.slice(1).map(thunk));
    const callprim = (e) => {
      const fn = V(prims, e[0].name);
      if (e[0].name === 'range') return fn(e.slice(1));
      return call(fn, e);
    };

    // If the identifier starts with an underscore (_) this not quite
    // elegant piece of code will prevent it from being captured in
    // the parse tree. That doesn't apply to the first rule though.
    const skipcapture = (s) => Symbol.keyFor(s).startsWith('_');

    // Recursive Eval
    const matchexpr = (e) => {
      if (e instanceof PrimFun) {
        return cl(V(prims, e.name)());
      } else if (consp(e) && e[0] instanceof PrimFun) {
        // This is our function. It's an array where the first item is
        // a symbol or a primitive
        return cl(callprim(e));
      } else if (consp(e)) {
        // This is an actual list
        return cl(e.map(matchexpr).filter(x => !(x instanceof Predicate)));
      } else if (typeof e === 'string') {
        return s.must(e);
      } else if (typeof e === 'symbol') {
        const output = actionfn(e, matchexpr(V(G, e)));
        return skipcapture(e) ? null : output;
      }
      throw new Error('Unreachable');
    };
    // Kickoff eval
    return actionfn(start, matchexpr(G[start]));
  };

  const run = (result, actions) => {
    const ostk = [];
    const ostkcurr  = () => ostk[ostk.length-1];
    const ostkenter = () => ostk.push([]);
    const ostkleave = () => ostk.pop();
    const ostkpush = (t) => ostkcurr().push(t);

    class L {}                  // Just a Marker for list values

    ostkenter();                // Init output stack

    const stk = [result];       // Init processing stack

    while (stk.length > 0) {
      const e = stk.pop();
      if (e === undefined)      // Semantic Action didn't return
        continue;
      else if (e === null)      // Matched without moving cursor
        continue;
      else if (typeof e === 'function')
        stk.push(e());
      else if (e.key) {
        const action = actions[e.key];
        if (action) {
          const visit = n => run(n === undefined ? e.value : n, actions);
          const options = { action: e.key, node: e.value, visit };
          stk.push(action(options));
        } else {
          stk.push(e.value);
        }
      } else if (consp(e)) {
        ostkenter();
        stk.push(new L);
        e.reverse().forEach(x => stk.push(x));
      } else if (e instanceof L)
        ostkpush(ostkleave());
      else
        ostkpush(e);
    }
    return cl(ostkleave());
  };
  // Functions for wrapping up calls to Non-Terminals
  const nameAndValueTuple = (e, v) => [Symbol.keyFor(e), v];
  const nameAndValueObject = (e, value) => ({ key: Symbol.keyFor(e), value });
  return {
    match: (s, af=nameAndValueTuple) => match(scan(s), af),
    matchl: (l, af=nameAndValueTuple) => match(scanl([l]), af),
    bind: actions => source =>
      run(match(scan(source), nameAndValueObject), actions),
    bindl: actions => source =>
      run(match(scanl([source]), nameAndValueObject), actions),
  };
}

module.exports = {
  // Errors
  MatchError,
  PredicateError,
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
  lst,
  prim,
  consp,
};
