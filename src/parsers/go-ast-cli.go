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

// Entity represents a parsed code entity
type Entity struct {
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
		Name:       name,
		Type:       entityType,
		FilePath:   filePath,
		Location:   getLocation(fset, decl.Pos(), decl.End()),
		Modifiers:  modifiers,
		Parameters: params,
		ReturnType: returnType,
	}
	result.Entities = append(result.Entities, entity)

	// Method contains relationship
	if receiverType != "" {
		result.Relationships = append(result.Relationships, Relationship{
			From: receiverType,
			To:   name,
			Type: "contains",
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

	switch t := spec.Type.(type) {
	case *ast.StructType:
		entityType = "class" // struct as class
		// Process struct fields
		if t.Fields != nil {
			for _, field := range t.Fields.List {
				processStructField(fset, filePath, name, field, result)
			}
		}

	case *ast.InterfaceType:
		entityType = "interface"
		// Process interface methods
		if t.Methods != nil {
			for _, method := range t.Methods.List {
				processInterfaceMethod(fset, filePath, name, method, result)
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
		Name:        name,
		Type:        entityType,
		FilePath:    filePath,
		Location:    getLocation(fset, spec.Pos(), spec.End()),
		Modifiers:   modifiers,
		Inheritance: inheritance,
	}
	result.Entities = append(result.Entities, entity)
}

func processStructField(fset *token.FileSet, filePath string, structName string, field *ast.Field, result *ParseResult) {
	fieldType := exprToString(field.Type)

	if len(field.Names) > 0 {
		for _, fieldName := range field.Names {
			modifiers := []string{}
			if isExported(fieldName.Name) {
				modifiers = append(modifiers, "public")
			} else {
				modifiers = append(modifiers, "private")
			}

			entity := Entity{
				Name:      structName + "." + fieldName.Name,
				Type:      "property",
				FilePath:  filePath,
				Location:  getLocation(fset, field.Pos(), field.End()),
				Modifiers: modifiers,
				Metadata: map[string]interface{}{
					"fieldType": fieldType,
				},
			}
			result.Entities = append(result.Entities, entity)

			// Contains relationship
			result.Relationships = append(result.Relationships, Relationship{
				From: structName,
				To:   structName + "." + fieldName.Name,
				Type: "contains",
			})
		}
	} else {
		// Embedded field
		entity := Entity{
			Name:     structName + "." + fieldType,
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

		// Embedded type = inheritance
		result.Relationships = append(result.Relationships, Relationship{
			From: structName,
			To:   fieldType,
			Type: "inherits",
		})
	}
}

func processInterfaceMethod(fset *token.FileSet, filePath string, interfaceName string, method *ast.Field, result *ParseResult) {
	if len(method.Names) == 0 {
		// Embedded interface
		embeddedType := exprToString(method.Type)
		result.Relationships = append(result.Relationships, Relationship{
			From: interfaceName,
			To:   embeddedType,
			Type: "inherits",
		})
		return
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
			Name:       fullName,
			Type:       "method",
			FilePath:   filePath,
			Location:   getLocation(fset, method.Pos(), method.End()),
			Parameters: params,
			ReturnType: returnType,
			Modifiers:  []string{"abstract"}, // Interface methods are abstract
		}
		result.Entities = append(result.Entities, entity)

		result.Relationships = append(result.Relationships, Relationship{
			From: interfaceName,
			To:   fullName,
			Type: "contains",
		})
	}
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
