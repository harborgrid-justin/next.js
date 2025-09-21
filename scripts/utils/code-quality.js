/**
 * Enterprise Code Quality and Standards Utilities
 * Automated code quality checks, standards enforcement, and development guidelines
 */

const fs = require('fs').promises
const path = require('path')
const { getLogger } = require('./logger')

/**
 * Code style and standards configuration
 */
const CODING_STANDARDS = {
  javascript: {
    maxLineLength: 120,
    indentSize: 2,
    indentType: 'spaces',
    maxFunctionLength: 50,
    maxComplexity: 10,
    maxParametersCount: 5,
    enforceJSDoc: true,
    enforceTypeAnnotations: true
  },
  typescript: {
    maxLineLength: 120,
    indentSize: 2,
    indentType: 'spaces',
    maxFunctionLength: 50,
    maxComplexity: 10,
    maxParametersCount: 5,
    enforceJSDoc: true,
    enforceTypeAnnotations: true,
    strictMode: true
  },
  general: {
    maxFileSize: 1000, // lines
    enforceFileHeaders: true,
    enforceNamingConventions: true,
    requireErrorHandling: true
  }
}

/**
 * Naming conventions
 */
const NAMING_CONVENTIONS = {
  functions: /^[a-z][a-zA-Z0-9]*$/, // camelCase
  variables: /^[a-z][a-zA-Z0-9]*$/, // camelCase
  constants: /^[A-Z][A-Z0-9_]*$/, // UPPER_SNAKE_CASE
  classes: /^[A-Z][a-zA-Z0-9]*$/, // PascalCase
  files: /^[a-z][a-z0-9-]*\.(js|ts|mjs|jsx|tsx)$/, // kebab-case
  directories: /^[a-z][a-z0-9-]*$/ // kebab-case
}

/**
 * Code quality analyzer
 */
class CodeQualityAnalyzer {
  constructor() {
    this.logger = getLogger('CodeQuality')
    this.issues = []
    this.metrics = {
      totalLines: 0,
      totalFiles: 0,
      functionsAnalyzed: 0,
      issuesFound: 0
    }
  }

  /**
   * Analyze a single file
   */
  async analyzeFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8')
      const ext = path.extname(filePath)
      const fileIssues = []

      // Basic file analysis
      const lines = content.split('\n')
      this.metrics.totalLines += lines.length
      this.metrics.totalFiles++

      // Check file size
      if (lines.length > CODING_STANDARDS.general.maxFileSize) {
        fileIssues.push({
          type: 'file-size',
          severity: 'warning',
          message: `File exceeds maximum size: ${lines.length} > ${CODING_STANDARDS.general.maxFileSize} lines`,
          line: 0,
          file: filePath
        })
      }

      // Check file header
      if (CODING_STANDARDS.general.enforceFileHeaders && !this.hasValidHeader(content)) {
        fileIssues.push({
          type: 'missing-header',
          severity: 'warning',
          message: 'File missing documentation header',
          line: 1,
          file: filePath
        })
      }

      // Language-specific analysis
      if (['.js', '.mjs', '.jsx'].includes(ext)) {
        fileIssues.push(...this.analyzeJavaScript(content, filePath))
      } else if (['.ts', '.tsx'].includes(ext)) {
        fileIssues.push(...this.analyzeTypeScript(content, filePath))
      }

      // Line-by-line analysis
      fileIssues.push(...this.analyzeLines(lines, filePath))

      this.issues.push(...fileIssues)
      this.metrics.issuesFound += fileIssues.length

      return fileIssues

    } catch (error) {
      this.logger.error(`Failed to analyze file ${filePath}:`, error.message)
      return []
    }
  }

  /**
   * Check if file has valid header
   */
  hasValidHeader(content) {
    const firstLines = content.split('\n').slice(0, 10).join('\n')
    return firstLines.includes('/**') && (
      firstLines.includes('@description') || 
      firstLines.includes('Overview') ||
      firstLines.includes('*/')
    )
  }

  /**
   * Analyze JavaScript-specific issues
   */
  analyzeJavaScript(content, filePath) {
    const issues = []
    const standards = CODING_STANDARDS.javascript

    // Function analysis
    const functionMatches = content.matchAll(/function\s+(\w+)\s*\(([^)]*)\)\s*{/g)
    for (const match of functionMatches) {
      const [fullMatch, functionName, parameters] = match
      const paramCount = parameters ? parameters.split(',').filter(p => p.trim()).length : 0

      this.metrics.functionsAnalyzed++

      // Check function name convention
      if (!NAMING_CONVENTIONS.functions.test(functionName)) {
        issues.push({
          type: 'naming-convention',
          severity: 'error',
          message: `Function name '${functionName}' doesn't follow camelCase convention`,
          line: this.getLineNumber(content, match.index),
          file: filePath
        })
      }

      // Check parameter count
      if (paramCount > standards.maxParametersCount) {
        issues.push({
          type: 'too-many-parameters',
          severity: 'warning',
          message: `Function '${functionName}' has too many parameters: ${paramCount} > ${standards.maxParametersCount}`,
          line: this.getLineNumber(content, match.index),
          file: filePath
        })
      }
    }

    // Variable analysis
    const varMatches = content.matchAll(/(?:let|const|var)\s+(\w+)/g)
    for (const match of varMatches) {
      const [fullMatch, varName] = match
      
      // Check if it's a constant (all uppercase)
      if (varName === varName.toUpperCase()) {
        if (!NAMING_CONVENTIONS.constants.test(varName)) {
          issues.push({
            type: 'naming-convention',
            severity: 'error',
            message: `Constant '${varName}' doesn't follow UPPER_SNAKE_CASE convention`,
            line: this.getLineNumber(content, match.index),
            file: filePath
          })
        }
      } else if (!NAMING_CONVENTIONS.variables.test(varName)) {
        issues.push({
          type: 'naming-convention',
          severity: 'error',
          message: `Variable '${varName}' doesn't follow camelCase convention`,
          line: this.getLineNumber(content, match.index),
          file: filePath
        })
      }
    }

    // Class analysis
    const classMatches = content.matchAll(/class\s+(\w+)/g)
    for (const match of classMatches) {
      const [fullMatch, className] = match
      
      if (!NAMING_CONVENTIONS.classes.test(className)) {
        issues.push({
          type: 'naming-convention',
          severity: 'error',
          message: `Class name '${className}' doesn't follow PascalCase convention`,
          line: this.getLineNumber(content, match.index),
          file: filePath
        })
      }
    }

    return issues
  }

  /**
   * Analyze TypeScript-specific issues
   */
  analyzeTypeScript(content, filePath) {
    const issues = this.analyzeJavaScript(content, filePath) // Inherit JS rules
    const standards = CODING_STANDARDS.typescript

    // Check for type annotations
    if (standards.enforceTypeAnnotations) {
      const functionMatches = content.matchAll(/function\s+(\w+)\s*\(([^)]*)\)(?!:\s*\w)/g)
      for (const match of functionMatches) {
        const [fullMatch, functionName] = match
        issues.push({
          type: 'missing-type-annotation',
          severity: 'warning',
          message: `Function '${functionName}' missing return type annotation`,
          line: this.getLineNumber(content, match.index),
          file: filePath
        })
      }
    }

    return issues
  }

  /**
   * Analyze lines for common issues
   */
  analyzeLines(lines, filePath) {
    const issues = []
    const standards = CODING_STANDARDS.javascript

    lines.forEach((line, index) => {
      const lineNum = index + 1
      
      // Check line length
      if (line.length > standards.maxLineLength) {
        issues.push({
          type: 'line-length',
          severity: 'warning',
          message: `Line exceeds maximum length: ${line.length} > ${standards.maxLineLength}`,
          line: lineNum,
          file: filePath
        })
      }

      // Check for console.log (should use logger)
      if (line.includes('console.log') && !line.includes('//')) {
        issues.push({
          type: 'console-log',
          severity: 'warning',
          message: 'Use logger instead of console.log',
          line: lineNum,
          file: filePath
        })
      }

      // Check for TODO comments without issue references
      if (line.includes('TODO') && !line.includes('#') && !line.includes('http')) {
        issues.push({
          type: 'todo-without-reference',
          severity: 'info',
          message: 'TODO comment should reference an issue or ticket',
          line: lineNum,
          file: filePath
        })
      }

      // Check for proper error handling
      if (line.includes('try') && !lines.slice(index).some(l => l.includes('catch'))) {
        issues.push({
          type: 'missing-error-handling',
          severity: 'error',
          message: 'try block without corresponding catch',
          line: lineNum,
          file: filePath
        })
      }
    })

    return issues
  }

  /**
   * Get line number from content index
   */
  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length
  }

  /**
   * Analyze directory structure
   */
  async analyzeDirectory(dirPath, extensions = ['.js', '.ts', '.mjs', '.jsx', '.tsx']) {
    const files = []
    
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true })
      
      for (const item of items) {
        const fullPath = path.join(dirPath, item.name)
        
        if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
          // Check directory naming
          if (!NAMING_CONVENTIONS.directories.test(item.name)) {
            this.issues.push({
              type: 'naming-convention',
              severity: 'warning',
              message: `Directory name '${item.name}' doesn't follow kebab-case convention`,
              line: 0,
              file: fullPath
            })
          }
          
          // Recurse into subdirectory
          files.push(...await this.analyzeDirectory(fullPath, extensions))
        } else if (item.isFile() && extensions.some(ext => item.name.endsWith(ext))) {
          // Check file naming
          if (!NAMING_CONVENTIONS.files.test(item.name)) {
            this.issues.push({
              type: 'naming-convention',
              severity: 'warning',
              message: `File name '${item.name}' doesn't follow kebab-case convention`,
              line: 0,
              file: fullPath
            })
          }
          
          files.push(fullPath)
          await this.analyzeFile(fullPath)
        }
      }
    } catch (error) {
      this.logger.error(`Failed to analyze directory ${dirPath}:`, error.message)
    }
    
    return files
  }

  /**
   * Generate quality report
   */
  generateReport() {
    const issuesBySeverity = this.groupBy(this.issues, 'severity')
    const issuesByType = this.groupBy(this.issues, 'type')
    const issuesByFile = this.groupBy(this.issues, 'file')

    const report = []
    report.push('📋 Code Quality Analysis Report')
    report.push('=' .repeat(50))
    
    // Summary
    report.push('\n📊 Summary:')
    report.push(`  Files analyzed: ${this.metrics.totalFiles}`)
    report.push(`  Total lines: ${this.metrics.totalLines}`)
    report.push(`  Functions analyzed: ${this.metrics.functionsAnalyzed}`)
    report.push(`  Issues found: ${this.metrics.issuesFound}`)
    
    // Issues by severity
    report.push('\n🚨 Issues by Severity:')
    const severityOrder = ['error', 'warning', 'info']
    for (const severity of severityOrder) {
      const count = issuesBySeverity[severity]?.length || 0
      const emoji = severity === 'error' ? '❌' : severity === 'warning' ? '⚠️' : 'ℹ️'
      report.push(`  ${emoji} ${severity}: ${count}`)
    }
    
    // Issues by type
    report.push('\n🔍 Issues by Type:')
    for (const [type, issues] of Object.entries(issuesByType)) {
      report.push(`  ${type}: ${issues.length}`)
    }
    
    // Top problematic files
    report.push('\n📁 Most Problematic Files:')
    const fileIssues = Object.entries(issuesByFile)
      .sort(([,a], [,b]) => b.length - a.length)
      .slice(0, 10)
    
    for (const [file, issues] of fileIssues) {
      const relativePath = path.relative(process.cwd(), file)
      report.push(`  ${relativePath}: ${issues.length} issues`)
    }

    // Quality score
    const qualityScore = this.calculateQualityScore()
    report.push(`\n🏆 Code Quality Score: ${qualityScore.toFixed(1)}/100`)
    report.push(this.getQualityRating(qualityScore))

    // Recommendations
    report.push('\n💡 Recommendations:')
    report.push(this.generateRecommendations())

    return report.join('\n')
  }

  /**
   * Group array by property
   */
  groupBy(array, property) {
    return array.reduce((groups, item) => {
      const key = item[property]
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(item)
      return groups
    }, {})
  }

  /**
   * Calculate overall quality score
   */
  calculateQualityScore() {
    if (this.metrics.totalFiles === 0) return 100

    const errorWeight = 3
    const warningWeight = 1
    const infoWeight = 0.1

    const errorCount = this.issues.filter(i => i.severity === 'error').length
    const warningCount = this.issues.filter(i => i.severity === 'warning').length
    const infoCount = this.issues.filter(i => i.severity === 'info').length

    const totalWeight = errorCount * errorWeight + warningCount * warningWeight + infoCount * infoWeight
    const maxPossibleWeight = this.metrics.totalFiles * 10 // Assume max 10 weighted issues per file

    const score = Math.max(0, 100 - (totalWeight / Math.max(maxPossibleWeight, 1)) * 100)
    return score
  }

  /**
   * Get quality rating
   */
  getQualityRating(score) {
    if (score >= 95) return '🏅 Excellent - Production ready'
    if (score >= 85) return '✅ Good - Minor improvements needed'
    if (score >= 75) return '⚠️ Fair - Some issues to address'
    if (score >= 60) return '🔧 Poor - Significant improvements needed'
    return '🚨 Critical - Major refactoring required'
  }

  /**
   * Generate improvement recommendations
   */
  generateRecommendations() {
    const recommendations = []
    const issuesByType = this.groupBy(this.issues, 'type')

    // Specific recommendations based on issue types
    if (issuesByType['naming-convention']) {
      recommendations.push('  • Standardize naming conventions (camelCase, PascalCase, kebab-case)')
    }
    
    if (issuesByType['line-length']) {
      recommendations.push('  • Break long lines into multiple lines for better readability')
    }
    
    if (issuesByType['too-many-parameters']) {
      recommendations.push('  • Refactor functions with many parameters using objects or builder pattern')
    }
    
    if (issuesByType['console-log']) {
      recommendations.push('  • Replace console.log with proper logging utilities')
    }
    
    if (issuesByType['missing-error-handling']) {
      recommendations.push('  • Add proper error handling to try blocks')
    }
    
    if (issuesByType['missing-header']) {
      recommendations.push('  • Add documentation headers to files')
    }
    
    if (issuesByType['file-size']) {
      recommendations.push('  • Break large files into smaller, focused modules')
    }

    // General recommendations
    if (recommendations.length === 0) {
      recommendations.push('  • Continue following good coding practices!')
    } else {
      recommendations.push('  • Set up automated code formatting (Prettier)')
      recommendations.push('  • Configure ESLint with project-specific rules')
      recommendations.push('  • Add pre-commit hooks for code quality checks')
    }

    return recommendations.join('\n')
  }

  /**
   * Export results to different formats
   */
  exportResults(format = 'json') {
    const data = {
      summary: {
        filesAnalyzed: this.metrics.totalFiles,
        totalLines: this.metrics.totalLines,
        functionsAnalyzed: this.metrics.functionsAnalyzed,
        issuesFound: this.metrics.issuesFound,
        qualityScore: this.calculateQualityScore()
      },
      issues: this.issues,
      metrics: this.metrics
    }

    if (format === 'json') {
      return JSON.stringify(data, null, 2)
    } else if (format === 'csv') {
      return this.exportToCSV(data.issues)
    }
    
    return data
  }

  /**
   * Export issues to CSV format
   */
  exportToCSV(issues) {
    const headers = ['File', 'Line', 'Type', 'Severity', 'Message']
    const rows = issues.map(issue => [
      issue.file,
      issue.line,
      issue.type,
      issue.severity,
      issue.message
    ])
    
    return [headers, ...rows].map(row => row.join(',')).join('\n')
  }
}

/**
 * Development guidelines generator
 */
class DevelopmentGuidelinesGenerator {
  constructor() {
    this.logger = getLogger('DevGuidelines')
  }

  /**
   * Generate comprehensive development guidelines
   */
  generateGuidelines() {
    return {
      'coding-standards.md': this.generateCodingStandards(),
      'code-review-checklist.md': this.generateCodeReviewChecklist(),
      'git-workflow.md': this.generateGitWorkflow(),
      'testing-guidelines.md': this.generateTestingGuidelines(),
      'security-guidelines.md': this.generateSecurityGuidelines()
    }
  }

  generateCodingStandards() {
    return `# Coding Standards

## JavaScript/TypeScript

### Naming Conventions
- **Functions & Variables**: camelCase (\`getUserData\`, \`isActive\`)
- **Constants**: UPPER_SNAKE_CASE (\`MAX_RETRY_COUNT\`, \`API_BASE_URL\`)
- **Classes**: PascalCase (\`UserManager\`, \`HttpClient\`)
- **Files**: kebab-case (\`user-manager.js\`, \`http-client.ts\`)
- **Directories**: kebab-case (\`user-management\`, \`api-clients\`)

### Code Structure
- Maximum line length: 120 characters
- Indentation: 2 spaces (no tabs)
- Maximum function length: 50 lines
- Maximum parameters: 5 per function
- Use meaningful variable and function names

### Documentation
- All files must have header comments
- Functions must have JSDoc comments
- Complex logic must be commented
- README files for each major module

### Error Handling
- Always use try-catch for async operations
- Provide meaningful error messages
- Log errors with appropriate context
- Implement graceful degradation

## Best Practices
- Use const by default, let when reassignment needed
- Prefer arrow functions for short functions
- Use async/await over Promise.then()
- Implement proper input validation
- Follow single responsibility principle
`
  }

  generateCodeReviewChecklist() {
    return `# Code Review Checklist

## Functionality
- [ ] Code accomplishes the intended purpose
- [ ] Edge cases are handled appropriately
- [ ] Error conditions are properly managed
- [ ] Performance implications are considered

## Code Quality
- [ ] Code is readable and well-structured
- [ ] Variable and function names are meaningful
- [ ] No code duplication (DRY principle)
- [ ] Functions are focused and do one thing well
- [ ] Proper separation of concerns

## Standards Compliance
- [ ] Follows established naming conventions
- [ ] Adheres to line length limits
- [ ] Proper indentation and formatting
- [ ] No console.log statements in production code
- [ ] Appropriate use of comments

## Security
- [ ] Input validation is implemented
- [ ] No sensitive data in code or logs
- [ ] Proper authentication and authorization
- [ ] SQL injection prevention (if applicable)
- [ ] XSS prevention (if applicable)

## Testing
- [ ] Unit tests are provided and pass
- [ ] Integration tests cover main scenarios
- [ ] Test coverage is adequate (>80%)
- [ ] Mock dependencies appropriately
- [ ] Tests are maintainable and readable

## Documentation
- [ ] Code changes are documented
- [ ] API changes are documented
- [ ] README updated if necessary
- [ ] Comments explain why, not what
- [ ] JSDoc comments for public functions

## Git & Deployment
- [ ] Commit messages are descriptive
- [ ] Branch follows naming convention
- [ ] No merge conflicts
- [ ] Builds successfully
- [ ] No breaking changes without deprecation
`
  }

  generateGitWorkflow() {
    return `# Git Workflow Guidelines

## Branch Naming
- \`feature/feature-name\` - New features
- \`bugfix/bug-description\` - Bug fixes
- \`hotfix/critical-fix\` - Critical production fixes
- \`chore/task-description\` - Maintenance tasks
- \`docs/documentation-update\` - Documentation changes

## Commit Messages
Follow the format: \`type(scope): description\`

### Types
- \`feat\`: New feature
- \`fix\`: Bug fix
- \`docs\`: Documentation changes
- \`style\`: Code style changes (formatting, etc.)
- \`refactor\`: Code refactoring
- \`test\`: Adding or updating tests
- \`chore\`: Maintenance tasks

### Examples
\`\`\`
feat(auth): add OAuth2 authentication
fix(api): resolve timeout issue in user endpoint
docs(readme): update installation instructions
refactor(utils): improve error handling
\`\`\`

## Pull Request Process
1. Create feature branch from main
2. Implement changes with tests
3. Run quality checks locally
4. Create pull request with description
5. Address review feedback
6. Squash merge after approval

## Quality Gates
- All tests must pass
- Code coverage > 80%
- No linting errors
- Security scan passed
- Performance regression check
`
  }

  generateTestingGuidelines() {
    return `# Testing Guidelines

## Test Structure
- **Unit Tests**: Test individual functions/methods
- **Integration Tests**: Test component interactions
- **End-to-End Tests**: Test complete user workflows

## Naming Conventions
- Test files: \`.test.js\` or \`.spec.js\`
- Test descriptions: should be descriptive
- Use \`describe\` for grouping related tests
- Use \`it\` for individual test cases

## Best Practices
- **AAA Pattern**: Arrange, Act, Assert
- Test one thing at a time
- Use meaningful assertions
- Mock external dependencies
- Clean up resources after tests

## Coverage Requirements
- Minimum 80% line coverage
- 100% coverage for critical paths
- Test both happy path and error cases
- Test boundary conditions

## Example Structure
\`\`\`javascript
describe('UserManager', () => {
  describe('createUser', () => {
    it('should create user with valid data', async () => {
      // Arrange
      const userData = { name: 'John', email: 'john@example.com' }
      
      // Act
      const result = await userManager.createUser(userData)
      
      // Assert
      expect(result.id).toBeDefined()
      expect(result.name).toBe('John')
    })
    
    it('should throw error with invalid email', async () => {
      // Arrange
      const userData = { name: 'John', email: 'invalid' }
      
      // Act & Assert
      await expect(userManager.createUser(userData))
        .rejects.toThrow('Invalid email format')
    })
  })
})
\`\`\`
`
  }

  generateSecurityGuidelines() {
    return `# Security Guidelines

## Input Validation
- Validate all user inputs
- Sanitize data before processing
- Use type checking and schema validation
- Prevent injection attacks (SQL, NoSQL, Command)

## Authentication & Authorization
- Use strong authentication mechanisms
- Implement proper session management
- Validate permissions for all operations
- Use HTTPS for all communications

## Data Protection
- Encrypt sensitive data at rest
- Use secure communication protocols
- Implement proper logging (no sensitive data)
- Regular security audits

## Code Security
- No hardcoded secrets or credentials
- Use environment variables for configuration
- Implement rate limiting
- Validate file uploads and sizes

## Dependencies
- Keep dependencies up to date
- Regularly audit for vulnerabilities
- Use only trusted packages
- Monitor security advisories

## Deployment Security
- Use secure deployment practices
- Implement proper access controls
- Monitor and log security events
- Regular penetration testing

## Incident Response
- Have a security incident response plan
- Log security events appropriately
- Regular backup and recovery procedures
- Communication plan for security breaches
`
  }
}

// Export utilities
module.exports = {
  CodeQualityAnalyzer,
  DevelopmentGuidelinesGenerator,
  CODING_STANDARDS,
  NAMING_CONVENTIONS
}