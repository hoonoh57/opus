// Strategy formula language (docs/07 12-2). Dedicated parser, no eval/Function (FX1).
// Lookback n must be a non-negative constant (number literal or param), so future bars are unreachable (FX2).
export class FormulaError extends Error {
  pos: number;
  constructor(msg: string, pos: number) { super(msg); this.pos = pos; }
}

export type Node =
  | { t: 'num'; v: number }
  | { t: 'id'; name: string }
  | { t: 'un'; op: string; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'call'; fn: string; args: Node[] };

const FN_ARITY: Record<string, number> = {
  turnUp: 1, turnDown: 1, crossUp: 2, crossDown: 2, ref: 2, highest: 2, lowest: 2, avg: 2, min: 2, max: 2, abs: 1,
};
const LOOKBACK = new Set(['ref', 'highest', 'lowest', 'avg']);
const KEYWORDS = new Set(['and', 'or', 'not']);
const CMP = ['==', '!=', '>=', '<=', '>', '<'];
const ARITH = new Set(['+', '-', '*', '/']);

export function tokenize(s: string): string[] {
  const re = /(\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?|==|!=|>=|<=|[-+*\/()<>,])/y;
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) { i++; continue; }
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m) throw new FormulaError('bad character at ' + i + ': ' + s[i], i);
    out.push(m[1]);
    i = re.lastIndex;
  }
  return out;
}

export function parse(src: string): Node {
  const tk = tokenize(src);
  let p = 0;
  const peek = () => tk[p];
  const next = () => tk[p++];
  const expect = (x: string) => {
    if (tk[p] !== x) throw new FormulaError('expected ' + x + ' at token ' + p, p);
    p++;
  };
  function orE(): Node { let a = andE(); while (peek() === 'or') { next(); a = { t: 'bin', op: 'or', a, b: andE() }; } return a; }
  function andE(): Node { let a = notE(); while (peek() === 'and') { next(); a = { t: 'bin', op: 'and', a, b: notE() }; } return a; }
  function notE(): Node { if (peek() === 'not') { next(); return { t: 'un', op: 'not', a: notE() }; } return cmpE(); }
  function cmpE(): Node {
    const a = addE();
    const op = peek();
    if (op !== undefined && CMP.includes(op)) { next(); return { t: 'bin', op, a, b: addE() }; }
    return a;
  }
  function addE(): Node { let a = mulE(); while (peek() === '+' || peek() === '-') { const op = next(); a = { t: 'bin', op, a, b: mulE() }; } return a; }
  function mulE(): Node { let a = unE(); while (peek() === '*' || peek() === '/') { const op = next(); a = { t: 'bin', op, a, b: unE() }; } return a; }
  function unE(): Node { if (peek() === '-') { next(); return { t: 'un', op: '-', a: unE() }; } return prim(); }
  function prim(): Node {
    const x = next();
    if (x === undefined) throw new FormulaError('unexpected end of formula', p);
    if (x === '(') { const e = orE(); expect(')'); return e; }
    if (/^\d/.test(x)) return { t: 'num', v: Number(x) };
    if (/^[A-Za-z_]/.test(x) && !KEYWORDS.has(x)) {
      if (peek() === '(') {
        next();
        const args: Node[] = [];
        if (peek() !== ')') {
          args.push(orE());
          while (peek() === ',') { next(); args.push(orE()); }
        }
        expect(')');
        return { t: 'call', fn: x, args };
      }
      return { t: 'id', name: x };
    }
    throw new FormulaError('unexpected token ' + x, p - 1);
  }
  const e = orE();
  if (p !== tk.length) throw new FormulaError('extra token ' + tk[p], p);
  return e;
}

export interface Scope {
  params: Record<string, number>;
  indicators: Record<string, string[]>;
  vars: Set<string>;
}

export function constValue(n: Node, sc: { params: Record<string, number> }): number | null {
  if (n.t === 'num') return n.v;
  if (n.t === 'id' && Object.prototype.hasOwnProperty.call(sc.params, n.name)) return sc.params[n.name];
  return null;
}

export function validate(n: Node, sc: Scope): void {
  switch (n.t) {
    case 'num': return;
    case 'id': {
      if (Object.prototype.hasOwnProperty.call(sc.params, n.name) || sc.vars.has(n.name)) return;
      const parts = n.name.split('.');
      const fields = Object.prototype.hasOwnProperty.call(sc.indicators, parts[0]) ? sc.indicators[parts[0]] : undefined;
      if (fields && fields.includes(parts.length > 1 ? parts[1] : '')) return;
      throw new FormulaError('unknown name ' + n.name, 0);
    }
    case 'un': validate(n.a, sc); return;
    case 'bin': validate(n.a, sc); validate(n.b, sc); return;
    case 'call': {
      if (!Object.prototype.hasOwnProperty.call(FN_ARITY, n.fn)) throw new FormulaError('unknown function ' + n.fn, 0);
      if (n.args.length !== FN_ARITY[n.fn]) throw new FormulaError(n.fn + ' needs ' + FN_ARITY[n.fn] + ' args', 0);
      for (const a of n.args) validate(a, sc);
      if (LOOKBACK.has(n.fn)) {
        const k = constValue(n.args[1], sc);
        const min = n.fn === 'ref' ? 0 : 1;
        if (k === null || !Number.isInteger(k) || k < min) throw new FormulaError(n.fn + ' n must be an integer constant >= ' + min, 0);
      }
    }
  }
}

export interface Ctx {
  params: Record<string, number>;
  isPos(name: string): boolean;
  posVar(name: string): number;
  series(name: string, i: number): number;
}

export const truthy = (v: number): boolean => v !== 0 && !Number.isNaN(v);
const b2n = (x: boolean): number => (x ? 1 : 0);

export function evalAt(n: Node, i: number, c: Ctx): number {
  switch (n.t) {
    case 'num': return n.v;
    case 'id':
      if (Object.prototype.hasOwnProperty.call(c.params, n.name)) return c.params[n.name];
      if (c.isPos(n.name)) return c.posVar(n.name);
      return c.series(n.name, i);
    case 'un': {
      const a = evalAt(n.a, i, c);
      return n.op === 'not' ? b2n(!truthy(a)) : -a;
    }
    case 'bin': {
      if (n.op === 'and') return b2n(truthy(evalAt(n.a, i, c)) && truthy(evalAt(n.b, i, c)));
      if (n.op === 'or') return b2n(truthy(evalAt(n.a, i, c)) || truthy(evalAt(n.b, i, c)));
      const a = evalAt(n.a, i, c);
      const b = evalAt(n.b, i, c);
      if (Number.isNaN(a) || Number.isNaN(b)) return ARITH.has(n.op) ? NaN : 0;
      switch (n.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b === 0 ? NaN : a / b;
        case '==': return b2n(a === b);
        case '!=': return b2n(a !== b);
        case '>': return b2n(a > b);
        case '<': return b2n(a < b);
        case '>=': return b2n(a >= b);
        case '<=': return b2n(a <= b);
      }
      return NaN;
    }
    case 'call': return callFn(n, i, c);
  }
}

function callFn(n: { fn: string; args: Node[] }, i: number, c: Ctx): number {
  const ev = (k: number, j: number) => evalAt(n.args[k], j, c);
  switch (n.fn) {
    case 'turnUp': { const x0 = ev(0, i), x1 = ev(0, i - 1), x2 = ev(0, i - 2); return b2n(x0 > x1 && x1 <= x2); }
    case 'turnDown': { const x0 = ev(0, i), x1 = ev(0, i - 1), x2 = ev(0, i - 2); return b2n(x0 < x1 && x1 >= x2); }
    case 'crossUp': return b2n(ev(0, i) > ev(1, i) && ev(0, i - 1) <= ev(1, i - 1));
    case 'crossDown': return b2n(ev(0, i) < ev(1, i) && ev(0, i - 1) >= ev(1, i - 1));
    case 'ref': return ev(0, i - ev(1, i));
    case 'highest':
    case 'lowest':
    case 'avg': {
      const k = ev(1, i);
      let acc = n.fn === 'highest' ? -Infinity : n.fn === 'lowest' ? Infinity : 0;
      for (let j = 0; j < k; j++) {
        const v = ev(0, i - j);
        if (Number.isNaN(v)) return NaN;
        acc = n.fn === 'highest' ? Math.max(acc, v) : n.fn === 'lowest' ? Math.min(acc, v) : acc + v;
      }
      return n.fn === 'avg' ? acc / k : acc;
    }
    case 'min': return Math.min(ev(0, i), ev(1, i));
    case 'max': return Math.max(ev(0, i), ev(1, i));
    case 'abs': return Math.abs(ev(0, i));
  }
  return NaN;
}
