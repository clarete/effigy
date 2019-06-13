const fs = require('fs');
const path = require('path');

const peg = require('./peg');
const py37 = require('./arch/py37');


// Operator Associativity
const leftAssocOps = [
  '+', '-', '==', '!=', '>=', '<=', '>', '<',
  '<<', '>>', '&', '|', '^',
];
const rightAssocOps = ['*', '/', '%', '**'];

// Helpers for cleaning up/simplifying AST
const join = x => peg.consp(x) && x.flat().join('') || x;
const toint = (x, b) => parseInt(join(x), b);
const multi = x => peg.consp(x) && peg.consp(x[0]);
const lift = (n, x) => peg.consp(x) && peg.consp(x[0]) ? [n, x] : x;
const rename = ([,v], n) => [n, v];

// Correct associativity for operators
const leftAssoc = (_, x) => {
  if (!multi(x)) return x;
  const [head, ...[tail]] = x;
  if (leftAssocOps.includes(tail[0]))
    return ["BinOp", [tail[0], tail[1], head]];
  return tail.reduce((t, h) => ["BinOp", [...h, t]], head);
};
function rightAssoc(_, x) {
  if (!multi(x)) return x;
  const [head, ...[tail]] = x;
  if (rightAssocOps.includes(tail[0]))
    return ["BinOp", [tail[0], head, tail[1]]];
  return tail.reduce((t, h) => {
    const [nh, ...nt] = [...h, t];
    return ["BinOp", [nh, ...nt]];
  }, head);
}

const parserActions = {
  // Minimal transformation for numbers & names
  DEC: (_, x) => toint(x, 10),
  HEX: (_, x) => toint(x, 16),
  BIN: (_, x) => toint(join(x).replace('0b', ''), 2),
  Identifier: (n, x) => [n, join(x)],
  // We'll take their value the way it is
  Expression: (_, x) => x,
  CallParams: (_, x) => x,
  PLUS: (_, x) => x,
  MINUS: (_, x) => x,
  STAR: (_, x) => x,
  SLASH: (_, x) => x,
  POWER: (_, x) => x,
  MOD: (_, x) => x,
  EQ: (_, x) => x,
  NEQ: (_, x) => x,
  LT: (_, x) => x,
  GT: (_, x) => x,
  LTE: (_, x) => x,
  GTE: (_, x) => x,
  RSHIFT: (_, x) => x,
  LSHIFT: (_, x) => x,
  BAND: (_, x) => x,
  BOR: (_, x) => x,
  BXOR: (_, x) => x,
  // Not relevant if captured single result
  Primary: lift,
  // Omit unary wrapper if it's not an unary operator
  Unary: (n, x) => {
    if (UN_OP_MAP[x[0]]) return [n, x];
    return x;
  },
  // Associativity of binary operators
  BitLogical: leftAssoc,
  BitShifting: leftAssoc,
  Comparison: leftAssoc,
  Term: leftAssoc,
  Factor: rightAssoc,
  Power: rightAssoc,
  // Attribute Access/method call
  Attribute: (n, x) => {
    if (!multi(x)) return x;
    let head, tail;
    if (multi(x[1])) { ([head, ...[tail]] = x); }
    else { ([head, ...tail] = x); }
    return [n, [head, ...tail.map(x => {
      if (x[0] === 'Identifier') return rename(x, 'LoadAttr');
      if (x[0] === 'Call') {
        if (multi(x[1]))
          x[1][0] = rename(x[1][0], "LoadMethod");
        else x[1] = rename(x[1], 'LoadMethod');
        return rename(x, 'MethodCall');
      }
      return x;
    })]];
  },
  // Fix associativity of assignment operator
  Assignment: (n, x) => {
    const [identifier, expression] = x;
    return [n, [expression, rename(identifier, "StoreName")]];
  },
};

function parse(input) {
  // 1. Parse the PEG description
  const grammar = fs.readFileSync(path.resolve('lang.peg')).toString();
  // 2. Match the PEG against source input
  return peg.pegc(grammar, parserActions).match(input);
}

const addToTable = (t, i) => {
  const pos = t.indexOf(i);
  return pos >= 0 ? pos : t.push(i)-1;
};

function dummyCompiler() {
  // Code object shape
  const code = () => ({ constants: [], names: [], instructions: [] });
  // Support for nested functions
  const stack = [];
  // Current object
  const curr = () => stack[stack.length-1];
  // Control scope
  const enter = () => stack.push(code());
  const leave = () => stack.pop();
  // -- Mutator for instructions
  const emit = (op, arg) =>
    curr().instructions.push(arg !== undefined ? [op, arg] : [op]);
  // -- Mutators for adding new items to tables
  const newConst = c => addToTable(curr().constants, c);
  const newName = c => addToTable(curr().names, c);
  // -- Basic interface for compiler
  return { emit, newConst, newName, enter, leave };
}

const UN_OP_MAP = {
  '-': 'unary-negative',
  '+': 'unary-positive',
};

const BIN_OP_MAP = {
  '**': 'binary-power',
   '%': 'binary-modulo',
   '+': 'binary-add',
   '-': 'binary-subtract',
   '*': 'binary-multiply',
   '/': 'binary-true-divide',
  '//': 'binary-floor-divide', // Currently not exposed by AST
  '<<': 'binary-lshift',
  '>>': 'binary-rshift',
   '|': 'binary-or',
   '&': 'binary-and',
   '^': 'binary-xor',
};

function translate(parseTree, flags=0, compiler=dummyCompiler()) {
  // 3. Traverse the parse tree and emit code
  const { enter, leave, emit, newConst, newName } = compiler;
  // Emitters
  const loadConst = c => {
    const newc = newConst(c);
    emit('load-const', newc);
    return newc;
  };
  const load = (n, c) => {
    const newn = newName(c);
    emit(`load-${n}`, newn);
    return newn;
  };
  const storeName = c => {
    const newn = newName(c);
    emit('store-name', newn);
    return newn;
  };
  const call = (n, c) => {
    if (peg.consp(c)) {
      const [, args] = c;
      // More than one parameter
      if (peg.consp(args) && peg.consp(args[0]))
        emit(`call-${n}`, args.length);
      // Single Param
      else emit(`call-${n}`, 1);
    } else {
      // No Params
      emit(`call-${n}`, 0);
    }
    return c;
  };
  const lambdaDef = visit => {
    enter({ co_name: '<lambda>' });
    let v;
    try { v = visit(); }
    catch (e) { leave(); throw e; }
    emit('return-value');
    loadConst(leave());
    loadConst('<lambda>');
    emit('make-function');
    return v;
  };
  const module = visit => {
    enter({ co_name: '<module>' });
    visit();
    loadConst(null);
    emit('return-value');
    return leave();
  };
  // 3.1. Prepare the translation table
  const actions = {
    Module: (_, x) => module(x),
    Identifier: (_, x) => load('name', x()[1]),
    LoadMethod: (_, x) => load('method', x()[1]),
    StoreName: (_, x) => storeName(x()[1]),
    Call: (_, x) => call('function', x()[1]),
    MethodCall: (_, x) => call('method', x()[1]),
    CallParams: (_, x) => x(),
    Number: (_, x) => loadConst(x()[1]),
    LoadAttr: (_, x) => load('attr', x()[1]),
    Atom: (_, x) => x(),
    BinOp: (_, x) => emit(BIN_OP_MAP[x()[1][0]]),
    Unary: (_, x) => emit(UN_OP_MAP[x()[1][0]]),
    Primary: (_, x) => x()[1],
    Value: (_, x) => x()[1],
    Lambda: (_, x) => lambdaDef(x),
  };
  // 3.2. Traverse parse tree with transformation grammar
  const trGrammar = fs.readFileSync(path.resolve('lang.tr')).toString();
  return peg.pegc(trGrammar, actions).matchl(parseTree, peg.delayedAction);
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
  translate,
  translateFile,
};
