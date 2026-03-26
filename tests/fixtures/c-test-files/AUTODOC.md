# tests/fixtures/c-test-files

## Overview

This module provides sample C source files used for testing the codebase parser and semantic analysis tools. It contains two example files demonstrating basic C language constructs: mathematical functions and utilities in one file, and data structures (structs and enums) with associated operations in another. These fixtures allow validation of parsing, AST generation, and code analysis features across different C patterns.

## Struct declarations

- **Point** (`structures.c:5-8`) — Represents a 2D coordinate with integer x and y fields.
- **name** (`structures.c:11-15`) — Anonymous struct member likely containing name-related data.
- **add** (`structures.c:18-22`) — Anonymous struct member for addition operation or result.
- **Point** (`structures.c:48-53`) — Represents a 2D point structure with coordinate fields (appears as method/constructor).
- **Point** (`structures.c:49-50`) — Nested or related Point structure declaration.
- **Point** (`structures.c:55-59`) — Point structure used within the distance function scope.

## Enum declarations

- **Status** (`structures.c:32-37`) — Enumeration defining various status states or conditions.
- **RED** (`structures.c:40-45`) — Color enumeration value, likely part of a color palette.

## Functions

- **add** (`basic_functions.c:6-8`) — Computes the sum of two integer parameters.
- **multiply** (`basic_functions.c:11-13`) — Computes the product of two integer parameters.
- **print_hello** (`basic_functions.c:16-16`) — Outputs a greeting message to standard output.
- **square** (`basic_functions.c:19-21`) — Returns the square of an integer value.
- **cleanup** (`basic_functions.c:24-26`) — Releases or deallocates resources.
- **concat_strings** (`basic_functions.c:29-36`) — Combines two strings into a single concatenated result.
- **main** (`basic_functions.c:39-48`) — Entry point demonstrating calls to utility functions and basic program flow.
- **distance** (`structures.c:55-59`) — Calculates the Euclidean or Manhattan distance between two Point structures.
- **Employee** (`structures.c:61-70`) — Function or constructor related to employee data handling.
- **print_employee** (`structures.c:72-77`) — Outputs employee information in a formatted manner.

## Method declarations

- **Point** (`structures.c:48-53`) — Constructor or initializer method for the Point structure.

## Type aliases

- **<anonymous>** (`structures.c:11-12`) — Unnamed type alias for a struct definition.
- **<anonymous>** (`structures.c:18-19`) — Unnamed type alias for a struct definition.
- **<anonymous>** (`structures.c:40-41`) — Unnamed type alias for an enum definition.

## Dependencies

This fixture module is a standalone test resource with no internal dependencies on other codebase modules. It serves as input to parser validation, semantic analysis, and code indexing features, and is typically referenced by test runners and analysis tools rather than imported into application code.