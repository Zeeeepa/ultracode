#!/usr/bin/env python3
"""
Python AST CLI Parser

Parses Python source code using the built-in ast module and outputs
structured entity information in JSON format.

Usage:
    python python-ast-cli.py <file_path>
    python python-ast-cli.py --stdin

Output: JSON array of entities
"""

import ast
import json
import sys
from typing import Any


def get_location(node: ast.AST) -> dict:
    """Get location info from AST node."""
    return {
        "start": {
            "line": getattr(node, "lineno", 1),
            "column": getattr(node, "col_offset", 0),
            "index": 0,
        },
        "end": {
            "line": getattr(node, "end_lineno", getattr(node, "lineno", 1)),
            "column": getattr(node, "end_col_offset", 0),
            "index": 0,
        },
    }


def get_decorators(node: ast.AST) -> list[dict] | None:
    """Extract decorator information from a node."""
    if not hasattr(node, "decorator_list") or not node.decorator_list:
        return None

    decorators = []
    for dec in node.decorator_list:
        if isinstance(dec, ast.Name):
            decorators.append({"name": dec.id})
        elif isinstance(dec, ast.Attribute):
            decorators.append({"name": f"{get_attribute_name(dec)}"})
        elif isinstance(dec, ast.Call):
            if isinstance(dec.func, ast.Name):
                name = dec.func.id
            elif isinstance(dec.func, ast.Attribute):
                name = get_attribute_name(dec.func)
            else:
                name = ast.unparse(dec.func) if hasattr(ast, "unparse") else str(dec.func)

            args = []
            for arg in dec.args:
                try:
                    args.append(ast.unparse(arg) if hasattr(ast, "unparse") else str(arg))
                except:
                    args.append("...")
            decorators.append({"name": name, "arguments": args if args else None})

    return decorators if decorators else None


def get_attribute_name(node: ast.Attribute) -> str:
    """Get full name from attribute node."""
    parts = []
    current = node
    while isinstance(current, ast.Attribute):
        parts.append(current.attr)
        current = current.value
    if isinstance(current, ast.Name):
        parts.append(current.id)
    return ".".join(reversed(parts))


def get_function_params(node: ast.FunctionDef | ast.AsyncFunctionDef) -> list[dict]:
    """Extract function parameters."""
    params = []
    args = node.args

    # Positional args
    defaults_start = len(args.args) - len(args.defaults)
    for i, arg in enumerate(args.args):
        param = {"name": arg.arg}
        if arg.annotation:
            try:
                param["type"] = ast.unparse(arg.annotation) if hasattr(ast, "unparse") else str(arg.annotation)
            except:
                pass
        if i >= defaults_start:
            param["optional"] = True
        params.append(param)

    # *args
    if args.vararg:
        param = {"name": f"*{args.vararg.arg}"}
        if args.vararg.annotation:
            try:
                param["type"] = ast.unparse(args.vararg.annotation)
            except:
                pass
        params.append(param)

    # **kwargs
    if args.kwarg:
        param = {"name": f"**{args.kwarg.arg}"}
        if args.kwarg.annotation:
            try:
                param["type"] = ast.unparse(args.kwarg.annotation)
            except:
                pass
        params.append(param)

    return params


def get_bases(node: ast.ClassDef) -> dict | None:
    """Extract class inheritance."""
    base_classes = []
    for base in node.bases:
        try:
            if isinstance(base, ast.Name):
                base_classes.append(base.id)
            elif isinstance(base, ast.Attribute):
                base_classes.append(get_attribute_name(base))
            elif isinstance(base, ast.Subscript):
                # Generic types like List[int]
                base_classes.append(ast.unparse(base) if hasattr(ast, "unparse") else str(base))
            else:
                base_classes.append(ast.unparse(base) if hasattr(ast, "unparse") else str(base))
        except:
            pass

    if not base_classes:
        return None

    return {"baseClasses": base_classes, "interfaces": []}


def process_function(node: ast.FunctionDef | ast.AsyncFunctionDef, file_path: str, class_name: str | None = None) -> dict:
    """Process a function/method definition."""
    is_async = isinstance(node, ast.AsyncFunctionDef)
    is_method = class_name is not None

    name = f"{class_name}.{node.name}" if class_name else node.name

    entity = {
        "name": name,
        "type": "async_function" if is_async else ("method" if is_method else "function"),
        "filePath": file_path,
        "location": get_location(node),
    }

    # Modifiers
    modifiers = []
    if is_async:
        modifiers.append("async")
    if node.name.startswith("_") and not node.name.startswith("__"):
        modifiers.append("private")
    if node.name.startswith("__") and node.name.endswith("__"):
        modifiers.append("magic")

    decorators = get_decorators(node)
    if decorators:
        for dec in decorators:
            if dec["name"] in ("staticmethod", "classmethod", "property", "abstractmethod"):
                modifiers.append(dec["name"])

    if modifiers:
        entity["modifiers"] = modifiers

    # Parameters
    params = get_function_params(node)
    if params:
        entity["parameters"] = params

    # Return type
    if node.returns:
        try:
            entity["returnType"] = ast.unparse(node.returns) if hasattr(ast, "unparse") else str(node.returns)
        except:
            pass

    # Decorators
    if decorators:
        entity["decorators"] = decorators

    return entity


def process_class(node: ast.ClassDef, file_path: str) -> list[dict]:
    """Process a class definition and its members."""
    entities = []

    # Class entity
    class_entity = {
        "name": node.name,
        "type": "class",
        "filePath": file_path,
        "location": get_location(node),
        "children": [],
    }

    # Inheritance
    inheritance = get_bases(node)
    if inheritance:
        class_entity["inheritance"] = inheritance

    # Decorators
    decorators = get_decorators(node)
    if decorators:
        class_entity["decorators"] = decorators
        # Check for special decorators
        modifiers = []
        for dec in decorators:
            if dec["name"] == "dataclass":
                modifiers.append("dataclass")
            elif dec["name"] == "abstractmethod" or dec["name"] == "ABC":
                modifiers.append("abstract")
        if modifiers:
            class_entity["modifiers"] = modifiers

    entities.append(class_entity)

    # Process class body
    for item in node.body:
        if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
            entities.append(process_function(item, file_path, node.name))
        elif isinstance(item, ast.ClassDef):
            # Nested class
            nested = process_class(item, file_path)
            for e in nested:
                if e["name"] == item.name:
                    e["name"] = f"{node.name}.{item.name}"
            entities.extend(nested)
        elif isinstance(item, ast.AnnAssign):
            # Annotated assignment (class attribute with type hint)
            if isinstance(item.target, ast.Name):
                attr_entity = {
                    "name": f"{node.name}.{item.target.id}",
                    "type": "property",
                    "filePath": file_path,
                    "location": get_location(item),
                }
                if item.annotation:
                    try:
                        attr_entity["metadata"] = {
                            "propertyType": ast.unparse(item.annotation) if hasattr(ast, "unparse") else str(item.annotation)
                        }
                    except:
                        pass
                entities.append(attr_entity)
        elif isinstance(item, ast.Assign):
            # Class attributes
            for target in item.targets:
                if isinstance(target, ast.Name):
                    entities.append({
                        "name": f"{node.name}.{target.id}",
                        "type": "property",
                        "filePath": file_path,
                        "location": get_location(item),
                    })

    return entities


def process_import(node: ast.Import | ast.ImportFrom, file_path: str) -> list[dict]:
    """Process import statements."""
    entities = []

    if isinstance(node, ast.Import):
        for alias in node.names:
            entities.append({
                "name": alias.name,
                "type": "import",
                "filePath": file_path,
                "location": get_location(node),
                "metadata": {
                    "importData": {
                        "source": alias.name,
                        "specifiers": [{"local": alias.asname or alias.name.split(".")[-1]}],
                        "isDefault": False,
                        "isNamespace": True,
                    }
                }
            })
    else:  # ImportFrom
        module = node.module or ""
        for alias in node.names:
            import_name = f"{module}.{alias.name}" if module else alias.name
            is_wildcard = alias.name == "*"
            entities.append({
                "name": import_name,
                "type": "import",
                "filePath": file_path,
                "location": get_location(node),
                "metadata": {
                    "importData": {
                        "source": module,
                        "specifiers": [] if is_wildcard else [{"local": alias.asname or alias.name}],
                        "isDefault": False,
                        "isNamespace": is_wildcard,
                    }
                }
            })

    return entities


def parse_file(file_path: str, content: str) -> dict:
    """Parse Python file and extract entities."""
    entities = []
    relationships = []
    errors = []

    try:
        tree = ast.parse(content, filename=file_path)

        # Module entity
        module_name = file_path.split("/")[-1].split("\\")[-1]
        entities.append({
            "name": module_name,
            "type": "module",
            "filePath": file_path,
            "location": {"start": {"line": 1, "column": 0, "index": 0}, "end": {"line": 1, "column": 0, "index": 0}},
        })

        # Process top-level nodes
        for node in ast.walk(tree):
            if isinstance(node, ast.Module):
                for item in node.body:
                    if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        entities.append(process_function(item, file_path))
                    elif isinstance(item, ast.ClassDef):
                        entities.extend(process_class(item, file_path))
                    elif isinstance(item, (ast.Import, ast.ImportFrom)):
                        entities.extend(process_import(item, file_path))
                    elif isinstance(item, ast.Assign):
                        # Module-level constants
                        for target in item.targets:
                            if isinstance(target, ast.Name) and target.id.isupper():
                                entities.append({
                                    "name": target.id,
                                    "type": "constant",
                                    "filePath": file_path,
                                    "location": get_location(item),
                                })
                    elif isinstance(item, ast.AnnAssign):
                        # Annotated module-level assignment
                        if isinstance(item.target, ast.Name):
                            is_const = item.target.id.isupper()
                            entities.append({
                                "name": item.target.id,
                                "type": "constant" if is_const else "variable",
                                "filePath": file_path,
                                "location": get_location(item),
                            })
                break  # Only process the top-level Module

        # Build relationships
        for entity in entities:
            if entity["type"] == "import":
                relationships.append({
                    "from": file_path,
                    "to": entity["name"],
                    "type": "imports",
                    "metadata": {},
                })
            elif entity["type"] == "class" and "inheritance" in entity:
                for base in entity["inheritance"].get("baseClasses", []):
                    relationships.append({
                        "from": entity["name"],
                        "to": base,
                        "type": "inherits",
                        "metadata": {},
                    })
            elif entity["type"] in ("method", "function") and "." in entity["name"]:
                class_name = entity["name"].rsplit(".", 1)[0]
                relationships.append({
                    "from": class_name,
                    "to": entity["name"],
                    "type": "contains",
                    "metadata": {},
                })

    except SyntaxError as e:
        errors.append({
            "message": f"Syntax error: {e.msg}",
            "location": {"line": e.lineno or 1, "column": e.offset or 0},
        })
    except Exception as e:
        errors.append({"message": str(e)})

    return {
        "entities": entities,
        "relationships": relationships,
        "errors": errors,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python python-ast-cli.py <file_path>", file=sys.stderr)
        print("       python python-ast-cli.py --stdin", file=sys.stderr)
        sys.exit(1)

    if sys.argv[1] == "--stdin":
        # Read from stdin
        content = sys.stdin.read()
        file_path = sys.argv[2] if len(sys.argv) > 2 else "stdin.py"
    else:
        file_path = sys.argv[1]
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception as e:
            result = {"entities": [], "relationships": [], "errors": [{"message": str(e)}]}
            print(json.dumps(result))
            sys.exit(1)

    result = parse_file(file_path, content)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
