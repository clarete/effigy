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
  [sym('Identifier')]: (_, x) => join(x),
  [sym('CallParams')]: (_, x) => x,
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
  const module = { constants: [], names: [], code };
  // 3. Traverse the parse tree and emit code
  // 3.1. Prepare the translation table
  const unwrap = (_, x) => x[1];

  const _const = c => {
    const pos = module.constants.indexOf(c);
    return pos >= 0 || module.constants.push(c)-1;
  };

  const loadName = c => {
    const pos = module.names.indexOf(c);
    return pos >= 0 || module.names.push(c)-1;
  };

  // Emitters

  const funCall = c => {
    code.push(['load-name', loadName(c)]);
    code.push(['call-function', 0]);
  };

  const loadConst = c => {
    code.push(['load-const', _const(c)]);
  };

  const finishModule = () => {
    code.push(['pop-top']);
    loadConst(null);
    code.push(['return-value']);
  };

  const actions = {
    [sym('Module')]: finishModule,
    [sym('Code')]: unwrap,
    [sym('Expression')]: unwrap,
    [sym('Term')]: unwrap,
    [sym('Factor')]: unwrap,
    [sym('Power')]: unwrap,
    [sym('Unary')]: unwrap,
    [sym('Primary')]: unwrap,
    [sym('Value')]: unwrap,
    [sym('Identifier')]: unwrap,
    [sym('FunCall')]: (_, x) => funCall(x[1]),
    [sym('Number')]: (_, x) => loadConst(x[1]),
    [sym('Atom')]: (_, x) => x,
  };
  // 3.2. Traversal
  // 3.2.1. Parse the PEG description
  const grammar = fs.readFileSync(path.resolve('lang.tr')).toString();
  // 3.2.2. Match the PEG against the input parse
  peg.pegc(grammar, actions).matchl(parseTree);

  // 3.3. Return the module object with the list of generated op codes
  // and tables
  return module;
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
