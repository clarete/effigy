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
const TYPE_TUPLE             = '('.charCodeAt(0);
const TYPE_SMALL_TUPLE       = ')'.charCodeAt(0);
const TYPE_CODE              = 'c'.charCodeAt(0);
const TYPE_REF               = 'r'.charCodeAt(0);

const FLAG_REF               = '\x80'.charCodeAt(0); /* with a type, add obj to index */


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
    co_firstlineno=0,
    co_lnotab=0,
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

function code(i, b, offset) {
  const wByte = v => b.writeUInt8(v, offset(1));
  const wLong = v => b.writeUInt32LE(v, offset(4));
  const wStr  = v => b.write(v, offset(v.length), v.length, 'binary');
  const wPStr = v => { wLong(v.length); wStr(v); };
  const wTYPE = (v, f) => wByte(v | f);

  const refCache = new Map();
  const wRef = (v, f) => {
    if (typeof v === 'string' || Buffer.isBuffer(v)) return false;
    const w = refCache[v];
    if (w !== undefined) {
      if (!(0 <= w && w <= 0x7fffffff)) throw new Error('assert');
      wByte(TYPE_REF, f[0]);
      wLong(v);
      return true;
    }
    refCache[v] = refCache.size;
    f[0] |= FLAG_REF;
    return false;
  };
  const wObject = v => {
    console.log('wObject', v);
    const flagc = [0];
    if (v === null) wByte(TYPE_NONE);
    else if (v === false) wByte(TYPE_FALSE);
    else if (v === true) wByte(TYPE_TRUE);
    else if (!wRef(v, flagc)) wComplexObject(v, flagc);
  };
  const wComplexObject = (v, flagc) => {
    console.log('wComplexObject', v);
    const f = flagc[0];
    if (Number.isInteger(v)) {
      wTYPE(TYPE_INT, f);
      wLong(v);
    } else if (typeof v === 'string') {
      wTYPE(TYPE_STRING, f);
      wPStr(v);
    } else if (Buffer.isBuffer(v)) {
      wTYPE(TYPE_STRING, f);
      wPStr(v.toString('binary'));
    } else if (Array.isArray(v)) {
      if (v.length < 256) {
        wTYPE(TYPE_SMALL_TUPLE);
        wByte(v.length);
      } else {
        wTYPE(TYPE_TUPLE, f);
        wLong(v.length);
      }
      for (const o of v) wObject(o);
    } else if (v instanceof PyCode) {
      wTYPE(TYPE_CODE, f);
      wLong(v.co_argcount);
      // wLong(v.co_posonlyargcount); new in python3.8
      wLong(v.co_kwonlyargcount);
      wLong(v.co_nlocals);
      wLong(v.co_stacksize);
      wLong(v.co_flags);
      wObject(v.co_code);
      wObject(v.co_consts);
      wObject(v.co_names);
      wObject(v.co_varnames);
      wObject(v.co_freevars);
      wObject(v.co_cellvars);
      wObject(v.co_filename);
      wObject(v.co_name);
      wLong(v.co_firstlineno);
      wObject(v.co_lnotab);
    } else {
      throw new Error(`No entiendo ${typeof v} - ${v}`);
    }
  };

  wObject(i);
};

const addToTable = (t, i) => {
  const pos = t.indexOf(i);
  return pos >= 0 ? pos : t.push(i)-1;
};

function compiler(co_filename) {
  const instructions = [];
  const code = new PyCode({ co_flags: 64, co_stacksize: 2 }); //({ co_filename });
  // -- Accessor & Mutator for instructions
  const output = () => {
    const instrlist = instructions.map(i => {
      const [n, v] = i, code = opcodeFromString(n);
      return v === undefined ? [code, 0] : [code, v];
    });
    code.co_code = Buffer.from(instrlist.flat());
    return code;
  };

  const emit = (op, arg) =>
    instructions.push(arg !== undefined ? [op, arg] : [op]);

  // -- Mutators for adding new items to tables
  const newConst = c => addToTable(code.co_consts, c);
  const newName = c => addToTable(code.co_names, c);
  // -- Basic interface for compiler
  return { emit, newConst, newName, output };
}

function header(b, offset, mtime, length) {
  b.writeInt32BE(MAGIC_NUMBER, offset(4)); // Py37 Magic Number
  b.writeInt32LE(0, offset(4));            // PEP-552
  b.writeInt32LE(mtime, offset(4));        // Modified Date
  b.writeInt32LE(length, offset(4));       // Code Size
}

function opcodeFromString(n) {
  const rename = n.replace(/-/g, '_').toUpperCase();
  return opcodes[`OP_${rename}`];
}

module.exports = {
  code,
  compiler,
  header,
  HEADER_SIZE,
};
