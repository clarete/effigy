const fs = require('fs');
const path = require('path');

const peg = require('./peg');
const py37 = require('./arch/py37');

const join = x => Array.isArray(x) && x.flat().join('') || x;
const toint = (x, b) => parseInt(join(x), b);
const lift = (n, x) => (peg.consp(x) && peg.consp(x[0]))
  ? [n, x]
  : x;

const parserActions = {
  DEC: (_, x) => toint(x, 10),
  HEX: (_, x) => toint(x, 16),
  BIN: (_, x) => toint(join(x).replace('0b', ''), 2),
  Identifier: (n, x) => [n, join(x)],
  CallParams: (_, x) => x,

  Comparison: lift,
  Term: lift,
  Factor: lift,
  Power: lift,
  Unary: lift,
  Primary: lift,
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
  const module = () => {
    emit('pop-top');
    loadConst(null);
    emit('return-value');
  };

  const actions = {
    Module: (_, x) => module(),
    Assignment: (_, x) => assignment(x[1]),
    FunParams: (_, x) => x,
    FunCall: (_, x) => funCall(x[1]),
    Number: (_, x) => loadConst(x[1]),
    Atom: (_, x) => x,

    Code: unwrap,
    Expression: unwrap,
    Primary: unwrap,
    Value: unwrap,
    Identifier: unwrap,
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
  const code = translate(tree, 0, py37.compiler(path.basename(file)));

  // Read modification time of the source file
  const stats = fs.statSync(file);
  const mtime = new Date(stats.mtime/1000);

  // Machinery to move the offset of the output buffer forward
  let buffer = Buffer.alloc(py37.HEADER_SIZE, 0, 'binary');
  let bufferOffset = 0;
  // Ensure buffer size
  const offset = step => {
    const nextSize = bufferOffset += step;
    if (nextSize > buffer.byteLength)
      buffer = Buffer.concat([buffer, Buffer.alloc(step)], nextSize);
    return nextSize - step;
  };
  // Because the `buffer' variable is reassigned in this scope
  const write = (o, f) => { const of = offset(o); f(buffer, of); };

  // Run the things
  py37.header(mtime, code.length, write);
  py37.code(code, write);

  // Output to a file
  const fileNameNoExt = path.basename(file, path.extname(file));
  const fileNameOutput = `${fileNameNoExt}.pyc`;
  fs.writeFileSync(fileNameOutput, buffer, 'binary');
}

module.exports = {
  parse,
  traverse,
  translate,
  translateFile,
};
