export const DEFAULT_PROGRAM = `-- Welcome to PseudoGo! Edit this, then click Run (or press Ctrl/Cmd+Enter).

function factorial(n: Integer) -> Integer
Dictionary
Algorithm
	IF n <= 1 THEN
		return 1
	ENDIF
	return n * factorial(n - 1)
Endfunction

Program Main
Dictionary
	name: String
	n: Integer
Algorithm
	INPUT name
	OUTPUT "Hello,", name
	n = 5
	OUTPUT n, "factorial is", factorial(n)
Endprogram
`;
