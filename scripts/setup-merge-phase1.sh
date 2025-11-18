#!/bin/bash
# Setup script for Semantic Merge Phase 1
# Создаёт все необходимые директории и базовые файлы

set -e

echo "🚀 Setting up Semantic Merge - Phase 1"
echo "======================================"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Change to project root
cd "$(dirname "$0")/.."

# Step 1: Create directories
echo -e "\n${BLUE}📁 Creating directories...${NC}"
mkdir -p src/merge/models
mkdir -p src/merge/indexing
mkdir -p src/merge/matching
mkdir -p src/merge/analysis
mkdir -p src/merge/engine
mkdir -p src/merge/integration
mkdir -p src/merge/models/__tests__
mkdir -p src/merge/indexing/__tests__
mkdir -p src/merge/matching/__tests__
echo -e "${GREEN}✅ Directories created${NC}"

# Step 2: Create index.ts exports
echo -e "\n${BLUE}📝 Creating index exports...${NC}"

cat > src/merge/models/index.ts << 'EOF'
// Semantic Merge Models
export * from './code-unit.js';
export * from './versioned-index.js';
export * from './merge-result.js';
EOF

cat > src/merge/indexing/index.ts << 'EOF'
// Semantic Merge Indexing
export * from './content-normalizer.js';
export * from './structural-normalizer.js';
EOF

cat > src/merge/matching/index.ts << 'EOF'
// Semantic Merge Matching
export * from './fast-path-matcher.js';
EOF

cat > src/merge/index.ts << 'EOF'
// Semantic Merge Main Export
export * from './models/index.js';
export * from './indexing/index.js';
export * from './matching/index.js';
EOF

echo -e "${GREEN}✅ Index files created${NC}"

# Step 3: Update .gitignore
echo -e "\n${BLUE}📝 Updating .gitignore...${NC}"
if ! grep -q "# Semantic Merge" .gitignore 2>/dev/null; then
  cat >> .gitignore << 'EOF'

# Semantic Merge temporary files
src/merge/**/*.test.ts.snap
src/merge/**/temp/
EOF
  echo -e "${GREEN}✅ .gitignore updated${NC}"
else
  echo -e "${GREEN}✅ .gitignore already contains Semantic Merge section${NC}"
fi

# Step 4: Create feature branch
echo -e "\n${BLUE}🌿 Creating feature branch...${NC}"
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "feature/semantic-merge" ]; then
  git checkout -b feature/semantic-merge 2>/dev/null || git checkout feature/semantic-merge
  echo -e "${GREEN}✅ On branch: feature/semantic-merge${NC}"
else
  echo -e "${GREEN}✅ Already on feature/semantic-merge${NC}"
fi

# Step 5: Summary
echo -e "\n${GREEN}✨ Phase 1 setup complete!${NC}"
echo -e "\n${BLUE}Next steps:${NC}"
echo "1. Implement src/merge/models/code-unit.ts"
echo "2. Implement src/merge/models/versioned-index.ts"
echo "3. Implement src/merge/models/merge-result.ts"
echo "4. Implement src/merge/indexing/content-normalizer.ts"
echo "5. Write tests in src/merge/**/__tests__/"
echo ""
echo "📖 See docs/SEMANTIC_MERGE_STEP_BY_STEP.md for detailed instructions"
echo ""
echo "🧪 Run tests: npm test -- src/merge/"
echo "📝 Run typecheck: npm run typecheck"
echo ""
