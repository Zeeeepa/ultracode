
import com.github.javaparser.*;
import com.github.javaparser.ast.*;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.type.*;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.visitor.*;
import java.util.*;
import java.io.*;

public class JavaParserWrapper {
    public static void main(String[] args) throws Exception {
        String filePath = args.length > 0 ? args[0] : "<stdin>";
        StringBuilder content = new StringBuilder();
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, "UTF-8"));
        String line;
        while ((line = reader.readLine()) != null) {
            content.append(line).append("\n");
        }

        try {
            ParseResult<CompilationUnit> result = new JavaParser().parse(content.toString());

            if (result.isSuccessful() && result.getResult().isPresent()) {
                CompilationUnit cu = result.getResult().get();
                List<Map<String, Object>> entities = extractEntities(cu, filePath);

                StringBuilder json = new StringBuilder();
                json.append("{\"entities\": ");
                json.append(toJson(entities));
                json.append(", \"errors\": []}");
                System.out.println(json);
            } else {
                List<Map<String, Object>> errors = new ArrayList<>();
                for (Problem p : result.getProblems()) {
                    Map<String, Object> error = new HashMap<>();
                    error.put("message", p.getMessage());
                    if (p.getLocation().isPresent()) {
                        Map<String, Object> location = new HashMap<>();
                        location.put("line", p.getLocation().get().getBegin().getRange().get().begin.line);
                        location.put("column", p.getLocation().get().getBegin().getRange().get().begin.column);
                        error.put("location", location);
                    }
                    errors.add(error);
                }

                StringBuilder json = new StringBuilder();
                json.append("{\"entities\": [], \"errors\": ");
                json.append(toJson(errors));
                json.append("}");
                System.out.println(json);
            }
        } catch (Exception e) {
            System.out.println("{\"entities\": [], \"errors\": [{\"message\": \"" +
                escapeJson(e.getMessage()) + "\"}]}");
        }
    }

    static List<Map<String, Object>> extractEntities(CompilationUnit cu, String filePath) {
        List<Map<String, Object>> entities = new ArrayList<>();

        // Package
        cu.getPackageDeclaration().ifPresent(pkg -> {
            Map<String, Object> entity = new HashMap<>();
            entity.put("name", pkg.getNameAsString());
            entity.put("type", "module");
            entity.put("filePath", filePath);
            entity.put("location", getLocation(pkg));
            entities.add(entity);
        });

        // Imports
        for (ImportDeclaration imp : cu.getImports()) {
            Map<String, Object> entity = new HashMap<>();
            entity.put("name", imp.getNameAsString());
            entity.put("type", "import");
            entity.put("filePath", filePath);
            entity.put("location", getLocation(imp));
            if (imp.isStatic()) {
                entity.put("modifiers", Collections.singletonList("static"));
            }
            entities.add(entity);
        }

        // Types
        for (TypeDeclaration<?> type : cu.getTypes()) {
            extractType(type, filePath, entities);
        }

        return entities;
    }

    static void extractType(TypeDeclaration<?> type, String filePath, List<Map<String, Object>> entities) {
        Map<String, Object> entity = new HashMap<>();
        entity.put("name", type.getNameAsString());
        entity.put("filePath", filePath);
        entity.put("location", getLocation(type));

        List<String> modifiers = getModifiers(type.getModifiers());
        if (!modifiers.isEmpty()) {
            entity.put("modifiers", modifiers);
        }

        if (type instanceof ClassOrInterfaceDeclaration) {
            ClassOrInterfaceDeclaration cid = (ClassOrInterfaceDeclaration) type;
            entity.put("type", cid.isInterface() ? "interface" : "class");

            List<String> baseClasses = new ArrayList<>();
            List<String> interfaces = new ArrayList<>();

            for (ClassOrInterfaceType ext : cid.getExtendedTypes()) {
                if (cid.isInterface()) {
                    interfaces.add(ext.getNameAsString());
                } else {
                    baseClasses.add(ext.getNameAsString());
                }
            }
            for (ClassOrInterfaceType impl : cid.getImplementedTypes()) {
                interfaces.add(impl.getNameAsString());
            }

            if (!baseClasses.isEmpty() || !interfaces.isEmpty()) {
                Map<String, Object> inheritance = new HashMap<>();
                if (!baseClasses.isEmpty()) inheritance.put("baseClasses", baseClasses);
                if (!interfaces.isEmpty()) inheritance.put("interfaces", interfaces);
                inheritance.put("isAbstract", modifiers.contains("abstract"));
                entity.put("inheritance", inheritance);
            }
        } else if (type instanceof EnumDeclaration) {
            entity.put("type", "enum");
        } else if (type instanceof AnnotationDeclaration) {
            entity.put("type", "interface");
        } else if (type instanceof RecordDeclaration) {
            entity.put("type", "class");
            modifiers.add("record");
            entity.put("modifiers", modifiers);
        }

        // Members
        List<Map<String, Object>> children = new ArrayList<>();

        for (BodyDeclaration<?> member : type.getMembers()) {
            if (member instanceof MethodDeclaration) {
                MethodDeclaration method = (MethodDeclaration) member;
                Map<String, Object> methodEntity = new HashMap<>();
                methodEntity.put("name", method.getNameAsString());
                methodEntity.put("type", "method");
                methodEntity.put("filePath", filePath);
                methodEntity.put("location", getLocation(method));
                methodEntity.put("returnType", method.getTypeAsString());

                List<String> methodMods = getModifiers(method.getModifiers());
                if (!methodMods.isEmpty()) {
                    methodEntity.put("modifiers", methodMods);
                }

                List<Map<String, Object>> params = new ArrayList<>();
                for (Parameter p : method.getParameters()) {
                    Map<String, Object> param = new HashMap<>();
                    param.put("name", p.getNameAsString());
                    param.put("type", p.getTypeAsString());
                    params.add(param);
                }
                if (!params.isEmpty()) {
                    methodEntity.put("parameters", params);
                }

                children.add(methodEntity);
            } else if (member instanceof ConstructorDeclaration) {
                ConstructorDeclaration ctor = (ConstructorDeclaration) member;
                Map<String, Object> ctorEntity = new HashMap<>();
                ctorEntity.put("name", "constructor");
                ctorEntity.put("type", "method");
                ctorEntity.put("filePath", filePath);
                ctorEntity.put("location", getLocation(ctor));

                List<String> ctorMods = getModifiers(ctor.getModifiers());
                if (!ctorMods.isEmpty()) {
                    ctorEntity.put("modifiers", ctorMods);
                }

                List<Map<String, Object>> params = new ArrayList<>();
                for (Parameter p : ctor.getParameters()) {
                    Map<String, Object> param = new HashMap<>();
                    param.put("name", p.getNameAsString());
                    param.put("type", p.getTypeAsString());
                    params.add(param);
                }
                if (!params.isEmpty()) {
                    ctorEntity.put("parameters", params);
                }

                children.add(ctorEntity);
            } else if (member instanceof FieldDeclaration) {
                FieldDeclaration field = (FieldDeclaration) member;
                List<String> fieldMods = getModifiers(field.getModifiers());

                for (VariableDeclarator var : field.getVariables()) {
                    Map<String, Object> fieldEntity = new HashMap<>();
                    fieldEntity.put("name", var.getNameAsString());
                    fieldEntity.put("type", fieldMods.contains("final") ? "constant" : "field");
                    fieldEntity.put("filePath", filePath);
                    fieldEntity.put("location", getLocation(field));
                    if (!fieldMods.isEmpty()) {
                        fieldEntity.put("modifiers", fieldMods);
                    }

                    Map<String, Object> metadata = new HashMap<>();
                    metadata.put("fieldType", var.getTypeAsString());
                    fieldEntity.put("metadata", metadata);

                    children.add(fieldEntity);
                }
            } else if (member instanceof TypeDeclaration) {
                extractType((TypeDeclaration<?>) member, filePath, children);
            }
        }

        if (!children.isEmpty()) {
            entity.put("children", children);
        }

        entities.add(entity);
    }

    static List<String> getModifiers(NodeList<Modifier> modifiers) {
        List<String> result = new ArrayList<>();
        for (Modifier mod : modifiers) {
            result.add(mod.getKeyword().asString());
        }
        return result;
    }

    static Map<String, Object> getLocation(Node node) {
        Map<String, Object> location = new HashMap<>();
        Map<String, Object> start = new HashMap<>();
        Map<String, Object> end = new HashMap<>();

        if (node.getRange().isPresent()) {
            com.github.javaparser.Range range = node.getRange().get();
            start.put("line", range.begin.line);
            start.put("column", range.begin.column - 1);
            start.put("index", 0);
            end.put("line", range.end.line);
            end.put("column", range.end.column);
            end.put("index", 0);
        } else {
            start.put("line", 1);
            start.put("column", 0);
            start.put("index", 0);
            end.put("line", 1);
            end.put("column", 0);
            end.put("index", 0);
        }

        location.put("start", start);
        location.put("end", end);
        return location;
    }

    static String toJson(Object obj) {
        if (obj == null) return "null";
        if (obj instanceof String) return "\"" + escapeJson((String) obj) + "\"";
        if (obj instanceof Number) return obj.toString();
        if (obj instanceof Boolean) return obj.toString();
        if (obj instanceof List) {
            List<?> list = (List<?>) obj;
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < list.size(); i++) {
                if (i > 0) sb.append(",");
                sb.append(toJson(list.get(i)));
            }
            sb.append("]");
            return sb.toString();
        }
        if (obj instanceof Map) {
            Map<?, ?> map = (Map<?, ?>) obj;
            StringBuilder sb = new StringBuilder("{");
            boolean first = true;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (!first) sb.append(",");
                first = false;
                sb.append("\"").append(escapeJson(entry.getKey().toString())).append("\":");
                sb.append(toJson(entry.getValue()));
            }
            sb.append("}");
            return sb.toString();
        }
        return "\"" + escapeJson(obj.toString()) + "\"";
    }

    static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
