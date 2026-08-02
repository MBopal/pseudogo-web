export const DEFAULT_PROGRAM = `-- Welcome to PseudoGo! Edit this, then click Run (or press Ctrl/Cmd+Enter).

FUNCTION factorial(n: INTEGER) -> INTEGER
DICTIONARY
ALGORITHM
	IF n <= 1 THEN
		RETURN 1
	ENDIF
	RETURN n * factorial(n - 1)
ENDFUNCTION

PROGRAM Main
DICTIONARY
	name: STRING
	n: INTEGER
ALGORITHM
	INPUT name
	OUTPUT "Hello,", name
	n = 5
	OUTPUT n, "factorial is", factorial(n)
ENDPROGRAM
`;
