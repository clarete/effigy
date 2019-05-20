const fs = require('fs');
const path = require('path');

const peg = require('./peg');
const py37 = require('./arch/py37');

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

const addToTable = (t, i) => {
  const pos = t.indexOf(i);
  return pos >= 0 ? pos : t.push(i)-1;
};

function dummyCompiler() {
  // Data structures
  const instructions = [];
  const code = { constants: [], names: [], instructions };
  // -- Accessor & Mutator for instructions
  const output = () => code;
  const emit = (op, arg) =>
    instructions.push(arg !== undefined ? [op, arg] : [op]);
  // -- Mutators for adding new items to tables
  const newConst = c => addToTable(code.constants, c);
  const newName = c => addToTable(code.names, c);
  // -- Basic interface for compiler
  return { emit, newConst, newName, output };
}

function translate(parseTree, flags=0, compiler=dummyCompiler()) {
  // 3. Traverse the parse tree and emit code
  // 3.1. Prepare the translation table
  const unwrap = (_, x) => x[1];
  const { emit, newConst, newName, output } = compiler;
  // Emitters
  const loadConst = c => {
    const newc = newConst(c);
    emit('load-const', newc);
    return newc;
  };
  const loadName = c => {
    const newn = newName(c);
    emit('load-name', newn);
    return newn;
  };
  const funCall = c => {
    if (peg.consp(c)) {
      const [name, args] = c;
      loadName(name);
      if (peg.consp(args)) {    // More than one parameter
        for (const i of args) loadConst(i);
        emit('call-function', args.length);
      } else {                  // Single parameter
        loadConst(args);
        emit('call-function', 1);
      }
    } else {                    // No parameters
      loadName(c);
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
  return output();
}

function translateFile(filename) {
  const file = path.resolve(filename);
  const input = fs.readFileSync(file).toString();

  const tree = parse(input);
  const code = translate(tree, 0, py37.compiler(file));

  // Read modification time of the source file
  const stats = fs.statSync(file);
  const mtime = new Date(stats.mtime/1000);

  // Machinery to move the offset of the output buffer forward
  const b = Buffer.alloc(py37.HEADER_SIZE + 160, 0, 'binary');
  let bufferOffset = 0;
  const offset = step => (bufferOffset += step) - step;

  // Run the things
  py37.header(b, offset, mtime, b.length);
  py37.code(code, b, offset);

  // Output to a file
  const fileNameNoExt = path.basename(file, path.extname(file));
  const fileNameOutput = `${fileNameNoExt}.pyc`;
  fs.writeFileSync(fileNameOutput, b, 'binary');
}

module.exports = {
  parse,
  traverse,
  translate,
  translateFile,
};
