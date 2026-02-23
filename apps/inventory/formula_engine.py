"""
Expression-based formula engine for manifest standardization.

Syntax:
  Column references: [COLUMN_NAME]
  Functions: UPPER(expr), LOWER(expr), TITLE(expr), TRIM(expr),
             REPLACE(expr, find, replace), CONCAT(expr, ...), LEFT(expr, n), RIGHT(expr, n)
  Operators: + for string concatenation
  Literals: "quoted strings"

Examples:
  TITLE([Description])
  UPPER([Brand]) + " " + [Model]
  REPLACE([Category], "/", " - ")
  CONCAT(TRIM([Brand]), " ", TRIM([Model]))
"""
import re
from typing import Any


class FormulaError(Exception):
    pass


# ── Tokenizer ────────────────────────────────────────────────────────────────

TOKEN_PATTERNS = [
    ('STRING',    r'"(?:[^"\\]|\\.)*"'),
    ('COLREF',    r'\[([^\]]+)\]'),
    ('FUNC',      r'(UPPER|LOWER|TITLE|TRIM|REPLACE|CONCAT|LEFT|RIGHT)\s*(?=\()'),
    ('NUMBER',    r'\d+'),
    ('LPAREN',    r'\('),
    ('RPAREN',    r'\)'),
    ('COMMA',     r','),
    ('PLUS',      r'\+'),
    ('WS',        r'\s+'),
]

_TOKEN_RE = re.compile('|'.join(f'(?P<{name}>{pat})' for name, pat in TOKEN_PATTERNS))


def tokenize(formula: str) -> list[tuple[str, str]]:
    tokens = []
    pos = 0
    for m in _TOKEN_RE.finditer(formula):
        if m.start() != pos:
            bad = formula[pos:m.start()].strip()
            if bad:
                raise FormulaError(f"Unexpected characters: '{bad}' at position {pos}")
        pos = m.end()
        kind = m.lastgroup
        value = m.group()
        if kind == 'WS':
            continue
        if kind == 'STRING':
            value = value[1:-1].replace('\\"', '"').replace('\\\\', '\\')
        elif kind == 'COLREF':
            value = m.group('COLREF')
            value = value[1:-1]
        elif kind == 'FUNC':
            value = value.strip()
        tokens.append((kind, value))

    if pos != len(formula):
        remaining = formula[pos:].strip()
        if remaining:
            raise FormulaError(f"Unexpected characters at end: '{remaining}'")

    return tokens


# ── AST Nodes ────────────────────────────────────────────────────────────────

class ASTNode:
    pass

class StringLiteral(ASTNode):
    def __init__(self, value: str):
        self.value = value

class NumberLiteral(ASTNode):
    def __init__(self, value: int):
        self.value = value

class ColumnRef(ASTNode):
    def __init__(self, name: str):
        self.name = name

class FuncCall(ASTNode):
    def __init__(self, name: str, args: list[ASTNode]):
        self.name = name
        self.args = args

class ConcatOp(ASTNode):
    def __init__(self, left: ASTNode, right: ASTNode):
        self.left = left
        self.right = right


# ── Parser ───────────────────────────────────────────────────────────────────

class Parser:
    def __init__(self, tokens: list[tuple[str, str]]):
        self.tokens = tokens
        self.pos = 0

    def peek(self) -> tuple[str, str] | None:
        if self.pos < len(self.tokens):
            return self.tokens[self.pos]
        return None

    def consume(self, expected_kind: str | None = None) -> tuple[str, str]:
        tok = self.peek()
        if tok is None:
            raise FormulaError("Unexpected end of expression")
        if expected_kind and tok[0] != expected_kind:
            raise FormulaError(f"Expected {expected_kind}, got {tok[0]} ('{tok[1]}')")
        self.pos += 1
        return tok

    def parse(self) -> ASTNode:
        node = self.parse_concat()
        if self.pos < len(self.tokens):
            tok = self.tokens[self.pos]
            raise FormulaError(f"Unexpected token: {tok[0]} ('{tok[1]}')")
        return node

    def parse_concat(self) -> ASTNode:
        left = self.parse_primary()
        while self.peek() and self.peek()[0] == 'PLUS':
            self.consume('PLUS')
            right = self.parse_primary()
            left = ConcatOp(left, right)
        return left

    def parse_primary(self) -> ASTNode:
        tok = self.peek()
        if tok is None:
            raise FormulaError("Unexpected end of expression")

        if tok[0] == 'STRING':
            self.consume()
            return StringLiteral(tok[1])

        if tok[0] == 'NUMBER':
            self.consume()
            return NumberLiteral(int(tok[1]))

        if tok[0] == 'COLREF':
            self.consume()
            return ColumnRef(tok[1])

        if tok[0] == 'FUNC':
            func_name = tok[1]
            self.consume()
            self.consume('LPAREN')
            args = []
            if self.peek() and self.peek()[0] != 'RPAREN':
                args.append(self.parse_concat())
                while self.peek() and self.peek()[0] == 'COMMA':
                    self.consume('COMMA')
                    args.append(self.parse_concat())
            self.consume('RPAREN')
            return FuncCall(func_name, args)

        if tok[0] == 'LPAREN':
            self.consume()
            node = self.parse_concat()
            self.consume('RPAREN')
            return node

        raise FormulaError(f"Unexpected token: {tok[0]} ('{tok[1]}')")


# ── Evaluator ────────────────────────────────────────────────────────────────

FUNCTIONS = {
    'UPPER':   lambda args: str(args[0]).upper(),
    'LOWER':   lambda args: str(args[0]).lower(),
    'TITLE':   lambda args: str(args[0]).title(),
    'TRIM':    lambda args: str(args[0]).strip(),
    'REPLACE': lambda args: str(args[0]).replace(str(args[1]), str(args[2])),
    'CONCAT':  lambda args: ''.join(str(a) for a in args),
    'LEFT':    lambda args: str(args[0])[:int(args[1])],
    'RIGHT':   lambda args: str(args[0])[-int(args[1]):] if int(args[1]) > 0 else '',
}

FUNC_ARG_COUNTS = {
    'UPPER': (1, 1),
    'LOWER': (1, 1),
    'TITLE': (1, 1),
    'TRIM':  (1, 1),
    'REPLACE': (3, 3),
    'CONCAT': (1, None),
    'LEFT':  (2, 2),
    'RIGHT': (2, 2),
}


def evaluate_ast(node: ASTNode, row: dict[str, str]) -> str:
    if isinstance(node, StringLiteral):
        return node.value

    if isinstance(node, NumberLiteral):
        return str(node.value)

    if isinstance(node, ColumnRef):
        return str(row.get(node.name, ''))

    if isinstance(node, ConcatOp):
        return evaluate_ast(node.left, row) + evaluate_ast(node.right, row)

    if isinstance(node, FuncCall):
        min_args, max_args = FUNC_ARG_COUNTS.get(node.name, (0, None))
        if len(node.args) < min_args:
            raise FormulaError(
                f"{node.name}() requires at least {min_args} argument(s), got {len(node.args)}"
            )
        if max_args is not None and len(node.args) > max_args:
            raise FormulaError(
                f"{node.name}() accepts at most {max_args} argument(s), got {len(node.args)}"
            )
        evaluated_args = [evaluate_ast(a, row) for a in node.args]
        return FUNCTIONS[node.name](evaluated_args)

    raise FormulaError(f"Unknown AST node type: {type(node).__name__}")


# ── Public API ───────────────────────────────────────────────────────────────

def evaluate_formula(formula: str, row: dict[str, str]) -> str:
    """Evaluate a formula expression against a row dict. Returns the result string.

    Raises FormulaError on syntax or evaluation errors.
    """
    formula = formula.strip()
    if not formula:
        return ''

    tokens = tokenize(formula)
    if not tokens:
        return ''

    parser = Parser(tokens)
    ast = parser.parse()
    return evaluate_ast(ast, row)


def validate_formula(formula: str) -> str | None:
    """Validate formula syntax without evaluating. Returns None if valid, error message if not."""
    try:
        formula = formula.strip()
        if not formula:
            return None
        tokens = tokenize(formula)
        if not tokens:
            return None
        parser = Parser(tokens)
        parser.parse()
        return None
    except FormulaError as e:
        return str(e)
