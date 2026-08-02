/**
 * Token types and source position metadata, ported from `pseudogo-cli`'s
 * `internal/token` package. Token types are string literals rather than a
 * numeric enum so they're self-describing in test output and debuggers.
 */

export type TokenType =
  | "ILLEGAL"
  | "EOF"
  // Identifiers and literals
  | "IDENT"
  | "INT_LIT"
  | "REAL_LIT"
  | "STRING_LIT"
  | "CHAR_LIT"
  | "TRUE_LIT"
  | "FALSE_LIT"
  // Keywords
  | "PROGRAM"
  | "DICTIONARY"
  | "ALGORITHM"
  | "ENDPROGRAM"
  | "FUNCTION"
  | "ENDFUNCTION"
  | "PROCEDURE"
  | "ENDPROCEDURE"
  | "RETURN"
  | "IF"
  | "THEN"
  | "ELSE"
  | "ENDIF"
  | "FOR"
  | "TO"
  | "STEP"
  | "ENDFOR"
  | "WHILE"
  | "ENDWHILE"
  | "INPUT"
  | "OUTPUT"
  | "TYPE"
  | "STRUCT"
  | "ARRAY"
  | "OF"
  | "IN"
  | "OUT"
  | "INOUT"
  | "AND"
  | "OR"
  | "NOT"
  | "MOD"
  // Operators
  | "ASSIGN"
  | "EQ"
  | "NEQ"
  | "LT"
  | "GT"
  | "LTE"
  | "GTE"
  | "PLUS"
  | "MINUS"
  | "STAR"
  | "SLASH"
  // Delimiters
  | "LPAREN"
  | "RPAREN"
  | "LBRACKET"
  | "RBRACKET"
  | "COMMA"
  | "COLON"
  | "DOT"
  | "ARROW";

// Keyword lookup is case-insensitive: "Program", "PROGRAM", and "program"
// all resolve to the same token type. The canonical *display* form (see
// displayNames below) is uppercase for structural keywords and type names,
// but stays lowercase for true/false, matching the common convention of
// keeping boolean literals lowercase even in otherwise uppercase-keyword
// languages.
const keywords: Record<string, TokenType> = {
  program: "PROGRAM",
  dictionary: "DICTIONARY",
  algorithm: "ALGORITHM",
  endprogram: "ENDPROGRAM",
  function: "FUNCTION",
  endfunction: "ENDFUNCTION",
  procedure: "PROCEDURE",
  endprocedure: "ENDPROCEDURE",
  return: "RETURN",
  if: "IF",
  then: "THEN",
  else: "ELSE",
  endif: "ENDIF",
  for: "FOR",
  to: "TO",
  step: "STEP",
  endfor: "ENDFOR",
  while: "WHILE",
  endwhile: "ENDWHILE",
  input: "INPUT",
  output: "OUTPUT",
  type: "TYPE",
  struct: "STRUCT",
  array: "ARRAY",
  of: "OF",
  in: "IN",
  out: "OUT",
  and: "AND",
  or: "OR",
  not: "NOT",
  mod: "MOD",
  true: "TRUE_LIT",
  false: "FALSE_LIT",
};

/** Returns the keyword TokenType for an identifier's text (matched
 * case-insensitively), or IDENT if the text is not a reserved word. */
export function lookupIdent(ident: string): TokenType {
  return keywords[ident.toLowerCase()] ?? "IDENT";
}

export interface Pos {
  line: number;
  column: number;
}

export interface Token {
  type: TokenType;
  literal: string;
  pos: Pos;
}

const displayNames: Partial<Record<TokenType, string>> = {
  EOF: "end of file",
  ASSIGN: "=",
  EQ: "==",
  NEQ: "!=",
  LT: "<",
  GT: ">",
  LTE: "<=",
  GTE: ">=",
  PLUS: "+",
  MINUS: "-",
  STAR: "*",
  SLASH: "/",
  LPAREN: "(",
  RPAREN: ")",
  LBRACKET: "[",
  RBRACKET: "]",
  COMMA: ",",
  COLON: ":",
  DOT: ".",
  ARROW: "->",
  PROGRAM: "PROGRAM",
  DICTIONARY: "DICTIONARY",
  ALGORITHM: "ALGORITHM",
  ENDPROGRAM: "ENDPROGRAM",
  FUNCTION: "FUNCTION",
  ENDFUNCTION: "ENDFUNCTION",
  PROCEDURE: "PROCEDURE",
  ENDPROCEDURE: "ENDPROCEDURE",
  RETURN: "RETURN",
  TYPE: "TYPE",
  STRUCT: "STRUCT",
  ARRAY: "ARRAY",
  OF: "OF",
  IN: "IN",
  OUT: "OUT",
  INOUT: "IN/OUT",
  AND: "AND",
  OR: "OR",
  NOT: "NOT",
  MOD: "MOD",
  TRUE_LIT: "true",
  FALSE_LIT: "false",
};

/** Human-readable display form of a token type, for parser error messages. */
export function displayTokenType(t: TokenType): string {
  return displayNames[t] ?? t;
}
