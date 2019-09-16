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
const leftAssocF = (name='BinOp') => ({ visit }) => {
  const x = visit();
  if (!multi(x)) return x;
  if (!multi(x[1])) {
    const [left, [op, right]] = x;
    return [name, left, op, right];
  } else {
    const [head, ...[tail]] = x;
    return tail.reduce((h, t) => [name, h, ...t], head);;
  }
};

const leftAssoc = leftAssocF('BinOp');

// TODO: right association (for ** operator)
const rightAssoc = leftAssoc;

const tag = ({ visit, action }) => {
  const value = visit();
  return value !== undefined ? [action, value] : value;
};

const lift = ({ visit, action }) => {
  const value = visit();
  if (value === undefined) return value;
  else if (!multi(value)) return value;
  else return [action, value];
};

const trOne = ({ visit }) => [visit()];
const trMult = ({ visit }) => {
  const value = visit();
  return (multi(value[1]))
    ? [value[0]].concat(value[1])
    : value;
};

const parserActions = {
  // Minimal transformation for numbers & names
  DEC: ({ visit }) => toint(visit(), 10),
  HEX: ({ visit }) => toint(visit(), 16),
  BIN: ({ visit }) => toint(join(visit()).replace('0b', ''), 2),
  Identifier: ({ visit }) => ["Load", join(visit())],
  Store: ({ visit, action }) => [action, join(visit()[1])],
  String: ({ visit, action }) => [action, join(visit())],
  // Discard if single child
  Logical: lift,
  // Things we want tagged
  Module: tag,
  Code: tag,
  Statement: tag,
  IfStm: tag,
  WhileStm: tag,
  TryStm: tag,
  CatchStm: tag,
  ThrowStm: tag,
  ReturnStm: tag,
  Number: tag,
  BOOL: tag,
  Value: tag,
  Call: tag,
  Lambda: tag,
  // List Values
  List: tag,
  ListOne: trOne,
  ListMult: trMult,
  // Parameters
  Param: tag,
  Params: tag,
  ParamsOne: trOne,
  ParamsMult: trMult,
  // Just need to pop the name of the function off the `Load` node
  Function: ({ visit, action }) => {
    const value = visit();
    value[0] = value[0][1];
    return [action, value];
  },
  // Rename
  Param: ({ visit }) => rename(visit(), 'Param'),
  // Omit unary wrapper if it's not an unary operator
  Unary: ({ visit, action }) => {
    const value = visit();
    if (UN_OP_MAP[value[0]]) return [action, value];
    return value;
  },
  // Associativity of binary operators
  Comparison: leftAssocF('Comparison'),
  BitLogical: leftAssoc,
  BitShifting: leftAssoc,
  Term: leftAssoc,
  Factor: leftAssoc,
  Power: rightAssoc,
  // Attribute Access/method call
  Attribute: ({ visit, action }) => {
    const x = visit();
    if (!multi(x)) return x;
    let head, tail;
    if (multi(x[1])) { ([head, ...[tail]] = x); }
    else { ([head, ...tail] = x); }
    return [action, [head, ...tail.map(x => {
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
  Assignment: ({ visit, action }) => {
    const [identifier, expression] = visit();
    return [action, [expression, rename(identifier, "Store")]];
  },
  // Lexical Assignment: Rename top node to just assignment & rename
  // store instruction to storeLex
  LexAssignment: ({ visit, action }) => {
    const [identifier, expression] = visit();
    return ['Assignment', [expression, rename(identifier, "StoreLex")]];
  },
};

const localfile = f => fs.readFileSync(path.join(__dirname, f)).toString();

// 1. Parse the PEG description
const compiledParserGrammar = peg
  .pegc(localfile('lang.peg'))
  .bind(parserActions);
function parse(input) {
  // 2. Match the PEG against source input
  return compiledParserGrammar(input);
}

const addToTable = (t, i) => {
  const pos = t.indexOf(i);
  return pos >= 0 ? pos : t.push(i)-1;
};

// Code object shape for dummyAssembler. Only exported as public
// because it's useful for tests.
const coObj = (override={}) => ({
  constants: [],
  argcount: 0,
  nlocals: 0,
  names: [],
  varnames: [],
  freevars: [],
  cellvars: [],
  instructions: [],
  ...override,
});

function dummyAssembler() {
  // Support for nested functions
  const stack = [];
  // Current object
  const curr = () => stack[stack.length-1];
  const get = name => curr()[name];
  const set = (name, value) => curr()[name] = value;
  const attr = (name, value) =>
    value === undefined ? get(name): set(name, value);
  // Control scope
  const enter = () => stack.push(coObj());
  const leave = () => stack.pop();
  // -- Mutator for instructions
  const emit = (op, arg) => curr()
    .instructions
    .push(arg !== undefined ? [op, arg] : [op]);
  // -- Save labels and patch'em back
  const labels = [];
  const ref = () => { labels.push(pos()); return labels.length-1; };
  const pos = () => curr().instructions.length;
  const fix = (l, p) => curr().instructions[labels[l]][1] = p;
  // -- Basic interface for assembler
  return { enter, leave, emit, attr, ref, pos, fix };
}

const UN_OP_MAP = {
  '-': 'unary-negative',
  '+': 'unary-positive',
  'not': 'unary-not',
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

const CMP_OP_MAP = {
  '<':  0,
  '<=': 1,
  '==': 2,
  '!=': 3,
  '>':  4,
  '>=': 5,
};

const compiledTranslatorGrammar = peg.pegc(localfile('lang.tr'));

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

  const _func = ({ visit, action }) => {
    entersym(action.toLowerCase());
    const v = visit();
    const s = leavesym();
    currstk().children.push(s);
    map[i++] = s;
    v[1].unshift(["ScopeId", i-1]);
    return v;
  };
  const symActions = {
    Param: ({ visit }) => {
      const value = visit();
      addToTable(currstk().defs, value[1]);
      return value;
    },
    Store: ({ visit }) => {
      const value = visit();
      addToTable(currstk().defs, value[1]);
      return value;
    },
    StoreLex: ({ visit }) => {
      const value = visit();
      addToTable(currstk().defs, value[1]);
      addToTable(currstk().lex, value[1]);
      return value;
    },
    Load: ({ visit }) =>  {
      const value = visit();
      addToTable(currstk().uses, value[1]);
      return value;
    },
    Lambda: ({ visit, action }) => _func({ visit, action }),
    Function: ({ visit, action }) => _func({ visit, action }),
    Attribute: ({ visit, action }) => {
      // Flatten output of + operator :/
      const v = visit();
      if (!multi(v[1][1])) return [action, v[1]];
      const newl = v[1][1];
      newl.unshift(v[1][0]);
      return [action, newl];
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
  const { enter, leave, emit, attr, ref, pos, fix } = assembler;
  // -- Mutators for adding new items to tables
  const newConst = c => addToTable(attr('constants'), c);
  const newName = c => addToTable(attr('names'), c);
  const newVarName = c => addToTable(attr('varnames'), c);
  // -- Scope state management
  const scopes = [symtable[0]];
  const pushscope = s => scopes.push(symtable[s]);
  const getscope = () => scopes[scopes.length-1];
  const popscope = () => scopes.pop();
  // -- Labels
  const fixsize = (l, p) => fix(l, p * 2);
  const fixjabs = label => fixsize(label, pos());
  const fixjrel = (label, start) => fixsize(label, Math.abs(pos() - start));
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
  const del = c => {
    const scope = getscope();
    if (scope.deref.includes(c))
      emit(`delete-deref`, scope.deref.indexOf(c));
    else if (scope.fast.includes(c))
      emit('delete-fast', newVarName(c));
    else
      emit('delete-name', newName(c));
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
  const list = value => {
    const items = value[1] ? value[1].length : 0;
    emit('build-list', items);
    return value;
  };
  const call = (n, c) => {
    const length = c[1][1] ? c[1][1].length : 0;
    emit(`call-${n}`, length);
    return c;
  };
  const scopeId = (visit) => {
    const value = visit();
    pushscope(value[1]);
    return value;
  };
  const func = (n, visit) => {
    enter({});
    const v = visit();
    const isAnon = n === 'Lambda';
    // Slightly different tree shape for lambdas & functions
    const name = isAnon ? '<lambda>' : v[1][1];
    const paramsNode = isAnon ? v[1][1][1] : v[1][2][1];
    const argcount = paramsNode ? paramsNode.length : 0;

    // Need to acquire the scope & update tables before popping the
    // current code object
    const scope = getscope();
    scope.free.forEach(x => addToTable(attr('freevars'), x));
    scope.cell.forEach(x => addToTable(attr('cellvars'), x));
    attr('name', name);
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
    Module: ({ visit }) => module(visit),
    ScopeId: ({ visit }) => scopeId(visit),
    Load: ({ visit }) => { const v = visit(); load(v[1]); return v; },
    LoadMethod: ({ visit }) => loadMethod(visit()[1]),
    Store: ({ visit }) => { const v = visit(); store(v[1]); return v; },
    StoreLex: ({ visit }) => { const v = visit(); store(v[1]); return v; },
    Break: ({ visit }) => { emit('break-loop'); return visit(); },

    // Call Site Rule application
    Call: ({ visit }) => call('function', visit()),
    MethodCall: ({ visit }) => call('method', visit()),

    // Parameter Rule application
    Param: ({ visit }) => newVarName(visit()[1]),

    // Callable Definition
    Lambda: ({ visit, action }) => func(action, visit),
    Function: ({ visit, action }) => func(action, visit),
    ReturnStm: ({ visit, node }) => {
      const value = visit();
      emit('return-value');
      return value;
    },

    // Values & Expressions
    Number: ({ visit }) => loadConst(visit()[1]),
    String: ({ visit }) => loadConst(visit()[1]),
    Boolean: ({ visit }) => loadConst({ true: true, false: false }[visit()[1]]),
    Null: ({ visit }) => loadConst(null) && visit(),
    List: ({ visit }) => list(visit()),

    // Statements
    IfStm: ({ visit, node }) => {
      const [test, body, elsestm] = node[1];
      visit(test.value);        // Visit the test expression
      const lb0 = ref();
      emit('pop-jump-if-false', lb0);
      visit(body.value);        // Visit the body of the statement
      if (elsestm) {
        const lb1 = ref();
        emit('jump-forward', lb1);
        const savedPos = pos();
        fixjabs(lb0);
        visit(elsestm.value);   // Visit the body of `else' branche
        fixjrel(lb1, savedPos);
      } else {
        fixjabs(lb0);
      }
      return true;
    },
    WhileStm: ({ visit, node }) => {
      const [test, body] = node[1];
      const setupLabel = ref();
      emit('setup-loop', setupLabel);
      const loopStart = pos();
      visit(test.value);
      const testLabel = ref();
      emit('pop-jump-if-false', testLabel);
      visit(body.value);
      const jumpLabel = ref();
      emit('jump-absolute', jumpLabel);
      emit('pop-block');

      fixjabs(testLabel);
      fixsize(jumpLabel, loopStart);
      fixjrel(setupLabel, loopStart);
      return true;
    },
    ThrowStm: ({ visit, node }) => {
      const value = visit();
      emit('raise-varargs', 1);
      return value;
    },
    TryStm: ({ visit, node }) => {
      const [code, catchstm] = node[1];
      const labelSetup = ref();
      const exceptStart = pos();
      emit('setup-except', labelSetup);
      visit(code);
      emit('pop-block');
      fixjrel(labelSetup, exceptStart);
      const labelfwd0 = ref();
      emit('jump-forward', labelfwd0);
      const fwd0start = pos();

      // -- The Exception Block --
      const [excType, excName, excCode] = catchstm.value[1];
      emit('dup-top');
      visit(excType);
      emit('compare-op', 10);
      const labelexc = ref();
      emit('pop-jump-if-false', labelexc);
      emit('pop-top');
      visit(excName);
      emit('pop-top');
      const fincatchpos = pos();
      const labelfincatch = ref();
      emit('setup-finally', labelfincatch);
      visit(excCode);
      emit('pop-block');
      fixjrel(labelfincatch, fincatchpos);
      loadConst(null);
      loadConst(null);
      store(excName.value[0].value);
      del(excName.value[0].value);
      emit('end-finally');
      emit('pop-except');
      const labelfwd1 = ref();
      emit('jump-forward', labelfwd1);
      const fwd1start = pos();
      fixjabs(labelexc);
      emit('end-finally');
      fixjrel(labelfwd0, fwd0start);
      fixjrel(labelfwd1, fwd1start);
      return false;
    },

    // Logical Operators
    Logical: ({ visit }) => {
      const value = visit()[1];
      for (const [label, post] of value[1])
        fixsize(label, post);
      return value;
    },
    LogicalTwo: ({ visit }) => [visit()],
    LogicalOp: ({ visit }) => {
      const label = ref();
      const opcs = { and: 'jump-if-false-or-pop', or: 'jump-if-true-or-pop' };
      emit(opcs[visit()], label);
      return label;
    },
    LogicalRd: ({ visit }) => { visit(); return pos(); },

    // Operators
    LoadAttr: ({ visit }) => loadAttr(visit()[1]),
    Comparison: ({ visit }) => {
      const value = visit();
      emit('compare-op', CMP_OP_MAP[value[2]]);
      return value;
    },
    BinOp: ({ visit }) => {
      const value = visit();
      emit(BIN_OP_MAP[value[2]]);
      return value;
    },
    Unary: ({ visit }) => emit(UN_OP_MAP[visit()[1][0]]),
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
  py37.header(mtime, buffer.length, write);
  py37.code(code, write);

  // Output to a file
  const fileNameNoExt = path.basename(file, path.extname(file));
  const fileNameOutput = `${fileNameNoExt}.pyc`;
  const fileNameFinal = path.join(path.dirname(file), fileNameOutput);
  fs.writeFileSync(fileNameFinal, buffer, 'binary');
}

module.exports = {
  parse,
  coObj,
  translate,
  translateScope,
  translateFile,
};
