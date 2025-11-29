# UltraScript.Comm - Makefile for Cosmopolitan Libc
#
# Prerequisites:
#   Download cosmocc from https://github.com/jart/cosmopolitan
#   Add to PATH or set COSMOCC variable
#
# Usage:
#   make           - Build portable APE binary (runs on Win/Linux/macOS)
#   make native    - Build native binary for current OS
#   make clean     - Remove build artifacts

COSMOCC ?= cosmocc
CC ?= gcc
CFLAGS = -Os -Wall -Wextra
SRC = comm.c
OUTPUT = ultrascript-tools.com

# Default: build portable APE binary
.PHONY: all
all: $(OUTPUT)

# Portable binary using Cosmopolitan Libc
$(OUTPUT): $(SRC)
	$(COSMOCC) $(CFLAGS) -o $@ $<
	@echo "Built portable binary: $(OUTPUT)"
	@echo "Run './$(OUTPUT) --assimilate' to create native binary"

# Native binary for current OS
.PHONY: native
native: ultrascript

ultrascript: $(SRC)
ifeq ($(OS),Windows_NT)
	cl /O2 /Fe:ultrascript.exe $(SRC) ws2_32.lib advapi32.lib
else
	$(CC) $(CFLAGS) -o $@ $<
endif

# Create native binaries for each platform (from APE)
.PHONY: assimilate
assimilate: $(OUTPUT)
	./$(OUTPUT) --assimilate
	@echo "Created native binary for current platform"

# Install to dist directory
.PHONY: install
install: $(OUTPUT)
	mkdir -p ../../dist
	cp $(OUTPUT) ../../dist/

.PHONY: clean
clean:
	rm -f $(OUTPUT) ultrascript ultrascript.exe *.o *.obj

.PHONY: help
help:
	@echo "UltraScript.Comm Build System"
	@echo ""
	@echo "Targets:"
	@echo "  make          - Build portable APE binary (ultrascript-tools.com)"
	@echo "  make native   - Build native binary (ultrascript/ultrascript.exe)"
	@echo "  make install  - Copy to dist/ directory"
	@echo "  make clean    - Remove build artifacts"
	@echo ""
	@echo "The portable binary (ultrascript-tools.com) runs on:"
	@echo "  - Windows x64"
	@echo "  - Linux x64"
	@echo "  - macOS x64/ARM64"
	@echo "  - FreeBSD x64"
	@echo "  - NetBSD x64"
	@echo "  - OpenBSD x64"
