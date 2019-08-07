const fs = require('fs');
const path = require('path');

const peg = require('./peg');
const py37 = require('./arch/py37');

// Helpers for cleaning up/simplifying AST
const join = x => peg.consp(x) && x.flat().join('') || x;
const toint = (x, b) => parseInt(join(x), b);
const multi = x => peg.consp(x) && peg.consp(x[0]);
const rename = ([,v], n) => [n, v];

// Correct associativity for operators
const leftAssoc = (_, v) => {
  const x = v();
  if (!multi(x)) return x;
  if (!multi(x[1])) {
    const [left, [op, right]] = x;
    return ['BinOp', left, op, right];
  } else {
    const [head, ...[tail]] = x;
    return tail.reduce((h, t) => ['BinOp', h, ...t], head);;
  }
};

// TODO: right association (for ** operator)
const rightAssoc = leftAssoc;

const tag = (n, v) => {
  const value = v();
  return value !== undefined ? [n, value] : value;
};

const parserActions = {
  // Minimal transformation for numbers & names
  DEC: (_, x) => toint(x(), 10),
  HEX: (_, x) => toint(x(), 16),
  BIN: (_, x) => toint(join(x()).replace('0b', ''), 2),
  Identifier: (n, x) => ["Load", join(x())],
  // Things we want tagged
  Module: tag,
  Code: tag,
  Statement: tag,
  Number: tag,
  Value: tag,
  Call: tag,
  Lambda: tag,
  Params: tag,
  Param: tag,
  // Just need to pop the name of the function off the `Load` node
  Function: (n, x) => {
    const value = x();
    value[0] = value[0][1];
    return [n, value];
  },
  // Rename
  Param: (_, x) => rename(x(), 'Param'),
  // Omit unary wrapper if it's not an unary operator
  Unary: (n, x) => {
    const value = x();
    if (UN_OP_MAP[value[0]]) return [n, value];
    return value;
  },
  // Associativity of binary operators
  BitLogical: leftAssoc,
  BitShifting: leftAssoc,
  Comparison: leftAssoc,
  Term: leftAssoc,
  Factor: leftAssoc,
  Power: rightAssoc,
  // Attribute Access/method call
  Attribute: (n, v) => {
    const x = v();
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
  // Move variable name after expression and add a `Store' node
  // instead of keeping the original `Identifier'.
  Assignment: (n, x) => {
    const [identifier, expression] = x();
    return [n, [expression, rename(identifier, "Store")]];
  },
  // Lexical Assignment: Rename top node to just assignment & rename
  // store instruction to storeLex
  LexAssignment: (n, x) => {
    const [identifier, expression] = x();
    return ['Assignment', [expression, rename(identifier, "StoreLex")]];
  },
};

// 1. Parse the PEG description
const compiledParserGrammar = peg
  .pegc(fs.readFileSync(path.resolve('lang.peg')).toString())
  .bind(parserActions);
function parse(input) {
  // 2. Match the PEG against source input
  return compiledParserGrammar(input);
}

const addToTable = (t, i) => {
  const pos = t.indexOf(i);
  return pos >= 0 ? pos : t.push(i)-1;
};

function dummyAssembler() {
  // Code object shape
  const code = () => ({
    constants: [],
    argcount: 0,
    nlocals: 0,
    names: [],
    varnames: [],
    freevars: [],
    cellvars: [],
    instructions: [],
  });
  // Support for nested functions
  const stack = [];
  // Current object
  const curr = () => stack[stack.length-1];
  const get = name => curr()[name];
  const set = (name, value) => curr()[name] = value;
  const attr = (name, value) =>
    value === undefined ? get(name): set(name, value);
  // Control scope
  const enter = () => stack.push(code());
  const leave = () => stack.pop();
  // -- Mutator for instructions
  const emit = (op, arg) => curr()
    .instructions
    .push(arg !== undefined ? [op, arg] : [op]);
  // -- Basic interface for assembler
  return { enter, leave, emit, attr };
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

const compiledTranslatorGrammar = peg
  .pegc(fs.readFileSync(path.resolve('lang.tr')).toString());

function translateScope(tree) {
  let i = 0;
  const map = [];
  const symstk = [];
  const newsymtable = ({ node }) => ({
    node,
    // Bookkeeping
    uses: [], defs: [], lex: [], children: [],
    // Results
    fast: [], cell: [], free: [], deref: [], globals: [],
  });

  const currstk = () => symstk[symstk.length-1];
  const entersym = node => symstk.push(newsymtable({ node }));
  const leavesym = () => symstk.pop();

  const _func = (n, x) => {
    entersym(n.toLowerCase());
    const v = x();
    const s = leavesym();
    currstk().children.push(s);
    map[i++] = s;
    v[1].unshift(["ScopeId", i-1]);
    return v;
  };
  const symActions = {
    Atom: (_, x) => x(),
    Param: (_, x) => {
      const value = x();
      addToTable(currstk().defs, value[1]);
      return value;
    },
    Store: (_, x) => {
      const value = x();
      addToTable(currstk().defs, value[1]);
      return value;
    },
    StoreLex: (_, x) => {
      const value = x();
      addToTable(currstk().defs, value[1]);
      addToTable(currstk().lex, value[1]);
      return value;
    },
    Load: (_, x) =>  {
      const value = x();
      addToTable(currstk().uses, value[1]);
      return value;
    },
    Lambda: (n, x) => _func(n, x),
    Function: (n, x) => _func(n, x),
    Attribute: (n, x) => {
      // Flatten output of + operator :/
      const v = x();
      if (!multi(v[1][1])) return [n, v[1]];
      const newl = v[1][1];
      newl.unshift(v[1][0]);
      return [n, newl];
    },
  };

  map[i++] = null;
  entersym('module');

  const g = compiledTranslatorGrammar.bindl(symActions);
  const outTree = g(tree);
  const scope = map[0] = leavesym();
  // The following code evolved from the algorithm in the Tailbiter
  // article from Darius Bacon [0] with the root variable added to
  // bookkeep globals and to accommodate the `let' modifier that marks
  // a variable as a closure so nested functions can assign to that
  // variable.
  //
  // [0] https://codewords.recurse.com/issues/seven/dragon-taming-with-tailbiter-a-bytecode-compiler#we-collate-the-variables-and-sub-scopes
  const intersection = (a, b) => a.filter(x => b.includes(x));
  const difference = (a, b) => a.filter(x => !b.includes(x));
  let root = null;
  const analyze = (node, parentDefs=[], lexDefs=[]) => {
    // Initialize list of globals
    if (!root) { root = node; root._g = root.defs.slice(); }
    const isModule = node.node === 'module';
    // Local vars, not a thing for modules
    node.fast = !isModule ? node.defs : [];
    // What to pass when analyzing children
    parentDefs = !isModule ? parentDefs.concat(node.defs) : [];
    // Go down children nodes
    node.children.map(n => analyze(n, parentDefs, lexDefs.concat(node.lex)));
    // Update list of globals available to that node
    const _g = difference(root._g, node.fast);
    if (!isModule) node.globals = difference(_g, parentDefs);
    // Read direct children's free vars
    const childUses = node.children.map(n => n.free).flat();
    const allUses = childUses.concat(node.uses);
    // All lexical vars
    const lexUses = intersection(lexDefs, node.defs);
    // collect info post traverse
    node.cell = intersection(childUses, node.defs);
    node.free = difference(intersection(allUses, difference(parentDefs, node.defs)), node.globals);
    node.deref = difference(node.cell.concat(node.free), node.globals);
    // Adjust local scope for lexic-scoped vars to work
    node.free = node.free.concat(lexUses);
    node.deref = node.deref.concat(lexUses);
  };
  analyze(scope);

  // Get rid of `List' instances so I can read the output better
  const tonat = t => {
    if (!Array.isArray(t)) return t;
    return Array.from(t).map(tonat);
  };
  return [map, tonat(outTree)];
}

function translate(tree, flags=0, assembler=dummyAssembler()) {
  // 3. Traverse the parse tree and emit code
  // 3.1. Traverse tree once to build the scope
  const [symtable, scopedTree] = translateScope(tree);
  // 3.2. Translation Actions
  const { enter, leave, emit, attr } = assembler;
  // -- Mutators for adding new items to tables
  const newConst = c => addToTable(attr('constants'), c);
  const newName = c => addToTable(attr('names'), c);
  const newVarName = c => addToTable(attr('varnames'), c);
  // -- Scope state management
  const scopes = [symtable[0]];
  const pushscope = s => scopes.push(symtable[s]);
  const getscope = () => scopes[scopes.length-1];
  const popscope = () => scopes.pop();
  // -- Emit instructions for accessing variables
  const loadConst = c => {
    const newc = newConst(c);
    emit('load-const', newc);
    return newc;
  };
  const load = c => {
    const scope = getscope();
    if (scope.deref.includes(c)) {
      emit(`load-deref`, scope.deref.indexOf(c));
    } else if (scope.fast.includes(c)) {
      emit('load-fast', newVarName(c));
    } else if (scope.globals.includes(c)) {
      emit('load-global', newName(c));
    } else
      emit('load-name', newName(c));
    return true;
  };
  const store = c => {
    const scope = getscope();
    if (scope.deref.includes(c))
      emit(`store-deref`, scope.deref.indexOf(c));
    else if (scope.fast.includes(c))
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
  // -- Emit instructions for more involved operations
  const call = (n, c) => {
    const [_, [, { val, len }]] = c;
    emit(`call-${n}`, len);
    // Must return something truthy to avoid changing shape of subtree
    // needed by `BinOp' as a parent node
    return val || true;
  };
  const scopeId = (visit) => {
    const value = visit();
    pushscope(value[1]);
    return value;
  };
  const func = (n, visit) => {
    enter({ co_name: '<lambda>' });
    const v = visit();
    const isAnon = n === 'Lambda';
    // Slightly different tree shape for lambdas & functions
    const name = isAnon ? '<lambda>' : v[1][1];
    const argcount = isAnon ? v[1][1].len : v[1][2].len;
    // Need to acquire the scope & update tables before popping the
    // current code object
    const scope = getscope();
    scope.free.forEach(x => addToTable(attr('freevars'), x));
    scope.cell.forEach(x => addToTable(attr('cellvars'), x));
    // Update argument count
    attr('argcount', argcount);
    // Update number of local variables
    attr('nlocals', attr('varnames').length);
    // End the function
    emit('return-value');
    const code = leave();
    popscope();
    // Update flag if it's a closure
    let flags = 0;
    if (scope.free.length > 0) flags |= 0x08;
    // Generate tuple of closure values
    const isModule = getscope().node === 'module';
    if (scope.free.length > 0 && !isModule) {
      scope.free.map(v => emit('load-closure', scope.deref.indexOf(v)));
      emit('build-tuple', scope.free.length);
    }
    loadConst(code);
    loadConst(name);
    emit('make-function', flags);
    if (!isAnon) store(name);
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
    ScopeId: (_, x, s) => scopeId(x, s),
    Load: (_, x) => { const v = x(); load(v[1]); return v; },
    LoadMethod: (_, x) => loadMethod(x()[1]),
    Store: (_, x) => { const v = x(); store(v[1]); return v; },
    StoreLex: (_, x) => { const v = x(); store(v[1]); return v; },

    // Call Site Rule application
    Call: (_, x) => call('function', x()),
    MethodCall: (_, x) => call('method', x()),
    CallPMult: (_, x) => { const val = x(); return { val, len: val.length }; },
    CallPOne: (_, x) => ({ val: x(), len: 1 }),
    CallPNone: (_, x) => ({ val: x(), len: 0 }),

    // Parameter Rule application
    Param: (_, x) => newVarName(x()[1]),
    ParamsMult: (_, x) => { const val = x(); return { val, len: val.length }; },
    ParamsOne: (_, x) => ({ val: x(), len: 1 }),
    ParamsNone: (_, x) => ({ val: x(), len: 0 }),

    // Callable Definition
    Lambda: (n, x) => func(n, x),
    Function: (n, x) => func(n, x),

    // Values & Expressions
    Number: (_, x) => loadConst(x()[1]),
    LoadAttr: (_, x) => loadAttr(x()[1]),
    BinOp: (_, x) => {
      const value = x();
      emit(BIN_OP_MAP[value[2]]);
      return value;
    },
    Unary: (_, x) => emit(UN_OP_MAP[x()[1][0]]),
  };
  // 3.2. Traverse parse tree with transformation grammar
  const g = compiledTranslatorGrammar.bindl(actions);
  return g(scopedTree);
}

function translateFile(filename) {
  const file = path.resolve(filename);
  const input = fs.readFileSync(file).toString();

  const tree = parse(input);
  const code = translate(tree, 0, py37.assembler(path.basename(file)));

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
  const fileNameFinal = path.join(path.dirname(file), fileNameOutput);
  fs.writeFileSync(fileNameFinal, buffer, 'binary');
}

module.exports = {
  parse,
  translate,
  translateScope,
  translateFile,
};
