const opcodes = require('./py37.opcodes');

const MAGIC_NUMBER = 0x420d0d0a; // Python 3.7 Magic Number
const HEADER_SIZE = 16;          // 4 words of 32 bits

const TYPE_NULL              = '0'.charCodeAt(0);
const TYPE_NONE              = 'N'.charCodeAt(0);
const TYPE_FALSE             = 'F'.charCodeAt(0);
const TYPE_TRUE              = 'T'.charCodeAt(0);
const TYPE_STOPITER          = 'S'.charCodeAt(0);
const TYPE_ELLIPSIS          = '.'.charCodeAt(0);
const TYPE_INT               = 'i'.charCodeAt(0);
const TYPE_STRING            = 's'.charCodeAt(0);
const TYPE_SHORT_ASCII       = 'z'.charCodeAt(0);
const TYPE_SHORT_ASCII_INTERNED = 'Z'.charCodeAt(0);
const TYPE_TUPLE             = '('.charCodeAt(0);
const TYPE_SMALL_TUPLE       = ')'.charCodeAt(0);
const TYPE_CODE              = 'c'.charCodeAt(0);
const TYPE_REF               = 'r'.charCodeAt(0);

const FLAG_REF               = -'\x80'.charCodeAt(0); /* with a type, add obj to index */

const dbg = () => 0; //console.log;

class PyCode {
  constructor({
    co_argcount=0,
    co_posonlyargcount=0,
    co_kwonlyargcount=0,
    co_nlocals=0,
    co_stacksize=0,
    co_flags=0,
    co_code=null,
    co_consts=[],
    co_names=[],
    co_varnames=[],
    co_freevars=[],
    co_cellvars=[],
    co_filename="",
    co_name="",
    co_firstlineno=1,
    co_lnotab=Buffer.from(''),
  } = {}) {
    this.co_argcount = co_argcount;
    this.co_posonlyargcount = co_posonlyargcount;
    this.co_kwonlyargcount = co_kwonlyargcount;
    this.co_nlocals = co_nlocals;
    this.co_stacksize = co_stacksize;
    this.co_flags = co_flags;
    this.co_code = co_code;
    this.co_consts = co_consts;
    this.co_names = co_names;
    this.co_varnames = co_varnames;
    this.co_freevars = co_freevars;
    this.co_cellvars = co_cellvars;
    this.co_filename = co_filename;
    this.co_name = co_name;
    this.co_firstlineno = co_firstlineno;
    this.co_lnotab = co_lnotab;
  }
}

function code(i, write) {
  const wByte = v => write(1, (b, o) => b.writeInt8(v, o));
  const wLong = v => write(4, (b, o) => b.writeUInt32LE(v, o));
  const wStr  = v => write(v.length, (b, o) => b.write(v, o, v.length, 'binary'));
  const wSStr = v => { wByte(v.length); wStr(v); };
  const wPStr = v => { wLong(v.length); wStr(v); };
  const wTYPE = (v, f) => wByte(v | f);

  const refCache = {};
  const wRef = (v, f) => {
    if (Buffer.isBuffer(v)) {
      dbg("  - w_ref(Py_REFCNT(v) == 1): buffer");
      return false;
    } else if (v instanceof PyCode) {
      dbg("  - w_ref(Py_REFCNT(v) == 1): PyCode");
      return false;
    }
    const key = [typeof v, v, v.length];
    const w = refCache[key];
    if (w !== undefined) {
      if (!(0 <= w && w <= 0x7fffffff)) throw new Error('assert');
      dbg("  - w_ref(entry != NULL):", w);
      wByte(TYPE_REF, f[0]);
      wLong(w);
      return true;
    }
    refCache[key] = Object.keys(refCache).length;
    f[0] |= FLAG_REF;
    dbg("  - w_ref(miss):", Object.keys(refCache).length);
    return false;
  };
  const wObject = v => {
    const flagc = [0];
    dbg(`wObject ${v}`);
    if (v === null) wByte(TYPE_NONE);
    else if (v === false) wByte(TYPE_FALSE);
    else if (v === true) wByte(TYPE_TRUE);
    else if (!wRef(v, flagc)) wComplexObject(v, flagc);
  };
  const wComplexObject = (v, flagc) => {
    dbg('wComplexObject', flagc, v);
    const f = flagc[0];
    if (Number.isInteger(v)) {
      dbg("TYPE_INT", TYPE_INT | f);
      wTYPE(TYPE_INT, f);
      wLong(v);
    } else if (typeof v === 'string') {
      if (v.length < 256) {
        // in marshal.c, this emits `TYPE_SHORT_ASCII' but we're
        // emitting the _INTERNED version because all strings that are
        // defined in code are interned in Python.
        dbg("TYPE_SHORT_ASCII", TYPE_SHORT_ASCII_INTERNED | f);
        wTYPE(TYPE_SHORT_ASCII, f);
        wSStr(v);
      } else {
        dbg("TYPE_STRING", TYPE_STRING | f);
        wTYPE(TYPE_STRING, f);
        wPStr(v);
      }
    } else if (Buffer.isBuffer(v)) {
      dbg("TYPE_STRING", TYPE_STRING | f);
      wTYPE(TYPE_STRING, f);
      wPStr(v.toString('binary'));
    } else if (Array.isArray(v)) {
      if (v.length < 256) {
        dbg("TYPE_SMALL_TUPLE", TYPE_SMALL_TUPLE | f);
        // wTYPE(TYPE_SMALL_TUPLE); --- DOESN'T WORK?!?!?!
        wByte(TYPE_SMALL_TUPLE | f);
        wByte(v.length);
      } else {
        dbg("TYPE_TUPLE", TYPE_TUPLE | f);
        wTYPE(TYPE_TUPLE, f);
        wLong(v.length);
      }
      for (const o of v) wObject(o);
    } else if (v instanceof PyCode) {
      dbg("TYPE_CODE", TYPE_CODE | f);
      wTYPE(TYPE_CODE, f);
      wLong(v.co_argcount);
      // wLong(v.co_posonlyargcount); new in python3.8
      wLong(v.co_kwonlyargcount);
      wLong(v.co_nlocals);
      wLong(v.co_stacksize);
      wLong(v.co_flags);
      dbg("co_code");
      wObject(v.co_code);
      dbg("co_consts", v.co_consts);
      wObject(v.co_consts);
      dbg("co_names", v.co_names);
      wObject(v.co_names);
      dbg("co_varnames", v.co_varnames);
      wObject(v.co_varnames);
      dbg("co_freevars", v.co_freevars);
      wObject(v.co_freevars);
      dbg("co_cellvars", v.co_cellvars);
      wObject(v.co_cellvars);
      dbg("co_filename", v.co_filename);
      wObject(v.co_filename);
      dbg("co_name", v.co_name);
      wObject(v.co_name);
      dbg("co_firstlineno", v.co_firstlineno);
      wLong(v.co_firstlineno);
      dbg("co_lnotab");
      wObject(v.co_lnotab);
    } else {
      throw new Error(`No entiendo ${typeof v} - ${v}`);
    }
  };

  wObject(i);
};

function assembler(co_filename) {
  // Code Object
  const code = ({ co_name = "", co_flags = 0 }) => [
    new PyCode({ co_flags, co_name, co_filename }),
    [],               // Instructions before being packed into co_code
  ];
  // Support for nested functions
  const stack = [];
  // Current object
  const curr = () => stack[stack.length-1];
  const get = name => name === 'instructions'
    ? curr()[1]
    : name === 'constants'
    ? curr()[0][`co_consts`]
    : curr()[0][`co_${name}`];
  const set = (name, value) => name === 'instructions'
    ? (curr()[1] = value)
    : name === 'constants'
    ? (curr()[0][`co_consts`] = value)
    : (curr()[0][`co_${name}`] = value);
  const attr = (name, value) =>
    value === undefined ? get(name): set(name, value);
  // Control scope
  const enter = (...args) => stack.push(code(...args));
  const leave = () => {
    let depth = 0;
    const [c, instructions] = stack.pop();
    const instrlist = instructions.map(i => {
      const [n, v] = i, opc = opcodeFromString(n);
      const idepth = stackEffect(n, v, false);
      depth = Math.max(depth, idepth+depth);
      return v === undefined ? [opc, 0] : [opc, v];
    });
    c.co_code = Buffer.from(instrlist.flat());
    c.co_stacksize = depth;
    return c;
  };
  // -- Mutator for instructions
  const emit = (op, arg) =>
    curr()[1].push(arg !== undefined ? [op, arg] : [op]);
  // -- Save labels and patch'em back
  const labels = [];
  const ref = () => { labels.push(pos()); return labels.length-1; };
  const pos = () => curr()[1].length;
  const fix = (l, p) => curr()[1][labels[l]][1] = p;
  // -- Basic interface for assembler
  return { enter, leave, emit, attr, ref, pos, fix };
}

function header(mtime, length, write) {
  write(4, (b, o) => b.writeInt32BE(MAGIC_NUMBER, o)); // Py37 Magic Number
  write(4, (b, o) => b.writeInt32LE(0, o));            // PEP-552
  write(4, (b, o) => b.writeInt32LE(mtime, o));        // Modified Date
  write(4, (b, o) => b.writeInt32LE(length, o));       // Code Size
}

function opcodeFromString(n) {
  const rename = n.replace(/-/g, '_').toUpperCase();
  return opcodes[`OP_${rename}`];
}

function stackEffect(opcode, oparg, jump) {
  switch (opcode) {
    /* Stack manipulation */
  case 'pop-top': return -1;
  case 'rot-two':
  case 'rot-three': return 0;
  case 'dup-top': return 1;
  case 'dup-top-two': return 2;

    /* Unary operators */
  case 'unary-positive':
  case 'unary-negative':
  case 'unary-not':
  case 'unary-invert': return 0;

  case 'set-add':
  case 'list-append': return -1;
  case 'map-add': return -2;

    /* Binary operators */
  case 'binary-power':
  case 'binary-multiply':
  case 'binary-matrix-multiply':
  case 'binary-modulo':
  case 'binary-add':
  case 'binary-subtract':
  case 'binary-subscr':
  case 'binary-floor-divide':
  case 'binary-true-divide': return -1;
  case 'inplace_floor_divide':
  case 'inplace_true_divide': return -1;

  case 'inplace-add':
  case 'inplace-subtract':
  case 'inplace-multiply':
  case 'inplace-matrix-multiply':
  case 'inplace-modulo': return -1;
  case 'store-subscr': return -3;
  case 'delete-subscr': return -2;

  case 'binary-lshift':
  case 'binary-rshift':
  case 'binary-and':
  case 'binary-xor':
  case 'binary-or': return -1;
  case 'inplace-power': return -1;
  case 'get-iter': return 0;

  case 'print-expr': return -1;
  case 'load-build-class': return 1;

  case 'inplace-lshift':
  case 'inplace-rshift':
  case 'inplace-and':
  case 'inplace-xor':
  case 'inplace-or': return -1;
  case 'break-loop': return 0;
  case 'setup-with':
    /* 1 in the normal flow.
     * Restore the stack position and push 6 values before jumping to
     * the handler if an exception be raised. */
    return jump ? 6 : 1;
  case 'with-cleanup-start':
    return 2; /* or 1, depending on TOS */
  case 'with-cleanup-finish':
    /* Pop a variable number of values pushed by WITH_CLEANUP_START
     * + __exit__ or __aexit__. */
    return -3;
  case 'return-value': return -1;
  case 'import-star': return -1;
  case 'setup-annotations': return 0;
  case 'yield-value': return 0;
  case 'yield-from': return -1;
  case 'pop-block': return 0;
  case 'pop-except': return -3;
  case 'end-finally':
    /* Pop 6 values when an exception was raised. */
    return -6;

  case 'store-name': return -1;
  case 'delete-name': return 0;
  case 'unpack-sequence': return oparg-1;
  case 'unpack-ex': return (oparg & 0xFF) + (oparg >> 8);
  case 'for-iter':
    /* -1 at end of iterator, 1 if continue iterating. */
    return jump > 0 ? -1 : 1;

  case 'store-attr': return -2;
  case 'delete-attr': return -1;
  case 'store-global': return -1;
  case 'delete-global': return 0;
  case 'load-const': return 1;
  case 'load-name': return 1;
  case 'build-tuple':
  case 'build-list':
  case 'build-set':
  case 'build-string': return 1-oparg;

  case 'build-list-unpack':
  case 'build-tuple-unpack':
  case 'build-tuple-unpack-with-call':
  case 'build-set-unpack':
  case 'build-map-unpack':
  case 'build-map-unpack-with-call': return 1 - oparg;

  case 'build-map': return 1 - 2*oparg;
  case 'build-const-key-map': return -oparg;
  case 'load-attr': return 0;
  case 'compare-op': return -1;
  case 'import-name': return -1;
  case 'import-from': return 1;

    /* Jumps */
  case 'jump-forward':
  case 'jump-absolute': return 0;

  case 'jump-if-true-or-pop':
  case 'jump-if-false-or-pop':
    return jump ? 0 : -1;

  case 'pop-jump-if-false':
  case 'pop-jump-if-true':
    return -1;

  case 'load-global':
    return 1;

  case 'continue-loop':
    return 0;
  case 'setup-loop':
    return 0;
  case 'setup-except':
  case 'setup-finally':
    /* 0 in the normal flow.
     * Restore the stack position and push 6 values before jumping to
     * the handler if an exception be raised. */
    return jump ? 6 : 0;

  case 'load-fast': return 1;
  case 'store-fast': return -1;
  case 'delete-fast': return 0;
  case 'raise-varargs': return -oparg;

    /* Functions and calls */
  case 'call-function': return -(oparg);
  case 'call-method': return -(oparg)-1;
  case 'call-function-kw': return -oparg-1;
  case 'call-function-ex': return -1 - ((oparg & 0x01) != 0);
  case 'make-function':
    return -1 - ((oparg & 0x01) != 0) - ((oparg & 0x02) != 0) -
      ((oparg & 0x04) != 0) - ((oparg & 0x08) != 0);
  case 'build-slice':
    if (oparg == 3)
      return -2;
    else
      return -1;

    /* Closures */
  case 'load-closure': return 1;
  case 'load-deref':
  case 'load-classderef': return 1;
  case 'store-deref': return -1;
  case 'delete-deref': return 0;

    /* Iterators and generators */
  case 'get-awaitable':
    return 0;
  case 'setup-async-with':
    /* 0 in the normal flow.
     * Restore the stack position to the position before the result
     * of __aenter__ and push 6 values before jumping to the handler
     * if an exception be raised. */
    return jump ? -1 + 6 : 0;
  case 'before-async-with': return 1;
  case 'get-aiter': return 0;
  case 'get-anext': return 1;
  case 'get-yield-from-iter': return 0;
  // case 'format-value':
  //   /* If there's a fmt_spec on the stack, we go from 2->1,
  //      else 1->1. */
  //   return (oparg & FVS_MASK) == FVS_HAVE_SPEC ? -1 : 0;
  case 'load-method':
    return 1;
  default:
    throw new Error("Invalid stack effect");
  }
}

module.exports = {
  code,
  assembler,
  header,
  HEADER_SIZE,
  stackEffect,
};
