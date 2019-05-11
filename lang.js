const fs = require('fs');
const path = require('path');
const peg = require('./peg');

const { sym } = peg;

const join = (x) => Array.isArray(x) && x.flat().join('') || x;
const toint = (x, b) => parseInt(join(x), b);
const single = (s, x) => x.length === 2 ? x[1] : [s, x];
const actions = {
  [sym('DEC')]: (_, x) => toint(x, 10),
  [sym('HEX')]: (_, x) => toint(x, 16),
  [sym('BIN')]: (_, x) => toint(join(x).replace('0b', ''), 2),
  [sym('Identifier')]: (s, x) => [s, join(x)],
};

function parse(input) {
  // 1. Parse the PEG description
  const grammar = fs.readFileSync(path.resolve('lang.peg')).toString();
  // 2. Match the PEG against source input
  return peg.pegc(grammar, actions).match(input);
}

function translate(source, flags) {
  // Data structures
  const code = [];
  const constantsTable = {};
  const namesTable = {};
  // Helpers
  const emit = (op, arg) => code.push({ op, arg });
  const newId = (t, v) => (t[Object.keys(t).length] = v) &&
    Object.keys(t).length - 1;
  // Prepare the translation table
  const tvisit = {};
  // 3. Traverse the parse tree and emit code
  const visit = (n) => {
    if (!Array.isArray(n)) return n;
    const [s, e] = n;
    if (Array.isArray(s))
      return s.map(visit).concat([e.map(visit)]);
    const t = tvisit[s];
    return t ? t(e) : visit(e);
  };
  return visit(source);
}

function translateFile(file, flags) {
  const arch = require(path.resolve(path.join("arch", flags.arch)));
  const code = arch(file);
  code.emitInt();
  code.emitModule();
}

module.exports = {
  parse,
  translate,
  translateFile,
};
