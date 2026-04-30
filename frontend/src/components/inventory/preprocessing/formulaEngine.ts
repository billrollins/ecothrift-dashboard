/**
 * TS port of `apps/inventory/formula_engine.py` for client-side Sample Result + Formula Preview.
 */

export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaError';
  }
}

type TokKind =
  | 'STRING'
  | 'COLREF'
  | 'FUNC'
  | 'NUMBER'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'PLUS';

type Token = { kind: TokKind; value: string };

/** Mirrors `apps/inventory/formula_engine.py` token patterns (sticky). */
const TOKEN_RE =
  /(?<STRING>"(?:[^"\\]|\\.)*")|(?<COLREF>\[([^\]]+)\])|(?<FUNC>(UPPER|LOWER|TITLE|TRIM|REPLACE|CONCAT|LEFT|RIGHT)\s*(?=\())|(?<NUMBER>\d+)|(?<LPAREN>\()|(?<RPAREN>\))|(?<COMMA>,)|(?<PLUS>\+)|(?<WS>\s+)/gy;

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < formula.length) {
    TOKEN_RE.lastIndex = pos;
    const m = TOKEN_RE.exec(formula);
    if (!m || m.index !== pos) {
      const bad = formula.slice(pos).trimStart().slice(0, 40);
      throw new FormulaError(`Unexpected characters: '${bad}' at position ${pos}`);
    }
    const g = m.groups as Record<string, string | undefined>;
    if (g.WS !== undefined) {
      pos = TOKEN_RE.lastIndex;
      continue;
    }
    let kind: TokKind;
    let value: string;
    if (g.STRING !== undefined) {
      kind = 'STRING';
      value = g.STRING.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    } else if (g.COLREF !== undefined) {
      kind = 'COLREF';
      // Match the Python engine: strip the wrapping brackets from the full
      // COLREF token. Using a capture index here is fragile because earlier
      // alternation groups shift the numeric positions.
      value = g.COLREF.slice(1, -1);
    } else if (g.FUNC !== undefined) {
      kind = 'FUNC';
      value = g.FUNC.trim();
    } else if (g.NUMBER !== undefined) {
      kind = 'NUMBER';
      value = g.NUMBER;
    } else if (g.LPAREN !== undefined) {
      kind = 'LPAREN';
      value = '(';
    } else if (g.RPAREN !== undefined) {
      kind = 'RPAREN';
      value = ')';
    } else if (g.COMMA !== undefined) {
      kind = 'COMMA';
      value = ',';
    } else if (g.PLUS !== undefined) {
      kind = 'PLUS';
      value = '+';
    } else {
      throw new FormulaError('Tokenizer internal error');
    }
    tokens.push({ kind, value });
    pos = TOKEN_RE.lastIndex;
  }
  return tokens;
}

type ASTNode =
  | { type: 'str'; v: string }
  | { type: 'num'; v: number }
  | { type: 'col'; name: string }
  | { type: 'func'; name: string; args: ASTNode[] }
  | { type: 'concat'; left: ASTNode; right: ASTNode };

class Parser {
  private readonly tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(expected?: TokKind): Token {
    const tok = this.peek();
    if (!tok) throw new FormulaError('Unexpected end of expression');
    if (expected && tok.kind !== expected) {
      throw new FormulaError(`Expected ${expected}, got ${tok.kind} ('${tok.value}')`);
    }
    this.pos += 1;
    return tok;
  }

  parse(): ASTNode {
    const node = this.parseConcat();
    if (this.pos < this.tokens.length) {
      const tok = this.tokens[this.pos];
      throw new FormulaError(`Unexpected token: ${tok.kind} ('${tok.value}')`);
    }
    return node;
  }

  private parseConcat(): ASTNode {
    let left = this.parsePrimary();
    while (this.peek()?.kind === 'PLUS') {
      this.consume('PLUS');
      const right = this.parsePrimary();
      left = { type: 'concat', left, right };
    }
    return left;
  }

  private parsePrimary(): ASTNode {
    const tok = this.peek();
    if (!tok) throw new FormulaError('Unexpected end of expression');

    if (tok.kind === 'STRING') {
      this.consume();
      return { type: 'str', v: tok.value };
    }
    if (tok.kind === 'NUMBER') {
      this.consume();
      return { type: 'num', v: Number.parseInt(tok.value, 10) };
    }
    if (tok.kind === 'COLREF') {
      this.consume();
      return { type: 'col', name: tok.value };
    }
    if (tok.kind === 'FUNC') {
      const name = tok.value;
      this.consume();
      this.consume('LPAREN');
      const args: ASTNode[] = [];
      if (this.peek()?.kind !== 'RPAREN') {
        args.push(this.parseConcat());
        while (this.peek()?.kind === 'COMMA') {
          this.consume('COMMA');
          args.push(this.parseConcat());
        }
      }
      this.consume('RPAREN');
      return { type: 'func', name, args };
    }
    if (tok.kind === 'LPAREN') {
      this.consume('LPAREN');
      const node = this.parseConcat();
      this.consume('RPAREN');
      return node;
    }

    throw new FormulaError(`Unexpected token: ${tok.kind} ('${tok.value}')`);
  }
}

const FUNCTIONS: Record<string, (args: string[]) => string> = {
  UPPER: (args) => String(args[0] ?? '').toUpperCase(),
  LOWER: (args) => String(args[0] ?? '').toLowerCase(),
  TITLE: (args) => titleCase(String(args[0] ?? '')),
  TRIM: (args) => String(args[0] ?? '').trim(),
  REPLACE: (args) =>
    String(args[0] ?? '').replace(String(args[1] ?? ''), String(args[2] ?? '')),
  CONCAT: (args) => args.map(String).join(''),
  LEFT: (args) => String(args[0] ?? '').slice(0, Number(args[1] ?? 0)),
  RIGHT: (args) => {
    const n = Number(args[1] ?? 0);
    const s = String(args[0] ?? '');
    return n > 0 ? s.slice(-n) : '';
  },
};

const FUNC_ARG_COUNTS: Record<string, [number, number | null]> = {
  UPPER: [1, 1],
  LOWER: [1, 1],
  TITLE: [1, 1],
  TRIM: [1, 1],
  REPLACE: [3, 3],
  CONCAT: [1, null],
  LEFT: [2, 2],
  RIGHT: [2, 2],
};

/** Match Python `str.title()` loosely for ASCII-ish manifests. */
function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function evaluateAst(node: ASTNode, row: Record<string, string>): string {
  switch (node.type) {
    case 'str':
      return node.v;
    case 'num':
      return String(node.v);
    case 'col':
      if (import.meta.env.DEV) {
        const val = row[node.name];
        console.info(
          `[Preprocessing:S1][formulaEngine] column lookup ${JSON.stringify({
            extractedColName: node.name,
            colNameCharCodes: [...node.name].map((c) => c.charCodeAt(0)),
            rowHasKey: Object.prototype.hasOwnProperty.call(row, node.name),
            valueLen: val == null ? null : String(val).length,
            valueHead: val == null ? null : String(val).slice(0, 80),
          })}`,
        );
      }
      return row[node.name] ?? '';
    case 'concat':
      return evaluateAst(node.left, row) + evaluateAst(node.right, row);
    case 'func': {
      const [minA, maxA] = FUNC_ARG_COUNTS[node.name] ?? [0, 0];
      if (node.args.length < minA) {
        throw new FormulaError(`${node.name}() requires at least ${minA} argument(s), got ${node.args.length}`);
      }
      if (maxA != null && node.args.length > maxA) {
        throw new FormulaError(`${node.name}() accepts at most ${maxA} argument(s), got ${node.args.length}`);
      }
      const evaluated = node.args.map((a) => evaluateAst(a, row));
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new FormulaError(`Unknown function ${node.name}`);
      return fn(evaluated);
    }
    default:
      throw new FormulaError('Unknown AST node');
  }
}

export function evaluateFormula(formula: string, row: Record<string, string>): string {
  const f = formula.trim();
  if (!f) return '';
  const tokens = tokenize(f);
  if (!tokens.length) return '';
  const parser = new Parser(tokens);
  const ast = parser.parse();
  return evaluateAst(ast, row);
}

export function evaluateFormulaSafe(formula: string, row: Record<string, string>): { ok: true; value: string } | { ok: false; error: string } {
  try {
    return { ok: true, value: evaluateFormula(formula, row) };
  } catch (e) {
    return { ok: false, error: e instanceof FormulaError ? e.message : String(e) };
  }
}
