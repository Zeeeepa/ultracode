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


def get_call_target(node: ast.expr) -> str | None:
    """
    Get target of a method call (obj in obj.method()).

    Args:
        node: The AST expression representing the call target

    Returns:
        String representation of the target, or None if not determinable
    """
    if isinstance(node, ast.Name):
        return node.id  # obj.method() -> "obj"
    elif isinstance(node, ast.Attribute):
        return get_attribute_name(node)  # a.b.method() -> "a.b"
    elif isinstance(node, ast.Call):
        # func().method() -> "func()"
        try:
            return ast.unparse(node) if hasattr(ast, "unparse") else None
        except:
            return None
    elif isinstance(node, ast.Subscript):
        # arr[0].method() -> "arr[0]"
        try:
            return ast.unparse(node) if hasattr(ast, "unparse") else None
        except:
            return None
    return None


def extract_calls_from_body(body: list[ast.stmt], container_name: str) -> list[dict]:
    """
    Extract all function/method calls from a function body.

    Args:
        body: AST nodes of the function body
        container_name: Name of the function/method containing the calls

    Returns:
        List of dictionaries with call information
    """
    calls = []

    for node in ast.walk(ast.Module(body=body, type_ignores=[])):
        if isinstance(node, ast.Call):
            call_info = {
                "line": getattr(node, "lineno", 0),
                "col": getattr(node, "col_offset", 0),
                "argumentCount": len(node.args) + len(node.keywords),
            }

            # Simple call: foo()
            if isinstance(node.func, ast.Name):
                call_info["name"] = node.func.id
                call_info["target"] = None

            # Method call: obj.method() or self.method()
            elif isinstance(node.func, ast.Attribute):
                call_info["name"] = node.func.attr
                call_info["target"] = get_call_target(node.func.value)

            # Complex call: func()() or arr[0]()
            else:
                try:
                    call_info["name"] = ast.unparse(node.func) if hasattr(ast, "unparse") else "unknown"
                    call_info["target"] = None
                except:
                    continue

            # Extract keyword arguments (e.g., inplace=True, shell=True)
            if node.keywords:
                kwargs = {}
                for kw in node.keywords:
                    if kw.arg is not None:
                        try:
                            kwargs[kw.arg] = ast.unparse(kw.value) if hasattr(ast, "unparse") else repr(kw.value)
                        except:
                            kwargs[kw.arg] = "..."
                if kwargs:
                    call_info["kwargs"] = kwargs

            call_info["container"] = container_name
            calls.append(call_info)

    return calls


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


def extract_control_flow(node: ast.FunctionDef | ast.AsyncFunctionDef) -> dict | None:
    """Extract control flow info: loops, exceptions, awaits, branches."""
    loops = []
    exceptions = []
    awaits = []
    branches = []

    for child in ast.walk(node):
        if isinstance(child, (ast.For, ast.While, ast.AsyncFor)):
            loops.append({"line": getattr(child, "lineno", 0)})
        elif isinstance(child, ast.Try):
            exceptions.append({"line": getattr(child, "lineno", 0)})
        elif isinstance(child, ast.Await):
            awaits.append({"line": getattr(child, "lineno", 0)})
        elif isinstance(child, (ast.If, ast.IfExp)):
            branches.append({"line": getattr(child, "lineno", 0)})

    result = {}
    if loops:
        result["loops"] = loops
    if exceptions:
        result["exceptions"] = exceptions
    if awaits:
        result["awaits"] = awaits
    if branches:
        result["branches"] = branches

    return result if result else None


def extract_python_hints(node: ast.FunctionDef | ast.AsyncFunctionDef) -> dict | None:
    """Extract Python-specific antipattern hints from AST."""
    hints = {
        "bareExceptCount": 0,
        "exceptPassCount": 0,
        "genericRaiseCount": 0,
        "wideTryBlockCount": 0,
        "typeIgnoreCount": 0,
        "anyTypeCount": 0,
        "evalExecCount": 0,
        "stringConcatInLoopCount": 0,
        "openWithoutWithCount": 0,
        "asyncNoAwaitCount": 0,
    }

    is_async = isinstance(node, ast.AsyncFunctionDef)
    has_await = False
    with_targets = set()  # Track variables from 'with' statements

    for child in ast.walk(node):
        # Bare except / swallowed exception
        if isinstance(child, ast.ExceptHandler):
            if child.type is None:
                hints["bareExceptCount"] += 1
            # except ...: pass
            if len(child.body) == 1 and isinstance(child.body[0], ast.Pass):
                hints["exceptPassCount"] += 1

        # Wide try block (>10 statements)
        if isinstance(child, ast.Try):
            body_lines = getattr(child.body[-1], "end_lineno", 0) - getattr(child.body[0], "lineno", 0) if child.body else 0
            if body_lines > 10:
                hints["wideTryBlockCount"] += 1

        # Generic raise: raise Exception(...) / raise BaseException(...)
        if isinstance(child, ast.Raise) and child.exc:
            exc = child.exc
            if isinstance(exc, ast.Call) and isinstance(exc.func, ast.Name):
                if exc.func.id in ("Exception", "BaseException"):
                    hints["genericRaiseCount"] += 1

        # eval/exec calls
        if isinstance(child, ast.Call) and isinstance(child.func, ast.Name):
            if child.func.id in ("eval", "exec"):
                hints["evalExecCount"] += 1

        # open() without with
        if isinstance(child, ast.Call) and isinstance(child.func, ast.Name) and child.func.id == "open":
            # Check if this open is inside a 'with' statement
            if child.func.id not in with_targets:
                # Heuristic: check if parent is a withitem (not perfect but good enough)
                pass  # Will check via with_targets below

        # Track 'with' targets
        if isinstance(child, ast.With) or isinstance(child, ast.AsyncWith):
            for item in child.items:
                if isinstance(item.context_expr, ast.Call) and isinstance(item.context_expr.func, ast.Name):
                    with_targets.add(item.context_expr.func.id)

        # Await tracking
        if isinstance(child, ast.Await):
            has_await = True

        # Any type annotations
        if isinstance(child, ast.Name) and child.id == "Any":
            hints["anyTypeCount"] += 1

        # String concat in loop: result += str_val
        if isinstance(child, (ast.For, ast.While, ast.AsyncFor)):
            for loop_child in ast.walk(child):
                if isinstance(loop_child, ast.AugAssign) and isinstance(loop_child.op, ast.Add):
                    hints["stringConcatInLoopCount"] += 1

    # open() without with: check calls not under 'with'
    for child in ast.walk(node):
        if isinstance(child, ast.Assign):
            if isinstance(child.value, ast.Call) and isinstance(child.value.func, ast.Name):
                if child.value.func.id == "open":
                    hints["openWithoutWithCount"] += 1

    # async def without await
    if is_async and not has_await:
        hints["asyncNoAwaitCount"] = 1

    # Return None if all zeros
    if all(v == 0 for v in hints.values()):
        return None

    return hints


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
    all_calls = []  # Collect all function/method calls

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

        # Helper to collect calls from function body and attach to entity
        def collect_function_calls(func_node, func_name: str, entity: dict):
            if func_node.body:
                calls = extract_calls_from_body(func_node.body, func_name)
                all_calls.extend(calls)
                # Attach calls to entity metadata for structural detection
                if calls:
                    entity["calls"] = [
                        {k: v for k, v in c.items() if k in ("name", "target", "argumentCount", "kwargs")}
                        for c in calls
                    ]
                # Extract controlFlow hints
                cf = extract_control_flow(func_node)
                if cf:
                    entity["controlFlow"] = cf
                # Extract pythonHints for antipattern detection
                hints = extract_python_hints(func_node)
                if hints:
                    entity["pythonHints"] = hints

        # Process top-level nodes
        for node in ast.walk(tree):
            if isinstance(node, ast.Module):
                for item in node.body:
                    if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        ent = process_function(item, file_path)
                        collect_function_calls(item, item.name, ent)
                        entities.append(ent)
                    elif isinstance(item, ast.ClassDef):
                        class_entities = process_class(item, file_path)
                        entities.extend(class_entities)
                        # Extract calls from class methods
                        for class_item in item.body:
                            if isinstance(class_item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                                method_name = f"{item.name}.{class_item.name}"
                                # Find matching entity to attach calls
                                method_ent = next((e for e in class_entities if e["name"] == method_name), None)
                                if method_ent:
                                    collect_function_calls(class_item, method_name, method_ent)
                                else:
                                    if class_item.body:
                                        all_calls.extend(extract_calls_from_body(class_item.body, method_name))
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
                # Enhanced import metadata
                import_data = entity.get("metadata", {}).get("importData", {})
                relationships.append({
                    "from": file_path,
                    "to": entity["name"],
                    "type": "imports",
                    "metadata": {
                        "line": entity["location"]["start"]["line"],
                        "alias": import_data.get("specifiers", [{}])[0].get("local") if import_data.get("specifiers") else None,
                        "isNamespace": import_data.get("isNamespace", False),
                    },
                })
            elif entity["type"] == "class" and "inheritance" in entity:
                for base in entity["inheritance"].get("baseClasses", []):
                    relationships.append({
                        "from": entity["name"],
                        "to": base,
                        "type": "inherits",
                        "metadata": {},
                    })
            elif entity["type"] in ("method", "function", "async_function") and "." in entity["name"]:
                class_name = entity["name"].rsplit(".", 1)[0]
                relationships.append({
                    "from": class_name,
                    "to": entity["name"],
                    "type": "contains",
                    "metadata": {},
                })

        # Add call relationships
        for call in all_calls:
            # Build target name
            if call.get("target"):
                target_name = f"{call['target']}.{call['name']}"
            else:
                target_name = call["name"]

            relationships.append({
                "from": call["container"],  # Who calls
                "to": target_name,           # What is called
                "type": "calls",
                "metadata": {
                    "line": call.get("line", 0),
                    "argumentCount": call.get("argumentCount", 0),
                },
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


def parse_batch(files: list[dict]) -> list[dict]:
    """
    Parse multiple files in batch mode.

    Args:
        files: List of {"path": str, "content": str} dictionaries

    Returns:
        List of parse results, one per file
    """
    results = []
    for file_info in files:
        file_path = file_info.get("path", "unknown.py")
        content = file_info.get("content", "")
        result = parse_file(file_path, content)
        result["filePath"] = file_path  # Include path in result
        results.append(result)
    return results


def main():
    if len(sys.argv) < 2:
        print("Usage: python python-ast-cli.py <file_path>", file=sys.stderr)
        print("       python python-ast-cli.py --stdin <file_path>", file=sys.stderr)
        print("       python python-ast-cli.py --batch  (reads JSON array from stdin)", file=sys.stderr)
        sys.exit(1)

    # Batch mode: read JSON array of {path, content} from stdin
    if sys.argv[1] == "--batch":
        try:
            input_data = sys.stdin.read()
            files = json.loads(input_data)
            if not isinstance(files, list):
                raise ValueError("Expected JSON array")
            results = parse_batch(files)
            print(json.dumps(results, ensure_ascii=False))
        except json.JSONDecodeError as e:
            print(json.dumps({"error": f"Invalid JSON: {e}"}), file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            print(json.dumps({"error": str(e)}), file=sys.stderr)
            sys.exit(1)
        return

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
