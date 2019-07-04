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
  Identifier: (n, x) => ["Load", join(x)],
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
  Params: (n, x) => {
    // Don't allow returning [Params, null]
    if (!multi(x) && x === null) return [n];
    return [n, x];
  },
  // Rename
  Param: (_, x) => rename(x, 'Param'),
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
      if (x[0] === 'Load') return rename(x, 'LoadAttr');
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
    return [n, [expression, rename(identifier, "Store")]];
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
  const code = () => ({
    constants: [],
    names: [],
    varnames: [],
    freevars: [],
    instructions: [],
  });
  // Support for nested functions
  const stack = [];
  // Current object
  const curr = () => stack[stack.length-1];
  const attr = name => curr()[name];
  // Control scope
  const enter = () => stack.push(code());
  const leave = () => stack.pop();
  // -- Mutator for instructions
  const emit = (op, arg) => curr()
    .instructions
    .push(arg !== undefined ? [op, arg] : [op]);
  // -- WAT
  const backtrack = (f) => {
    const copy = curr().instructions.slice();
    try { return f(); }
    catch (e) { curr().instructions = copy; throw e; }
  };
  // -- Basic interface for compiler
  return { enter, leave, emit, attr, backtrack };
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

function translateScope(tree, trGrammar) {
  if (!trGrammar)               // for tests
    trGrammar = fs.readFileSync(path.resolve('lang.tr')).toString();

  let i = 0;
  const map = [];
  const symstk = [];
  const newsymtable = ({ node }) => ({
    node,
    // Bookkeeping
    uses: [], defs: [], children: [],
    // Results
    fast: [], cell: [], free: [], deref: [], globals: [],
  });

  const currstk = () => symstk[symstk.length-1];
  const entersym = node => symstk.push(newsymtable({ node }));
  const leavesym = () => symstk.pop();

  const symActions = {
    Atom: (_, x) => x(),
    Param: (_, x) => {
      const v0 = x();
      const v = v0[1];
      addToTable(currstk().defs, v);
      return v0;
    },
    Store: (_, x) => {
      const value = x();
      addToTable(currstk().defs, value[1]);
      return value;
    },
    Load: (_, x) =>  {
      const value = x();
      addToTable(currstk().uses, value[1]);
      return value;
    },
    Lambda: (_, x) => {
      entersym('lambda');
      let v;
      try { v = x(); }
      catch (e) { leavesym(); throw e; }
      const s = leavesym();
      currstk().children.push(s);
      map[i++] = s;
      v[1].unshift(["ScopeId", i-1]);
      return v;
      // return rename(v, "ScopeLambda");
    },
    Attribute: (n, x) => {
      const v = x();
      if (!multi(v[1][1])) return [n, v[1]];
      const newl = v[1][1];
      newl.unshift(v[1][0]);
      return [n, newl];
    },
  };

  map[i++] = null;
  entersym('module');
  const outTree = peg.pegc(trGrammar, symActions).matchl(tree, peg.delayedAction0);
  const scope = map[0] = leavesym();

  const intersection = (a, b) => a.filter(x => b.indexOf(x) >= 0);
  let root = null;
  const analyze = (node, parentDefs=[]) => {
    if (!root) { root = node; root.globals = []; }
    else { node.globals = root.defs.filter(x => parentDefs.indexOf(x) === -1); }
    // Go down children nodes
    const allFree = [];
    node.fast = node.node === 'lambda' ? node.defs : [];
    node.children.map(n => analyze(n, parentDefs.concat(n.fast)));
    node.children.map(n => allFree.concat(n.free));
    const allUses = allFree.concat(node.uses);
    // collect info post traverse
    node.cell = intersection(allFree, node.fast);
    node.free = intersection(allUses, parentDefs.filter(x => node.fast.indexOf(x) === -1));
    node.deref = node.cell.concat(node.free);
  };
  analyze(scope);

  const tonat = t => {
    if (!Array.isArray(t)) return t;
    return Array.from(t).map(tonat);
  };
  return [map, tonat(outTree)];
}

function translate(tree, flags=0, compiler=dummyCompiler()) {
  // 3. Traverse the parse tree and emit code
  const trGrammar = fs.readFileSync(path.resolve('lang.tr')).toString();
  // 3.1. Traverse tree once to build the scope
  const [symtable, scopedTree] = translateScope(tree, trGrammar);
  // 3.2. Translation Actions
  const { enter, leave, backtrack, attr, emit } = compiler;
  // -- Mutators for adding new items to tables
  const newConst = c => addToTable(attr('constants'), c);
  const newName = c => addToTable(attr('names'), c);
  const newVarName = c => addToTable(attr('varnames'), c);

  const loadConst = c => {
    const newc = newConst(c);
    emit('load-const', newc);
    return newc;
  };

  const load = c => {
    const scope = getscope();
    if (scope.deref.indexOf(c) !== -1) {
      addToTable(attr('freevars'), c);
      emit(`load-deref`, scope.deref.indexOf(c));
    } else if (scope.fast.indexOf(c) !== -1) {
      emit('load-fast', newVarName(c));
    } else if (scope.globals.indexOf(c) !== -1) {
      emit('load-global', newName(c));
    } else
      emit('load-name', newName(c));
    return true;
  };
  const store = c => {
    const scope = getscope();
    if (scope.fast.indexOf(c) !== -1)
      emit('store-fast', newVarName(c));
    else
      emit('store-name', newName(c));
    return true;
  };

  const loadAttr = (c) => {
    const newn = newName(c);
    emit(`load-attr`, newn);
    return newn;
  };
  const loadMethod = c => {
    const newn = newName(c);
    emit(`load-method`, newn);
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

  const scopes = [symtable[0]];
  const pushscope = s => {
    if (!symtable[s]) throw new Error('No such scope id', s);
    return scopes.push(symtable[s]);
  };
  const getscope = () => scopes[scopes.length-1];
  const popscope = () => scopes.pop();

  const scopeId = (visit) => {
    const value = visit();
    pushscope(value[1]);
    return value;
  };

  const lambdaDef = visit => {
    enter({ co_name: '<lambda>' });
    let v;
    try { v = visit(); }
    catch (e) { leave(); throw e; }
    popscope();
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
  const actions = {
    Module: (_, x) => module(x),
    Expression: (n, x) => [n, backtrack(x)],
    // Scope: (_, x, s) => scope(x, s),
    ScopeId: (_, x, s) => scopeId(x, s),
    Param: (_, x) => newVarName(x()[1]),
    Load: (_, x) => load(x()[1]),
    LoadMethod: (_, x) => loadMethod(x()[1]),
    Store: (_, x) => store(x()[1]),
    Call: (_, x) => call('function', x()[1]),
    MethodCall: (_, x) => call('method', x()[1]),
    CallParams: (_, x) => x(),
    Lambda: (_, x, s) => lambdaDef(x, s),
    Number: (_, x) => loadConst(x()[1]),
    LoadAttr: (_, x) => loadAttr(x()[1]),
    Atom: (_, x) => x(),
    BinOp: (_, x) => emit(BIN_OP_MAP[x()[1][0]]),
    Unary: (_, x) => emit(UN_OP_MAP[x()[1][0]]),
    Primary: (_, x) => x()[1], // backtrack(() => x()[1]),
    Value: (_, x) => x()[1],
  };
  // 3.2. Traverse parse tree with transformation grammar
  return peg.pegc(trGrammar, actions).matchl(scopedTree, peg.delayedAction0);
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
  translateScope,
  translateFile,
};
