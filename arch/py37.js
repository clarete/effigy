const path = require('path');
const fs = require('fs');

const MAGIC_NUMBER = 0x420d0d0a; // Python 3.7 Magic Number
const HEADER_SIZE = 16;          // 4 words of 32 bits

module.exports = function (input) {

  // The function `emitModule` *READS* from this variable to dump the
  // final output file and all the other `emit*` functions write to it
  // during code generation.
  const code = [];

  // Offset of where we are in the buffer
  let bufferOffset = 0;

  // Collect current offset, increment offset, return previous offset
  const offset = (step) => (bufferOffset += step) - step;

  // ---- Public Code Emitters ----

  const emitLoadConst = (v) => {
  };
  const emitInt = (v) => {
  };

  // ---- Private Code Emitters ----
  const _compilerAddOpI = (opcode, oparg) =>
    0;

  const emitHeader = (b) => {
    const now = parseInt(new Date/1000);
    b.writeInt32BE(MAGIC_NUMBER, offset(4)); // Py37 Magic Number
    b.writeInt32BE(0, offset(4));            // PEP-552
    b.writeInt32BE(now, offset(4));          // Modified Date
    b.writeInt32BE(code.length, offset(4));  // Code Size
  };
  const emitCode = (b) => {
  };
  const emitModule = () => {
    const fileNameNoExt = path.basename(input, path.extname(input));
    const fileNameOutput = `${fileNameNoExt}.pyc`;
    const b = Buffer.alloc(HEADER_SIZE);
    emitHeader(b);
    emitCode(b);
    fs.writeFileSync(fileNameOutput, b, 'binary');
  };
  return {
    emitLoadConst,
    emitInt,
    emitModule,
  };
};
