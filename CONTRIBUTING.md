# Contributing to COBOL-to-Scala

Thank you for your interest in contributing to COBOL-to-Scala! This document provides guidelines and instructions for contributing.

## 🌟 Ways to Contribute

- **Bug Reports**: Found a bug? Open an issue with reproduction steps
- **Feature Requests**: Have an idea? Create a feature request issue
- **Code Contributions**: Fix bugs, add features, improve documentation
- **Documentation**: Improve README, add examples, write tutorials
- **Testing**: Add test cases, improve test coverage

## 🚀 Getting Started

### 1. Fork and Clone

```bash
# Fork the repository on GitHub
# Then clone your fork
git clone https://github.com/YOUR_USERNAME/cobol-to-scala.git
cd cobol-to-scala
```

### 2. Set Up Development Environment

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd Thyraa-COBOL-main/backend
npm install
cd ../..
```

### 3. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

## 📝 Development Workflow

### Running Locally

**Backend:**
```bash
cd Thyraa-COBOL-main/backend
npm start  # Runs on http://localhost:3000
```

**Frontend:**
```bash
cd Thyraa-COBOL-main
npm run dev  # Runs on http://localhost:5173
```

### Testing Your Changes

```bash
# Run backend tests
cd Thyraa-COBOL-main/backend
npm test

# Test a specific conversion
node test-converter.js
```

### Code Style

- **TypeScript/JavaScript**: Follow existing code style, use ESLint
- **Scala**: Follow Scala 3 conventions
- **COBOL**: Uppercase keywords, proper indentation

## 🐛 Reporting Bugs

When reporting bugs, please include:

1. **Description**: Clear description of the issue
2. **Steps to Reproduce**: Minimal steps to reproduce the bug
3. **Expected Behavior**: What you expected to happen
4. **Actual Behavior**: What actually happened
5. **COBOL Input**: Sample COBOL code that causes the issue
6. **Scala Output**: Generated Scala code (if applicable)
7. **Environment**: OS, Node.js version, browser

**Example:**
```markdown
## Bug: MULTIPLY statement generates [object Object]

**Steps:**
1. Input COBOL: `MULTIPLY A BY B GIVING C`
2. Click Convert
3. Check generated Scala

**Expected:** `c = a * b`
**Actual:** `c = [object Object]`

**Environment:** macOS, Node.js 18.16.0
```

## ✨ Feature Requests

For feature requests, please include:

1. **Use Case**: Describe the problem you're trying to solve
2. **Proposed Solution**: Your suggested implementation
3. **Alternatives**: Other approaches you've considered
4. **Examples**: Sample COBOL/Scala showing desired behavior

## 📥 Pull Request Process

### 1. Make Your Changes

- Write clear, concise code
- Follow existing code style and patterns
- Add comments for complex logic
- Update documentation if needed

### 2. Test Thoroughly

- Ensure all existing tests pass
- Add tests for new features
- Test edge cases

### 3. Commit Your Changes

```bash
# Use clear commit messages
git commit -m "feat: add support for PERFORM VARYING AFTER"
git commit -m "fix: resolve [object Object] in MULTIPLY statements"
git commit -m "docs: update README with installation steps"
```

**Commit Message Format:**
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Adding or updating tests
- `refactor:` Code refactoring
- `perf:` Performance improvements
- `chore:` Maintenance tasks

### 4. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub with:

- **Title**: Clear, descriptive title
- **Description**: What changes you made and why
- **Related Issues**: Link to related issues (Fixes #123)
- **Testing**: How you tested the changes
- **Screenshots**: For UI changes

## 🔍 Code Review Process

1. Maintainer reviews your PR
2. Address any feedback or requested changes
3. Once approved, maintainer will merge

## 🎯 Priority Areas

Current focus areas where contributions are especially welcome:

### High Priority
- [ ] Fix PIC clause byte calculation
- [ ] Improve expression handling ([object Object] issues)
- [ ] Add comprehensive test suite
- [ ] Flatten over-engineered data structures

### Medium Priority
- [ ] Add more COBOL sample programs
- [ ] Improve error messages
- [ ] Add progress indicators for large files
- [ ] Documentation improvements

### Future Features
- [ ] CICS support
- [ ] DB2 conversion
- [ ] JCL → sbt conversion
- [ ] VS Code extension

## 📚 Resources

- **Documentation**: See `docs/` folder for all technical documentation
- **COBOL Reference**: See `cobol-reference/` folder
- **Architecture**: Read `docs/UNIFIED_PLATFORM_ARCHITECTURE.md`
- **API Docs**: Check `Thyraa-COBOL-main/INTEGRATION.md`
- **Examples**: Check `examples/` folder for sample conversions

## 🤔 Questions?

- **GitHub Discussions**: For questions and discussions
- **GitHub Issues**: For bugs and feature requests

## 📜 Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what's best for the community
- Show empathy towards other community members

## 🙏 Thank You!

Your contributions make this project better for everyone. We appreciate your time and effort!

---

**Happy coding! 🚀**
