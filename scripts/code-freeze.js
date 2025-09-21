/**
 * GitHub Code Freeze Management Script
 * Manages branch protection rules for code freeze functionality
 */

// Configuration and constants
const CONFIG = {
  GITHUB_API_BASE_URL: 'https://api.github.com',
  GITHUB_API_VERSION: '2022-11-28',
  REPOSITORY: {
    OWNER: 'vercel',
    REPO: 'next.js',
    BRANCH: 'canary'
  },
  REQUEST_TIMEOUT: 30000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000
}

const CODE_FREEZE_RULE = {
  context: 'Potentially publish release',
  app_id: 15368,
}

/**
 * Custom error classes for better error handling
 */
class GitHubAPIError extends Error {
  constructor(message, status, response) {
    super(message)
    this.name = 'GitHubAPIError'
    this.status = status
    this.response = response
  }
}

class ConfigurationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ConfigurationError'
  }
}

/**
 * Validate environment and configuration
 */
function validateEnvironment() {
  const authToken = process.env.CODE_FREEZE_TOKEN
  
  if (!authToken || typeof authToken !== 'string' || authToken.trim().length === 0) {
    throw new ConfigurationError('Missing or invalid CODE_FREEZE_TOKEN environment variable')
  }
  
  if (authToken.length < 20) {
    throw new ConfigurationError('CODE_FREEZE_TOKEN appears to be too short to be valid')
  }
  
  return authToken.trim()
}

/**
 * Create fetch options with proper headers and timeout
 */
function createFetchOptions(method = 'GET', body = null, authToken) {
  const options = {
    method,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${authToken}`,
      'X-GitHub-Api-Version': CONFIG.GITHUB_API_VERSION,
      'User-Agent': 'nextjs-code-freeze-script/1.0'
    },
    timeout: CONFIG.REQUEST_TIMEOUT
  }
  
  if (body) {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }
  
  return options
}

/**
 * Enhanced fetch with retry logic and better error handling
 */
async function fetchWithRetry(url, options, maxRetries = CONFIG.MAX_RETRIES) {
  let lastError
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🌐 Making request to ${url} (attempt ${attempt}/${maxRetries})`)
      
      const response = await fetch(url, options)
      const responseText = await response.text()
      
      if (!response.ok) {
        const error = new GitHubAPIError(
          `GitHub API request failed: ${response.status} ${response.statusText}`,
          response.status,
          responseText
        )
        
        // Don't retry on client errors (4xx), except for rate limiting
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw error
        }
        
        lastError = error
        if (attempt < maxRetries) {
          const delay = CONFIG.RETRY_DELAY * Math.pow(2, attempt - 1)
          console.warn(`⚠️  Request failed (${response.status}), retrying in ${delay}ms...`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        throw error
      }
      
      console.log(`✅ Request successful (${response.status})`)
      return responseText ? JSON.parse(responseText) : null
      
    } catch (error) {
      lastError = error
      
      if (error instanceof GitHubAPIError) {
        throw error
      }
      
      if (attempt < maxRetries) {
        const delay = CONFIG.RETRY_DELAY * Math.pow(2, attempt - 1)
        console.warn(`⚠️  Network error, retrying in ${delay}ms:`, error.message)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      
      throw new GitHubAPIError(`Network error after ${maxRetries} attempts: ${error.message}`, 0, null)
    }
  }
  
  throw lastError
}

/**
 * Update branch protection rules
 */
async function updateRules(newRules, authToken) {
  const url = `${CONFIG.GITHUB_API_BASE_URL}/repos/${CONFIG.REPOSITORY.OWNER}/${CONFIG.REPOSITORY.REPO}/branches/${CONFIG.REPOSITORY.BRANCH}/protection`
  const options = createFetchOptions('PUT', newRules, authToken)
  
  try {
    await fetchWithRetry(url, options)
    console.log('📝 Successfully updated branch protection rules')
  } catch (error) {
    if (error instanceof GitHubAPIError) {
      console.error(`❌ Failed to update rules: ${error.message}`)
      if (error.response) {
        console.error(`Response: ${error.response}`)
      }
    }
    throw error
  }
}

/**
 * Get current branch protection rules
 */
async function getCurrentRules(authToken) {
  const url = `${CONFIG.GITHUB_API_BASE_URL}/repos/${CONFIG.REPOSITORY.OWNER}/${CONFIG.REPOSITORY.REPO}/branches/${CONFIG.REPOSITORY.BRANCH}/protection`
  const options = createFetchOptions('GET', null, authToken)
  
  try {
    const data = await fetchWithRetry(url, options)
    console.log('📋 Successfully retrieved current branch protection rules')
    
    // Validate required structure
    if (!data.required_status_checks || !data.required_pull_request_reviews || !data.enforce_admins) {
      throw new GitHubAPIError('Invalid response structure: missing required fields', 200, JSON.stringify(data))
    }
    
    return {
      required_status_checks: {
        strict: Boolean(data.required_status_checks.strict),
        contexts: Array.isArray(data.required_status_checks.contexts) 
          ? data.required_status_checks.contexts 
          : []
      },
      enforce_admins: Boolean(data.enforce_admins.enabled),
      required_pull_request_reviews: {
        dismiss_stale_reviews: Boolean(data.required_pull_request_reviews.dismiss_stale_reviews),
        require_code_owner_reviews: Boolean(data.required_pull_request_reviews.require_code_owner_reviews),
        require_last_push_approval: Boolean(data.required_pull_request_reviews.require_last_push_approval),
        required_approving_review_count: Number(data.required_pull_request_reviews.required_approving_review_count) || 1
      },
      restrictions: {
        users: Array.isArray(data.restrictions?.users) 
          ? data.restrictions.users.map(user => user.login).filter(Boolean)
          : [],
        teams: Array.isArray(data.restrictions?.teams) 
          ? data.restrictions.teams.map(team => team.slug).filter(Boolean)
          : [],
        apps: Array.isArray(data.restrictions?.apps) 
          ? data.restrictions.apps.map(app => app.slug).filter(Boolean)
          : []
      }
    }
  } catch (error) {
    if (error instanceof GitHubAPIError) {
      console.error(`❌ Failed to get current rules: ${error.message}`)
    }
    throw error
  }
}

/**
 * Parse and validate command line arguments
 */
function parseArguments() {
  const args = process.argv.slice(2)
  const typeIndex = args.indexOf('--type')
  
  if (typeIndex === -1 || typeIndex === args.length - 1) {
    throw new ConfigurationError('Missing --type argument. Usage: --type <enable|disable>')
  }
  
  const type = args[typeIndex + 1]?.toLowerCase()
  
  if (!['enable', 'disable'].includes(type)) {
    throw new ConfigurationError('Invalid --type value. Must be "enable" or "disable"')
  }
  
  const isVerbose = args.includes('--verbose') || args.includes('-v')
  const isDryRun = args.includes('--dry-run')
  
  return {
    type,
    isEnable: type === 'enable',
    isVerbose,
    isDryRun
  }
}

/**
 * Check if code freeze rule exists in contexts
 */
function hasCodeFreezeRule(contexts) {
  if (!Array.isArray(contexts)) {
    return false
  }
  return contexts.some(ctx => ctx === CODE_FREEZE_RULE.context)
}

/**
 * Main execution function
 */
async function main() {
  const startTime = performance.now()
  console.log('🚀 Code Freeze Management Script Started')
  
  try {
    // Validate environment and parse arguments
    const authToken = validateEnvironment()
    const { type, isEnable, isVerbose, isDryRun } = parseArguments()
    
    if (isDryRun) {
      console.log('🔍 Running in DRY RUN mode - no changes will be made')
    }
    
    console.log(`🎯 Action: ${isEnable ? 'ENABLE' : 'DISABLE'} code freeze`)
    
    // Get current rules
    console.log('📡 Fetching current branch protection rules...')
    const currentRules = await getCurrentRules(authToken)
    const hasRule = hasCodeFreezeRule(currentRules.required_status_checks.contexts)
    
    if (isVerbose) {
      console.log('📋 Current rules:', JSON.stringify(currentRules, null, 2))
    }
    
    console.log(`📊 Code freeze rule currently: ${hasRule ? 'ENABLED' : 'DISABLED'}`)
    
    // Check if action is needed
    if (isEnable && hasRule) {
      console.log('✅ Code freeze is already enabled, no action needed')
      return
    }
    
    if (!isEnable && !hasRule) {
      console.log('✅ Code freeze is already disabled, no action needed')
      return
    }
    
    // Prepare new rules
    const newRules = { ...currentRules }
    
    if (isEnable) {
      newRules.required_status_checks.contexts = [
        ...currentRules.required_status_checks.contexts,
        CODE_FREEZE_RULE.context
      ]
      console.log('📝 Prepared rules to ENABLE code freeze')
    } else {
      newRules.required_status_checks.contexts = currentRules.required_status_checks.contexts.filter(
        ctx => ctx !== CODE_FREEZE_RULE.context
      )
      console.log('📝 Prepared rules to DISABLE code freeze')
    }
    
    if (isVerbose) {
      console.log('🔍 New rules to apply:', JSON.stringify(newRules, null, 2))
    }
    
    // Apply changes
    if (isDryRun) {
      console.log('🔍 [DRY RUN] Would update branch protection rules')
      console.log(`🔍 [DRY RUN] Code freeze would be: ${isEnable ? 'ENABLED' : 'DISABLED'}`)
    } else {
      console.log('⚡ Applying changes...')
      await updateRules(newRules, authToken)
      console.log(`🎉 Successfully ${isEnable ? 'ENABLED' : 'DISABLED'} code freeze!`)
    }
    
  } catch (error) {
    const duration = (performance.now() - startTime).toFixed(2)
    console.error(`\n💥 Script failed after ${duration}ms`)
    
    if (error instanceof ConfigurationError) {
      console.error(`⚙️  Configuration Error: ${error.message}`)
      process.exit(1)
    } else if (error instanceof GitHubAPIError) {
      console.error(`🌐 GitHub API Error: ${error.message}`)
      if (error.status) {
        console.error(`📊 HTTP Status: ${error.status}`)
      }
      if (error.response) {
        console.error(`📄 Response: ${error.response}`)
      }
      process.exit(1)
    } else {
      console.error(`❌ Unexpected Error: ${error.message}`)
      console.error('📍 Stack trace:', error.stack)
      process.exit(1)
    }
  }
  
  const duration = (performance.now() - startTime).toFixed(2)
  console.log(`\n⏱️  Script completed successfully in ${duration}ms`)
}

/**
 * Enhanced error handler with proper categorization
 */
function handleScriptError(error) {
  console.error('\n💥 Script execution failed:')
  
  if (error instanceof ConfigurationError) {
    console.error(`⚙️  Configuration Error: ${error.message}`)
    console.error('\n📖 Usage: node code-freeze.js --type <enable|disable> [--verbose] [--dry-run]')
    console.error('Required environment variable: CODE_FREEZE_TOKEN')
  } else if (error instanceof GitHubAPIError) {
    console.error(`🌐 GitHub API Error: ${error.message}`)
    if (error.status === 401) {
      console.error('💡 Hint: Check your CODE_FREEZE_TOKEN is valid and has the necessary permissions')
    } else if (error.status === 403) {
      console.error('💡 Hint: Token may lack required permissions for branch protection rules')
    } else if (error.status === 404) {
      console.error('💡 Hint: Repository or branch may not exist, or token lacks access')
    }
  } else {
    console.error(`❌ Unexpected Error: ${error.message}`)
    console.error('📍 Stack trace:', error.stack)
  }
  
  process.exit(1)
}

// Enhanced main execution with comprehensive error handling
if (require.main === module) {
  main().catch(handleScriptError)
} else {
  // Export for testing
  module.exports = {
    main,
    getCurrentRules,
    updateRules,
    GitHubAPIError,
    ConfigurationError,
    CONFIG,
    CODE_FREEZE_RULE
  }
}
