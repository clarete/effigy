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

function translate(parseTree, flags=0) {
  // Data structures
  const code = [];
  const module = { constants: [], names: [], code: [] };
  // 3. Traverse the parse tree and emit code
  // 3.1. Prepare the translation table
  const unwrap = (_, x) => x[1];

  const loadConst = c => {
    const pos = module.constants.indexOf(c);
    return pos >= 0 || module.constants.push(c)-1;
  };

  const returnFromModule = c => [c].concat([
    ['pop-top'],
    ['load-const', loadConst(null)],
    ['return-value'],
  ]);

  const actions = {
    [sym('Module')]: (_, x) => ({ ...module, code: returnFromModule(x[1]) }),
    [sym('Code')]: unwrap,
    [sym('Expression')]: unwrap,
    [sym('Term')]: unwrap,
    [sym('Factor')]: unwrap,
    [sym('Power')]: unwrap,
    [sym('Unary')]: unwrap,
    [sym('Primary')]: unwrap,
    [sym('Value')]: unwrap,
    [sym('Number')]: (_, x) => ['load-const', loadConst(x[1])],
    [sym('Atom')]: (_, x) => x,
  };
  // 3.2. Traversal
  // 3.2.1. Parse the PEG description
  const grammar = fs.readFileSync(path.resolve('lang.tr')).toString();
  // 3.2.2. Match the PEG against the input parse
  return peg.pegc(grammar, actions).matchl(parseTree);
}

function translateFile(file, flags) {
  const arch = require(path.resolve(path.join("arch", flags.arch)));
  const code = arch.asm(file);
  code.emitInt();
  code.emitModule();
}

module.exports = {
  parse,
  translate,
  translateFile,
};
