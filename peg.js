// --- PEG Primitives (Doesn't include lexer) ---
// Star Operator (*)
var zeroOrMore = module.exports.zeroOrMore = function (combinator) {
    var output = [];
    while (true) {
        try {
            output.push(combinator());
        }
        catch (e) {
            return output;
        }
    }
    return output;
};
// Plus Operator (+)
var oneOrMore = module.exports.oneOrMore = function (combinator) {
    return [combinator()].concat(zeroOrMore(combinator));
};
// Choice Operator (/)
var choice = module.exports.choice = function () {
    var a = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        a[_i] = arguments[_i];
    }
    var last = null;
    for (var _a = 0, a_1 = a; _a < a_1.length; _a++) {
        var nth = a_1[_a];
        try {
            return nth();
        }
        catch (e) {
            last = e;
        }
    }
    throw last;
};
// Optional Operator (?)
var optional = module.exports.optional = function (combinator) {
    try {
        return combinator();
    }
    catch (e) {
        return null;
    }
};
// Not Operator (!)
var not = module.exports.not = function (thing) {
    try {
        thing();
    }
    catch (e) {
        return true;
    }
    throw new Error;
};
// And Operator (&)
var and = module.exports.and = function (thing) { return not(function () { return not(thing); }); };
// // Any Operator (.)
// const any = () => nextc();     // Should be next in the input, not source
// // Class Operator ([])
// const class_ = (c) => typeof c === 'string' ? c : range(c);
// const range = (c) => c;
// // Sequence Operator
// const sequence = (s) => s;
// class PegParser {
//   constructor(source) { this.cursor = 0; this.source = source; }
//   error(msg) { throw new Error(msg); };
//   checkeos() { return this.eos() && this.error('End of stream'); }
//   // Lexer
//   currc() { return this.source[this.cursor] || ''; }
//   nextc() { return this.checkeos() || this.source[this.cursor++]; }
//   testc(c) { return this.currc() === c; }
//   match(c) { return this.testc(c) ? this.nextc() : false; }
//   must(c) { return this.match(c) || this.error(`Missing '${c}' at pos '${this.cursor}'`); }
//   eos() { return this.cursor === this.source.length; }
//   consume(predicate) {
//     let chars = "";
//     while (predicate()) chars += this.nextc();
//     return chars;
//   };
// }
// class Peg extends Parser {
//   // ---- PEG Primitives ----
//   zeroOrMore(combinator) {
//     const output = [];
//     while (true) {
//       try { output.push(combinator()); }
//       catch (e) { return output; }
//     }
//     return output;
//   };
//   // Plus Operator (+)
//   oneOrMore(combinator) {
//     return [combinator()].concat(this.zeroOrMore(combinator));
//   }
//   // Choice Operator (/)
//   choice(...a) {
//     const savedCursor = this.cursor;
//     for (const nth of a) {
//       try { return nth(); }
//       catch (e) { this.cursor = savedCursor; }
//     }
//     const names = a.map(i => i.name).join(', ');
//     return this.error(`Expected one of ${names}`);
//   };
//   // Optional Operator (?)
//   optional(combinator) {
//     try { return combinator(); }
//     catch (e) { return true; }
//   };
//   // Not Operator (!)
//   not(thing) {
//     const savedCursor = this.cursor;
//     try {
//       if (!thing()) return true;
//       throw new Error;
//     } catch (e) { this.cursor = savedCursor; throw e; }
//   };
//   // And Operator (&)
//   and(thing) { this.not(() => this.not(thing)); }
//   // Any Operator (.)
//   any() { return this.nextc(); } // Should be next in the input, not source
//   // Class Operator ([])
//   class_ = (c) => typeof c === 'string' ? c : this.range(c);
//   range = (c) => c;
//   // Sequence Operator (/)
//   sequence = (s) => s;
// }
