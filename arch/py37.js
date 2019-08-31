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
  const code = ({
    co_name = "",
    co_flags = 0,
    co_stacksize = 10, // wat
  }) => [
    new PyCode({
      co_flags, co_stacksize, co_name, co_filename,
    }),
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
    const [c, instructions] = stack.pop();
    const instrlist = instructions.map(i => {
      const [n, v] = i, opc = opcodeFromString(n);
      return v === undefined ? [opc, 0] : [opc, v];
    });
    c.co_code = Buffer.from(instrlist.flat());
    return c;
  };
  // -- Mutator for instructions
  const emit = (op, arg) =>
    curr()[1].push(arg !== undefined ? [op, arg] : [op]);
  const backtrack = (f) => {
    const current = curr();
    const copy = current[1].slice();
    try { return f(); }
    catch (e) { current[1] = copy; throw e; }
  };
  // -- Save labels and patch'em back
  const labels = [];
  const ref = () => { labels.push(pos()); return labels.length-1; };
  const pos = () => curr()[1].length;
  const fix = (l, p) => curr()[1][labels[l]][1] = p;
  // -- Basic interface for assembler
  return { enter, leave, emit, attr, backtrack, ref, pos, fix };
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

module.exports = {
  code,
  assembler,
  header,
  HEADER_SIZE,
};
