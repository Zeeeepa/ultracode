// go-ast-cli.go
// Go AST CLI Parser
//
// Parses Go source code using the built-in go/parser package and outputs
// structured entity information in JSON format.
//
// Build: go build -o go-ast-cli go-ast-cli.go
// Usage: go-ast-cli <file_path>
//        go-ast-cli --stdin <file_path>
//
// Output: JSON with entities, relationships, and errors

package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// Location represents source code position
type Location struct {
	Start Position `json:"start"`
	End   Position `json:"end"`
}

type Position struct {
	Line   int `json:"line"`
	Column int `json:"column"`
	Index  int `json:"index"`
}

// CallInfo represents a function/method call
type CallInfo struct {
	Name          string `json:"name"`
	Target        string `json:"target,omitempty"`
	ArgumentCount int    `json:"argumentCount"`
	Line          int    `json:"line,omitempty"`
	IsDefer       bool   `json:"isDefer,omitempty"`
	IsGo          bool   `json:"isGo,omitempty"`
	IsBuiltin     bool   `json:"isBuiltin,omitempty"`
}

// ControlFlowInfo represents control flow within a function body
type ControlFlowInfo struct {
	Branches   []FlowItem   `json:"branches,omitempty"`
	Loops      []FlowItem   `json:"loops,omitempty"`
	Exceptions []FlowItem   `json:"exceptions,omitempty"`
	Returns    []ReturnInfo `json:"returns,omitempty"`
	Awaits     []FlowItem   `json:"awaits,omitempty"`
}

// FlowItem represents a single control flow element
type FlowItem struct {
	Type      string `json:"type"`
	Condition string `json:"condition,omitempty"`
	Line      int    `json:"line,omitempty"`
}

// ReturnInfo represents a return statement
type ReturnInfo struct {
	HasValue bool `json:"hasValue"`
	Line     int  `json:"line,omitempty"`
}

// Entity represents a parsed code entity
type Entity struct {
	ID          string                 `json:"id,omitempty"`
	Name        string                 `json:"name"`
	Type        string                 `json:"type"`
	FilePath    string                 `json:"filePath"`
	Location    Location               `json:"location"`
	Modifiers   []string               `json:"modifiers,omitempty"`
	Parameters  []Parameter            `json:"parameters,omitempty"`
	ReturnType  string                 `json:"returnType,omitempty"`
	Inheritance *Inheritance           `json:"inheritance,omitempty"`
	ImportData  *ImportData            `json:"importData,omitempty"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
	Calls       []CallInfo             `json:"calls,omitempty"`
	ControlFlow *ControlFlowInfo       `json:"controlFlow,omitempty"`
	Children    []Entity               `json:"children,omitempty"`
}

type Parameter struct {
	Name string `json:"name"`
	Type string `json:"type,omitempty"`
}

type Inheritance struct {
	BaseClasses []string `json:"baseClasses,omitempty"`
	Interfaces  []string `json:"interfaces,omitempty"`
}

type ImportData struct {
	Source     string      `json:"source"`
	Specifiers []Specifier `json:"specifiers,omitempty"`
	IsDefault  bool        `json:"isDefault,omitempty"`
}

type Specifier struct {
	Local    string `json:"local"`
	Imported string `json:"imported,omitempty"`
}

// Relationship represents a connection between entities
type Relationship struct {
	From     string                 `json:"from"`
	To       string                 `json:"to"`
	Type     string                 `json:"type"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

// ParseError represents a parsing error
type ParseError struct {
	Message  string            `json:"message"`
	Location map[string]int    `json:"location,omitempty"`
}

// ParseResult is the final output
type ParseResult struct {
	Entities      []Entity       `json:"entities"`
	Relationships []Relationship `json:"relationships"`
	Errors        []ParseError   `json:"errors"`
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "Usage: go-ast-cli <file_path>")
		fmt.Fprintln(os.Stderr, "       go-ast-cli --stdin <file_path>")
		os.Exit(1)
	}

	var content string
	var filePath string

	if os.Args[1] == "--stdin" {
		// Read from stdin
		data, err := io.ReadAll(os.Stdin)
		if err != nil {
			outputError(fmt.Sprintf("Failed to read stdin: %v", err))
			return
		}
		content = string(data)
		if len(os.Args) > 2 {
			filePath = os.Args[2]
		} else {
			filePath = "stdin.go"
		}
	} else {
		filePath = os.Args[1]
		data, err := os.ReadFile(filePath)
		if err != nil {
			outputError(fmt.Sprintf("Failed to read file: %v", err))
			return
		}
		content = string(data)
	}

	result := parseFile(filePath, content)

	output, err := json.Marshal(result)
	if err != nil {
		outputError(fmt.Sprintf("Failed to marshal JSON: %v", err))
		return
	}
	fmt.Println(string(output))
}

func outputError(msg string) {
	result := ParseResult{
		Entities:      []Entity{},
		Relationships: []Relationship{},
		Errors:        []ParseError{{Message: msg}},
	}
	output, _ := json.Marshal(result)
	fmt.Println(string(output))
}

func parseFile(filePath, content string) ParseResult {
	result := ParseResult{
		Entities:      []Entity{},
		Relationships: []Relationship{},
		Errors:        []ParseError{},
	}

	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, filePath, content, parser.ParseComments)
	if err != nil {
		result.Errors = append(result.Errors, ParseError{
			Message: fmt.Sprintf("Parse error: %v", err),
		})
		return result
	}

	// Package entity
	if file.Name != nil {
		result.Entities = append(result.Entities, Entity{
			ID:       fmt.Sprintf("%s:package:%s", filePath, file.Name.Name),
			Name:     file.Name.Name,
			Type:     "package",
			FilePath: filePath,
			Location: getLocation(fset, file.Name.Pos(), file.Name.End()),
		})
	}

	// Process imports
	for _, imp := range file.Imports {
		importPath := strings.Trim(imp.Path.Value, "\"")
		var localName string
		if imp.Name != nil {
			localName = imp.Name.Name
		} else {
			localName = filepath.Base(importPath)
		}

		entity := Entity{
			ID:       fmt.Sprintf("%s:import:%s", filePath, importPath),
			Name:     importPath,
			Type:     "import",
			FilePath: filePath,
			Location: getLocation(fset, imp.Pos(), imp.End()),
			ImportData: &ImportData{
				Source: importPath,
				Specifiers: []Specifier{{
					Local: localName,
				}},
			},
		}
		result.Entities = append(result.Entities, entity)

		// Import relationship
		result.Relationships = append(result.Relationships, Relationship{
			From: filePath,
			To:   importPath,
			Type: "imports",
		})
	}

	// Process declarations
	for _, decl := range file.Decls {
		switch d := decl.(type) {
		case *ast.FuncDecl:
			processFuncDecl(fset, filePath, d, &result)
		case *ast.GenDecl:
			processGenDecl(fset, filePath, d, &result)
		}
	}

	return result
}

func processFuncDecl(fset *token.FileSet, filePath string, decl *ast.FuncDecl, result *ParseResult) {
	name := decl.Name.Name
	entityType := "function"
	modifiers := []string{}

	// Check if it's a method (has receiver)
	var receiverType string
	if decl.Recv != nil && len(decl.Recv.List) > 0 {
		entityType = "method"
		recv := decl.Recv.List[0]
		receiverType = exprToString(recv.Type)
		// Prefix method name with receiver type
		name = receiverType + "." + name
	}

	// Check visibility (exported = uppercase first letter)
	if isExported(decl.Name.Name) {
		modifiers = append(modifiers, "public")
	} else {
		modifiers = append(modifiers, "private")
	}

	// Extract parameters
	params := []Parameter{}
	if decl.Type.Params != nil {
		for _, field := range decl.Type.Params.List {
			paramType := exprToString(field.Type)
			if len(field.Names) > 0 {
				for _, name := range field.Names {
					params = append(params, Parameter{
						Name: name.Name,
						Type: paramType,
					})
				}
			} else {
				params = append(params, Parameter{
					Type: paramType,
				})
			}
		}
	}

	// Extract return type
	returnType := ""
	if decl.Type.Results != nil {
		returns := []string{}
		for _, field := range decl.Type.Results.List {
			returns = append(returns, exprToString(field.Type))
		}
		returnType = strings.Join(returns, ", ")
		if len(returns) > 1 {
			returnType = "(" + returnType + ")"
		}
	}

	entity := Entity{
		ID:         fmt.Sprintf("%s:%s:%s", filePath, entityType, name),
		Name:       name,
		Type:       entityType,
		FilePath:   filePath,
		Location:   getLocation(fset, decl.Pos(), decl.End()),
		Modifiers:  modifiers,
		Parameters: params,
		ReturnType: returnType,
	}

	// Extract calls and control flow from function body
	if decl.Body != nil {
		calls, controlFlow := extractFunctionBody(fset, decl.Body)
		entity.Calls = calls
		if controlFlow != nil {
			entity.ControlFlow = controlFlow
		}

		for _, call := range calls {
			qualifiedName := call.Name
			if call.Target != "" {
				qualifiedName = call.Target + "." + call.Name
			}
			result.Relationships = append(result.Relationships, Relationship{
				From: name,
				To:   qualifiedName,
				Type: "calls",
				Metadata: map[string]interface{}{
					"line": call.Line,
				},
			})
		}
	}

	result.Entities = append(result.Entities, entity)

	// Method contains + member_of relationships
	if receiverType != "" {
		result.Relationships = append(result.Relationships, Relationship{
			From: receiverType,
			To:   name,
			Type: "contains",
		})
		result.Relationships = append(result.Relationships, Relationship{
			From: name,
			To:   receiverType,
			Type: "member_of",
		})
	}
}

func processGenDecl(fset *token.FileSet, filePath string, decl *ast.GenDecl, result *ParseResult) {
	for _, spec := range decl.Specs {
		switch s := spec.(type) {
		case *ast.TypeSpec:
			processTypeSpec(fset, filePath, s, result)
		case *ast.ValueSpec:
			processValueSpec(fset, filePath, s, decl.Tok, result)
		}
	}
}

func processTypeSpec(fset *token.FileSet, filePath string, spec *ast.TypeSpec, result *ParseResult) {
	name := spec.Name.Name
	modifiers := []string{}

	if isExported(name) {
		modifiers = append(modifiers, "public")
	} else {
		modifiers = append(modifiers, "private")
	}

	var entityType string
	var inheritance *Inheritance

	var children []Entity

	switch t := spec.Type.(type) {
	case *ast.StructType:
		entityType = "class" // struct as class
		// Process struct fields
		if t.Fields != nil {
			for _, field := range t.Fields.List {
				fieldChildren := processStructField(fset, filePath, name, field, result)
				children = append(children, fieldChildren...)
			}
		}

	case *ast.InterfaceType:
		entityType = "interface"
		// Process interface methods
		if t.Methods != nil {
			for _, method := range t.Methods.List {
				methodChildren := processInterfaceMethod(fset, filePath, name, method, result)
				children = append(children, methodChildren...)
			}
		}

	case *ast.Ident:
		// Type alias
		entityType = "type"
		inheritance = &Inheritance{
			BaseClasses: []string{t.Name},
		}

	case *ast.SelectorExpr:
		// Type alias to qualified type
		entityType = "type"
		inheritance = &Inheritance{
			BaseClasses: []string{exprToString(t)},
		}

	case *ast.ArrayType, *ast.MapType, *ast.ChanType:
		entityType = "type"

	default:
		entityType = "type"
	}

	entity := Entity{
		ID:          fmt.Sprintf("%s:%s:%s", filePath, entityType, name),
		Name:        name,
		Type:        entityType,
		FilePath:    filePath,
		Location:    getLocation(fset, spec.Pos(), spec.End()),
		Modifiers:   modifiers,
		Inheritance: inheritance,
	}
	if len(children) > 0 {
		entity.Children = children
	}
	result.Entities = append(result.Entities, entity)
}

func processStructField(fset *token.FileSet, filePath string, structName string, field *ast.Field, result *ParseResult) []Entity {
	fieldType := exprToString(field.Type)
	var children []Entity

	if len(field.Names) > 0 {
		for _, fieldName := range field.Names {
			modifiers := []string{}
			if isExported(fieldName.Name) {
				modifiers = append(modifiers, "public")
			} else {
				modifiers = append(modifiers, "private")
			}

			fullName := structName + "." + fieldName.Name
			entity := Entity{
				ID:        fmt.Sprintf("%s:property:%s", filePath, fullName),
				Name:      fullName,
				Type:      "property",
				FilePath:  filePath,
				Location:  getLocation(fset, field.Pos(), field.End()),
				Modifiers: modifiers,
				Metadata: map[string]interface{}{
					"fieldType": fieldType,
				},
			}
			result.Entities = append(result.Entities, entity)
			children = append(children, entity)

			// Contains relationship
			result.Relationships = append(result.Relationships, Relationship{
				From: structName,
				To:   fullName,
				Type: "contains",
			})
			// Member_of relationship
			result.Relationships = append(result.Relationships, Relationship{
				From: fullName,
				To:   structName,
				Type: "member_of",
			})
		}
	} else {
		// Embedded field
		fullName := structName + "." + fieldType
		entity := Entity{
			ID:       fmt.Sprintf("%s:property:%s", filePath, fullName),
			Name:     fullName,
			Type:     "property",
			FilePath: filePath,
			Location: getLocation(fset, field.Pos(), field.End()),
			Modifiers: []string{"embedded"},
			Metadata: map[string]interface{}{
				"fieldType": fieldType,
				"embedded":  true,
			},
		}
		result.Entities = append(result.Entities, entity)
		children = append(children, entity)

		// Embedded type = inheritance
		result.Relationships = append(result.Relationships, Relationship{
			From: structName,
			To:   fieldType,
			Type: "inherits",
		})
	}

	return children
}

func processInterfaceMethod(fset *token.FileSet, filePath string, interfaceName string, method *ast.Field, result *ParseResult) []Entity {
	var children []Entity

	if len(method.Names) == 0 {
		// Embedded interface
		embeddedType := exprToString(method.Type)
		result.Relationships = append(result.Relationships, Relationship{
			From: interfaceName,
			To:   embeddedType,
			Type: "inherits",
		})
		return children
	}

	for _, methodName := range method.Names {
		fullName := interfaceName + "." + methodName.Name

		// Extract method signature
		params := []Parameter{}
		returnType := ""

		if funcType, ok := method.Type.(*ast.FuncType); ok {
			if funcType.Params != nil {
				for _, p := range funcType.Params.List {
					paramType := exprToString(p.Type)
					if len(p.Names) > 0 {
						for _, n := range p.Names {
							params = append(params, Parameter{
								Name: n.Name,
								Type: paramType,
							})
						}
					} else {
						params = append(params, Parameter{Type: paramType})
					}
				}
			}

			if funcType.Results != nil {
				returns := []string{}
				for _, r := range funcType.Results.List {
					returns = append(returns, exprToString(r.Type))
				}
				returnType = strings.Join(returns, ", ")
				if len(returns) > 1 {
					returnType = "(" + returnType + ")"
				}
			}
		}

		entity := Entity{
			ID:         fmt.Sprintf("%s:method:%s", filePath, fullName),
			Name:       fullName,
			Type:       "method",
			FilePath:   filePath,
			Location:   getLocation(fset, method.Pos(), method.End()),
			Parameters: params,
			ReturnType: returnType,
			Modifiers:  []string{"abstract"}, // Interface methods are abstract
		}
		result.Entities = append(result.Entities, entity)
		children = append(children, entity)

		result.Relationships = append(result.Relationships, Relationship{
			From: interfaceName,
			To:   fullName,
			Type: "contains",
		})
		result.Relationships = append(result.Relationships, Relationship{
			From: fullName,
			To:   interfaceName,
			Type: "member_of",
		})
	}

	return children
}

func processValueSpec(fset *token.FileSet, filePath string, spec *ast.ValueSpec, tok token.Token, result *ParseResult) {
	entityType := "variable"
	modifiers := []string{}

	if tok == token.CONST {
		entityType = "constant"
		modifiers = append(modifiers, "const")
	}

	valueType := ""
	if spec.Type != nil {
		valueType = exprToString(spec.Type)
	}

	for _, name := range spec.Names {
		if name.Name == "_" {
			continue // Skip blank identifier
		}

		entityModifiers := make([]string, len(modifiers))
		copy(entityModifiers, modifiers)

		if isExported(name.Name) {
			entityModifiers = append(entityModifiers, "public")
		} else {
			entityModifiers = append(entityModifiers, "private")
		}

		entity := Entity{
			ID:        fmt.Sprintf("%s:%s:%s", filePath, entityType, name.Name),
			Name:      name.Name,
			Type:      entityType,
			FilePath:  filePath,
			Location:  getLocation(fset, spec.Pos(), spec.End()),
			Modifiers: entityModifiers,
		}

		if valueType != "" {
			entity.Metadata = map[string]interface{}{
				"valueType": valueType,
			}
		}

		result.Entities = append(result.Entities, entity)
	}
}

// Go builtin functions
var goBuiltins = map[string]bool{
	"make": true, "append": true, "len": true, "cap": true,
	"delete": true, "close": true, "panic": true, "recover": true,
	"new": true, "copy": true, "print": true, "println": true,
	"complex": true, "real": true, "imag": true,
}

// extractFunctionBody walks the AST of a function body and extracts calls and control flow
func extractFunctionBody(fset *token.FileSet, body *ast.BlockStmt) ([]CallInfo, *ControlFlowInfo) {
	calls := []CallInfo{}
	seen := map[string]bool{}
	cf := &ControlFlowInfo{}

	ast.Inspect(body, func(n ast.Node) bool {
		if n == nil {
			return false
		}

		switch node := n.(type) {
		case *ast.GoStmt:
			// Goroutine: go func()
			call := extractCallFromExpr(fset, node.Call)
			if call != nil {
				call.IsGo = true
				key := callKey(call)
				if !seen[key] {
					seen[key] = true
					calls = append(calls, *call)
				}
			}
			cf.Awaits = append(cf.Awaits, FlowItem{
				Type: "goroutine",
				Line: fset.Position(node.Pos()).Line,
			})
			return true

		case *ast.DeferStmt:
			// Defer: defer f.Close()
			call := extractCallFromExpr(fset, node.Call)
			if call != nil {
				call.IsDefer = true
				key := callKey(call)
				if !seen[key] {
					seen[key] = true
					calls = append(calls, *call)
				}
			}
			cf.Exceptions = append(cf.Exceptions, FlowItem{
				Type: "defer",
				Line: fset.Position(node.Pos()).Line,
			})
			return true

		case *ast.CallExpr:
			call := extractCallFromExpr(fset, node)
			if call != nil {
				// Check for panic/recover builtins as control flow
				if call.Name == "panic" {
					cf.Exceptions = append(cf.Exceptions, FlowItem{
						Type: "panic",
						Line: call.Line,
					})
				} else if call.Name == "recover" {
					cf.Exceptions = append(cf.Exceptions, FlowItem{
						Type: "recover",
						Line: call.Line,
					})
				}

				key := callKey(call)
				if !seen[key] {
					seen[key] = true
					calls = append(calls, *call)
				}
			}

		case *ast.IfStmt:
			condition := ""
			if node.Cond != nil {
				condition = exprToString(node.Cond)
			}
			cf.Branches = append(cf.Branches, FlowItem{
				Type:      "if",
				Condition: condition,
				Line:      fset.Position(node.Pos()).Line,
			})
			// Check for else-if chains
			if node.Else != nil {
				if _, ok := node.Else.(*ast.IfStmt); ok {
					cf.Branches = append(cf.Branches, FlowItem{
						Type: "else-if",
						Line: fset.Position(node.Else.Pos()).Line,
					})
				} else {
					cf.Branches = append(cf.Branches, FlowItem{
						Type: "else",
						Line: fset.Position(node.Else.Pos()).Line,
					})
				}
			}

		case *ast.SwitchStmt:
			condition := ""
			if node.Tag != nil {
				condition = exprToString(node.Tag)
			}
			cf.Branches = append(cf.Branches, FlowItem{
				Type:      "switch",
				Condition: condition,
				Line:      fset.Position(node.Pos()).Line,
			})

		case *ast.TypeSwitchStmt:
			cf.Branches = append(cf.Branches, FlowItem{
				Type: "type-switch",
				Line: fset.Position(node.Pos()).Line,
			})

		case *ast.SelectStmt:
			cf.Branches = append(cf.Branches, FlowItem{
				Type: "select",
				Line: fset.Position(node.Pos()).Line,
			})

		case *ast.CaseClause:
			cf.Branches = append(cf.Branches, FlowItem{
				Type: "case",
				Line: fset.Position(node.Pos()).Line,
			})

		case *ast.ForStmt:
			cf.Loops = append(cf.Loops, FlowItem{
				Type: "for",
				Line: fset.Position(node.Pos()).Line,
			})

		case *ast.RangeStmt:
			cf.Loops = append(cf.Loops, FlowItem{
				Type: "for-range",
				Line: fset.Position(node.Pos()).Line,
			})

		case *ast.ReturnStmt:
			cf.Returns = append(cf.Returns, ReturnInfo{
				HasValue: len(node.Results) > 0,
				Line:     fset.Position(node.Pos()).Line,
			})

		case *ast.SendStmt:
			cf.Awaits = append(cf.Awaits, FlowItem{
				Type: "channel-send",
				Line: fset.Position(node.Pos()).Line,
			})

		case *ast.UnaryExpr:
			// Channel receive: <-ch
			if node.Op == token.ARROW {
				cf.Awaits = append(cf.Awaits, FlowItem{
					Type: "channel-recv",
					Line: fset.Position(node.Pos()).Line,
				})
			}
		}

		return true
	})

	// Return nil controlFlow if empty
	if len(cf.Branches) == 0 && len(cf.Loops) == 0 && len(cf.Exceptions) == 0 &&
		len(cf.Returns) == 0 && len(cf.Awaits) == 0 {
		return calls, nil
	}

	return calls, cf
}

// extractCallFromExpr extracts call info from a CallExpr
func extractCallFromExpr(fset *token.FileSet, call *ast.CallExpr) *CallInfo {
	info := &CallInfo{
		ArgumentCount: len(call.Args),
		Line:          fset.Position(call.Pos()).Line,
	}

	switch fun := call.Fun.(type) {
	case *ast.Ident:
		// Simple call: foo()
		info.Name = fun.Name
		if goBuiltins[fun.Name] {
			info.IsBuiltin = true
		}
	case *ast.SelectorExpr:
		// Method/qualified call: pkg.Foo() or obj.Method()
		info.Name = fun.Sel.Name
		info.Target = exprToString(fun.X)
	case *ast.FuncLit:
		// Anonymous function call — skip
		return nil
	case *ast.ParenExpr:
		// Type conversion: int(x) — skip
		return nil
	case *ast.ArrayType:
		// Type conversion: []byte(s) — skip
		return nil
	case *ast.IndexExpr:
		// Generic instantiation: foo[T]() — extract base
		if ident, ok := fun.X.(*ast.Ident); ok {
			info.Name = ident.Name
		} else if sel, ok := fun.X.(*ast.SelectorExpr); ok {
			info.Name = sel.Sel.Name
			info.Target = exprToString(sel.X)
		} else {
			return nil
		}
	default:
		return nil
	}

	return info
}

// callKey generates a dedup key for a call
func callKey(c *CallInfo) string {
	if c.Target != "" {
		return c.Target + "." + c.Name
	}
	return c.Name
}

func getLocation(fset *token.FileSet, start, end token.Pos) Location {
	startPos := fset.Position(start)
	endPos := fset.Position(end)

	return Location{
		Start: Position{
			Line:   startPos.Line,
			Column: startPos.Column - 1, // 0-indexed
			Index:  startPos.Offset,
		},
		End: Position{
			Line:   endPos.Line,
			Column: endPos.Column - 1,
			Index:  endPos.Offset,
		},
	}
}

func exprToString(expr ast.Expr) string {
	switch t := expr.(type) {
	case *ast.Ident:
		return t.Name
	case *ast.SelectorExpr:
		return exprToString(t.X) + "." + t.Sel.Name
	case *ast.StarExpr:
		return "*" + exprToString(t.X)
	case *ast.ArrayType:
		if t.Len == nil {
			return "[]" + exprToString(t.Elt)
		}
		return "[...]" + exprToString(t.Elt)
	case *ast.MapType:
		return "map[" + exprToString(t.Key) + "]" + exprToString(t.Value)
	case *ast.ChanType:
		switch t.Dir {
		case ast.SEND:
			return "chan<- " + exprToString(t.Value)
		case ast.RECV:
			return "<-chan " + exprToString(t.Value)
		default:
			return "chan " + exprToString(t.Value)
		}
	case *ast.FuncType:
		return "func"
	case *ast.InterfaceType:
		return "interface{}"
	case *ast.StructType:
		return "struct{}"
	case *ast.Ellipsis:
		return "..." + exprToString(t.Elt)
	case *ast.BinaryExpr:
		return exprToString(t.X) + " " + t.Op.String() + " " + exprToString(t.Y)
	case *ast.UnaryExpr:
		return t.Op.String() + exprToString(t.X)
	case *ast.BasicLit:
		return t.Value
	case *ast.CompositeLit:
		if t.Type != nil {
			return exprToString(t.Type) + "{}"
		}
		return "{}"
	case *ast.CallExpr:
		return exprToString(t.Fun) + "(...)"
	case *ast.IndexExpr:
		return exprToString(t.X) + "[" + exprToString(t.Index) + "]"
	case *ast.ParenExpr:
		return "(" + exprToString(t.X) + ")"
	case *ast.KeyValueExpr:
		return exprToString(t.Key) + ": " + exprToString(t.Value)
	case *ast.TypeAssertExpr:
		if t.Type != nil {
			return exprToString(t.X) + ".(" + exprToString(t.Type) + ")"
		}
		return exprToString(t.X) + ".(type)"
	case nil:
		return ""
	default:
		return "unknown"
	}
}

func isExported(name string) bool {
	if len(name) == 0 {
		return false
	}
	return name[0] >= 'A' && name[0] <= 'Z'
}
