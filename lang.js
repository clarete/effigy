const fs = require('fs');
const path = require('path');
const peg = require('./peg');

const { sym } = peg;

const join = (x) => Array.isArray(x) && x.flat().join('') || x;
const toint = (x, b) => parseInt(join(x), b);
const single = (s, x) => x.length === 2 ? x[1] : [s, x];
const parserActions = {
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
  return peg.pegc(grammar, parserActions).match(input);
}

function traverse(tree, actions) {
  // 1. Parse the PEG description
  const grammar = fs.readFileSync(path.resolve('lang.tr')).toString();
  // 2. Match the PEG against the input parse
  return peg.pegc(grammar, actions).matchl(tree);
}

function translate(parseTree, flags=0) {
  // Data structures
  const instructions = [];
  const code = { constants: [], names: [], instructions };
  // 3. Traverse the parse tree and emit code
  // 3.1. Prepare the translation table
  const unwrap = (_, x) => x[1];
  const emit = (op, arg) =>
    instructions.push(arg !== undefined ? [op, arg] : [op]);
  // -- helpers for adding new items to tables
  const newConst = c => addToTable(code.constants, c);
  const newName = c => addToTable(code.names, c);
  const addToTable = (t, i) => {
    const pos = t.indexOf(i);
    return pos >= 0 ? pos : t.push(i)-1;
  };

  // Emitters
  const loadConst = c => {
    const newc = newConst(c);
    emit('load-const', newc);
    return newc;
  };

  const funCall = c => {
    if (peg.consp(c)) {
      const [name, args] = c;
      emit('load-name', newName(name));
      if (peg.consp(args)) {
        // More than one parameter
        for (const i of args) loadConst(i);
        emit('call-function', args.length);
      } else {
        // Single parameter
        loadConst(args);
        emit('call-function', 1);
      }
    } else {
      // No parameters
      emit('load-name', newName(c));
      emit('call-function', 0);
    }
  };

  const finishModule = () => {
    emit('pop-top');
    loadConst(null);
    emit('return-value');
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
    [sym('FunParams')]: (_, x) => x,
    [sym('Identifier')]: unwrap,
    [sym('FunCall')]: (_, x) => funCall(x[1]),
    [sym('Number')]: (_, x) => x[1],
    [sym('Atom')]: (_, x) => x,
  };

  // 3.2. Traversal
  traverse(parseTree, actions);
  // 3.3. Return code object with list of generated opcodes and
  // value tables
  return code;
}

function translateFile(file, flags) {
  const arch = require(path.resolve(path.join("arch", flags.arch)));
  const code = arch.asm(file);
  code.emitInt();
  code.emitModule();
}

module.exports = {
  parse,
  traverse,
  translate,
  translateFile,
};
