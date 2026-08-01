/**
 * Converts PseudoGo source text into a stream of tokens, tracking
 * line/column information for downstream error reporting. A direct port of
 * `pseudogo-cli`'s `internal/lexer` package.
 */

import { PseudoError } from "../errors/errors.js";
import { type Token, type TokenType, lookupIdent } from "../token/token.js";

function isLetter(ch: string | null): boolean {
  if (ch === null) return false;
  return ch === "_" || (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

function isDigit(ch: string | null): boolean {
  if (ch === null) return false;
  return ch >= "0" && ch <= "9";
}

export class Lexer {
  private readonly input: string;
  private pos = 0;
  private readPos = 0;
  private ch: string | null = null;
  private line = 1;
  private column = 0;

  constructor(source: string) {
    this.input = source;
    this.readChar();
  }

  private readChar(): void {
    this.ch = this.readPos >= this.input.length ? null : this.input[this.readPos]!;
    this.pos = this.readPos;
    this.readPos++;
    if (this.curCh() === "\n") {
      this.line++;
      this.column = 0;
    } else {
      this.column++;
    }
  }

  private peekChar(): string | null {
    return this.readPos >= this.input.length ? null : this.input[this.readPos]!;
  }

  private peekAt(offset: number): string | null {
    const idx = this.readPos + offset;
    return idx >= this.input.length ? null : this.input[idx]!;
  }

  // Routed through a method (rather than reading `this.curCh()` directly) so
  // TypeScript's control-flow narrowing can't incorrectly assume `this.curCh()`
  // stays a stale narrowed literal across loop iterations that mutate it
  // indirectly via `this.readChar()`.
  private curCh(): string | null {
    return this.ch;
  }

  private skipWhitespaceAndComments(): void {
    for (;;) {
      if (this.curCh() === " " || this.curCh() === "\t" || this.curCh() === "\r" || this.curCh() === "\n") {
        this.readChar();
      } else if (this.curCh() === "-" && this.peekChar() === "-") {
        while (this.curCh() !== "\n" && this.curCh() !== null) this.readChar();
      } else if (this.curCh() === "/" && this.peekChar() === "*") {
        this.readChar();
        this.readChar();
        for (;;) {
          if (this.curCh() === null) return;
          if (this.curCh() === "*" && this.peekChar() === "/") {
            this.readChar();
            this.readChar();
            break;
          }
          this.readChar();
        }
      } else {
        return;
      }
    }
  }

  private makeTok(type: TokenType, literal: string, line: number, column: number): Token {
    return { type, literal, pos: { line, column } };
  }

  /** Scans and returns the next token in the input. */
  nextToken(): Token {
    this.skipWhitespaceAndComments();
    const line = this.line;
    const col = this.column;

    if (this.curCh() === null) return this.makeTok("EOF", "", line, col);
    if (isLetter(this.curCh())) return this.readIdentifier(line, col);
    if (isDigit(this.curCh())) return this.readNumber(line, col);
    if (this.curCh() === '"') return this.readString(line, col);
    if (this.curCh() === "'") return this.readCharLit(line, col);

    let tok: Token;
    switch (this.curCh()) {
      case "=":
        tok = this.peekChar() === "=" ? (this.readChar(), this.makeTok("EQ", "==", line, col)) : this.makeTok("ASSIGN", "=", line, col);
        break;
      case "!":
        if (this.peekChar() === "=") {
          this.readChar();
          tok = this.makeTok("NEQ", "!=", line, col);
        } else {
          throw new PseudoError("Lexical error", line, `Unexpected character '${this.curCh()}'`);
        }
        break;
      case "<":
        tok = this.peekChar() === "=" ? (this.readChar(), this.makeTok("LTE", "<=", line, col)) : this.makeTok("LT", "<", line, col);
        break;
      case ">":
        tok = this.peekChar() === "=" ? (this.readChar(), this.makeTok("GTE", ">=", line, col)) : this.makeTok("GT", ">", line, col);
        break;
      case "+":
        tok = this.makeTok("PLUS", "+", line, col);
        break;
      case "-":
        tok = this.peekChar() === ">" ? (this.readChar(), this.makeTok("ARROW", "->", line, col)) : this.makeTok("MINUS", "-", line, col);
        break;
      case "*":
        tok = this.makeTok("STAR", "*", line, col);
        break;
      case "/":
        tok = this.makeTok("SLASH", "/", line, col);
        break;
      case "(":
        tok = this.makeTok("LPAREN", "(", line, col);
        break;
      case ")":
        tok = this.makeTok("RPAREN", ")", line, col);
        break;
      case "[":
        tok = this.makeTok("LBRACKET", "[", line, col);
        break;
      case "]":
        tok = this.makeTok("RBRACKET", "]", line, col);
        break;
      case ",":
        tok = this.makeTok("COMMA", ",", line, col);
        break;
      case ":":
        tok = this.makeTok("COLON", ":", line, col);
        break;
      case ".":
        tok = this.makeTok("DOT", ".", line, col);
        break;
      default:
        throw new PseudoError("Lexical error", line, `Unexpected character '${this.curCh()}'`);
    }
    this.readChar();
    return tok;
  }

  private readIdentifier(line: number, col: number): Token {
    const start = this.pos;
    while (isLetter(this.curCh()) || isDigit(this.curCh())) this.readChar();
    const lit = this.input.slice(start, this.pos);

    // Special case: "in/out" parameter mode is a single logical token.
    if (
      lit === "in" &&
      this.curCh() === "/" &&
      this.peekChar() === "o" &&
      this.peekAt(1) === "u" &&
      this.peekAt(2) === "t"
    ) {
      this.readChar(); // '/'
      this.readChar(); // 'o'
      this.readChar(); // 'u'
      this.readChar(); // 't'
      return this.makeTok("INOUT", "in/out", line, col);
    }

    return this.makeTok(lookupIdent(lit), lit, line, col);
  }

  private readNumber(line: number, col: number): Token {
    const start = this.pos;
    while (isDigit(this.curCh())) this.readChar();
    if (this.curCh() === "." && isDigit(this.peekChar())) {
      this.readChar();
      while (isDigit(this.curCh())) this.readChar();
      return this.makeTok("REAL_LIT", this.input.slice(start, this.pos), line, col);
    }
    return this.makeTok("INT_LIT", this.input.slice(start, this.pos), line, col);
  }

  private readString(line: number, col: number): Token {
    let out = "";
    this.readChar(); // consume opening quote
    while (this.curCh() !== '"') {
      if (this.curCh() === null || this.curCh() === "\n") {
        throw new PseudoError("Lexical error", line, "Unterminated string literal");
      }
      if (this.curCh() === "\\") {
        this.readChar();
        switch (this.curCh()) {
          case "n":
            out += "\n";
            break;
          case "t":
            out += "\t";
            break;
          case "r":
            out += "\r";
            break;
          case '"':
            out += '"';
            break;
          case "\\":
            out += "\\";
            break;
          default:
            out += this.curCh() ?? "";
            break;
        }
        this.readChar();
        continue;
      }
      out += this.curCh();
      this.readChar();
    }
    this.readChar(); // consume closing quote
    return this.makeTok("STRING_LIT", out, line, col);
  }

  private readCharLit(line: number, col: number): Token {
    this.readChar(); // consume opening quote
    let ch: string;
    if (this.curCh() === "\\") {
      this.readChar();
      switch (this.curCh()) {
        case "n":
          ch = "\n";
          break;
        case "t":
          ch = "\t";
          break;
        case "r":
          ch = "\r";
          break;
        case "'":
          ch = "'";
          break;
        case "\\":
          ch = "\\";
          break;
        default:
          ch = this.curCh() ?? "";
          break;
      }
      this.readChar();
    } else if (this.curCh() === null || this.curCh() === "\n") {
      throw new PseudoError("Lexical error", line, "Unterminated char literal");
    } else {
      // Already excluded null/"\n" above; curCh() being a method call means
      // TS can't narrow its result the way it would a plain property read.
      ch = this.curCh()!;
      this.readChar();
    }
    if (this.curCh() !== "'") {
      throw new PseudoError("Lexical error", line, "Char literal must contain exactly one character");
    }
    this.readChar(); // consume closing quote
    return this.makeTok("CHAR_LIT", ch, line, col);
  }
}

/**
 * Scans the entire source and returns the full token stream (terminated by
 * an EOF token). Throws a PseudoError at the first unrecognised character.
 */
export function tokenize(source: string): Token[] {
  const lexer = new Lexer(source);
  const tokens: Token[] = [];
  for (;;) {
    const tok = lexer.nextToken();
    tokens.push(tok);
    if (tok.type === "EOF") break;
  }
  return tokens;
}
