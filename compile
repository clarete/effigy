#!/usr/bin/env node
const lang = require('./lang');

function parsecmd() {
  // What we return. With its defaults;
  const output = {
    flags: {},
    files: [],
  };
  // Read the command line and extract what we care about.
  for (const param of process.argv.slice(2)) {
    if (param.startsWith('--')) {
      const [name, value] = param.slice(2).split('=');
      output.flags[name] = value === undefined ? true : value;
    } else {
      output.files.push(param);
    }
  }
  return output;
}

function main() {
  const params = parsecmd();
  for (const file of params.files) {
    lang.translateFile(file, params.flags);
  }
}

if (!module.parent) main();
