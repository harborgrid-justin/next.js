/**
 * Enhanced Release Log Generator
 * Generates consolidated release logs from GitHub releases with robust error handling
 */
import fetch from 'node-fetch'

/**
 * Configuration constants
 */
const CONFIG = {
  GITHUB_API: {
    BASE_URL: 'https://api.github.com',
    REPOSITORY: 'vercel/next.js',
    PER_PAGE: 100,
    TIMEOUT: 30000
  },
  VALIDATION: {
    MAX_RELEASES: 500,
    MAX_TAG_LENGTH: 50,
    MAX_BODY_LENGTH: 100000,
    REQUIRED_SECTIONS: [
      '### Core Changes',
      '### Minor Changes', 
      '### Documentation Changes',
      '### Example Changes',
      '### Misc Changes',
      '### Patches',
      '### Credits'
    ]
  },
  PATTERNS: {
    VERSION_REGEX: /v(.*?-)/,
    CANARY_REGEX: /v.*?-/,
    USERNAME_REGEX: /@[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}/gi,
    SECTION_HEADER: /^###\s/
  }
}

/**
 * Custom error classes for better error categorization
 */
class GitHubAPIError extends Error {
  constructor(message, status, url) {
    super(message)
    this.name = 'GitHubAPIError'
    this.status = status
    this.url = url
  }
}

class ReleaseValidationError extends Error {
  constructor(message, release) {
    super(message)
    this.name = 'ReleaseValidationError'
    this.release = release
  }
}

class DataProcessingError extends Error {
  constructor(message, data) {
    super(message)
    this.name = 'DataProcessingError'
    this.data = data
  }
}

/**
 * Enhanced fetch with timeout and error handling
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.GITHUB_API.TIMEOUT)
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'nextjs-release-log-generator/1.0',
        ...options.headers
      }
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      throw new GitHubAPIError(
        `GitHub API request failed: ${response.status} ${response.statusText}`,
        response.status,
        url
      )
    }
    
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    
    if (error.name === 'AbortError') {
      throw new GitHubAPIError(`Request timeout after ${CONFIG.GITHUB_API.TIMEOUT}ms`, 408, url)
    }
    
    throw error
  }
}

/**
 * Validate release data structure
 */
function validateRelease(release) {
  const required = ['id', 'tag_name', 'created_at', 'body']
  
  for (const field of required) {
    if (!(field in release)) {
      throw new ReleaseValidationError(`Missing required field: ${field}`, release)
    }
  }
  
  if (typeof release.tag_name !== 'string' || release.tag_name.trim().length === 0) {
    throw new ReleaseValidationError('Invalid tag_name: must be non-empty string', release)
  }
  
  if (release.tag_name.length > CONFIG.VALIDATION.MAX_TAG_LENGTH) {
    throw new ReleaseValidationError(`Tag name too long: ${release.tag_name.length} > ${CONFIG.VALIDATION.MAX_TAG_LENGTH}`, release)
  }
  
  if (typeof release.body !== 'string') {
    throw new ReleaseValidationError('Invalid body: must be string', release)
  }
  
  if (release.body.length > CONFIG.VALIDATION.MAX_BODY_LENGTH) {
    throw new ReleaseValidationError(`Release body too long: ${release.body.length} > ${CONFIG.VALIDATION.MAX_BODY_LENGTH}`, release)
  }
  
  // Validate date format
  const createdAt = new Date(release.created_at)
  if (isNaN(createdAt.getTime())) {
    throw new ReleaseValidationError('Invalid created_at date format', release)
  }
  
  return true
}

/**
 * Safely normalize release body content
 */
function normalizeReleaseBody(body) {
  if (typeof body !== 'string') {
    return []
  }
  
  return body
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
}

/**
 * Fetch and validate GitHub releases
 */
async function fetchReleases() {
  const url = `${CONFIG.GITHUB_API.BASE_URL}/repos/${CONFIG.GITHUB_API.REPOSITORY}/releases?per_page=${CONFIG.GITHUB_API.PER_PAGE}`
  
  console.log('🌐 Fetching releases from GitHub API...')
  
  try {
    const response = await fetchWithTimeout(url)
    const releasesArray = await response.json()
    
    if (!Array.isArray(releasesArray)) {
      throw new DataProcessingError('GitHub API returned non-array response', releasesArray)
    }
    
    if (releasesArray.length === 0) {
      throw new DataProcessingError('No releases found in repository', null)
    }
    
    if (releasesArray.length > CONFIG.VALIDATION.MAX_RELEASES) {
      console.warn(`⚠️  Large number of releases found (${releasesArray.length}), this may take a while`)
    }
    
    console.log(`📦 Found ${releasesArray.length} releases`)
    
    // Validate and process releases
    const validatedReleases = []
    let skippedCount = 0
    
    for (const release of releasesArray) {
      try {
        validateRelease(release)
        
        const processedRelease = {
          id: release.id,
          tag_name: release.tag_name,
          created_at: release.created_at,
          body: normalizeReleaseBody(release.body)
        }
        
        validatedReleases.push(processedRelease)
      } catch (error) {
        if (error instanceof ReleaseValidationError) {
          console.warn(`⚠️  Skipping invalid release ${release.tag_name || 'unknown'}: ${error.message}`)
          skippedCount++
        } else {
          throw error
        }
      }
    }
    
    if (skippedCount > 0) {
      console.log(`📊 Processed ${validatedReleases.length} valid releases, skipped ${skippedCount} invalid ones`)
    }
    
    // Sort by creation date
    return validatedReleases.sort((a, b) => a.created_at.localeCompare(b.created_at))
    
  } catch (error) {
    if (error instanceof GitHubAPIError) {
      console.error(`❌ GitHub API Error: ${error.message}`)
      if (error.status === 404) {
        console.error('💡 Hint: Repository may not exist or may be private')
      } else if (error.status === 403) {
        console.error('💡 Hint: Rate limit exceeded or insufficient permissions')
      }
    }
    throw error
  }
}

/**
 * Determine target version from releases with validation
 */
function determineTargetVersion(releases) {
  if (!Array.isArray(releases) || releases.length === 0) {
    throw new DataProcessingError('No releases provided for target version determination', releases)
  }
  
  // Filter canary releases
  const canaryReleases = releases.filter(release => 
    CONFIG.PATTERNS.CANARY_REGEX.test(release.tag_name)
  )
  
  if (canaryReleases.length === 0) {
    throw new DataProcessingError('No canary releases found to determine target version', releases)
  }
  
  const latestCanary = canaryReleases[canaryReleases.length - 1]
  const versionMatch = CONFIG.PATTERNS.VERSION_REGEX.exec(latestCanary.tag_name)
  
  if (!versionMatch || !versionMatch[1]) {
    throw new DataProcessingError(`Unable to extract version from tag: ${latestCanary.tag_name}`, latestCanary)
  }
  
  const targetVersion = versionMatch[1]
  console.log(`🎯 Target version determined: ${targetVersion}`)
  
  return targetVersion
}

/**
 * Extract usernames from credits section with validation
 */
function extractUsernames(text, context = 'unknown') {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return []
  }
  
  const usernames = []
  let match
  const regex = new RegExp(CONFIG.PATTERNS.USERNAME_REGEX.source, CONFIG.PATTERNS.USERNAME_REGEX.flags)
  
  while ((match = regex.exec(text)) !== null) {
    const username = match[0]
    if (username && username.length > 1 && username.length <= 40) { // GitHub username constraints
      usernames.push(username)
    }
    
    // Prevent infinite loop on zero-length matches
    if (match.index === regex.lastIndex) {
      regex.lastIndex++
    }
  }
  
  return usernames.filter((username, index, array) => array.indexOf(username) === index) // Remove duplicates
}

/**
 * Process release sections with enhanced validation
 */
function processReleaseSections(releases, targetVersion) {
  console.log(`📝 Processing sections for ${releases.length} releases...`)
  
  const lineItems = {}
  
  // Initialize sections
  CONFIG.VALIDATION.REQUIRED_SECTIONS.forEach(section => {
    lineItems[section] = []
  })
  
  let processedSections = 0
  let skippedSections = 0
  
  releases.forEach(release => {
    CONFIG.VALIDATION.REQUIRED_SECTIONS.forEach(header => {
      const headerIndex = release.body.indexOf(header)
      
      if (headerIndex === -1) {
        return // Section not found in this release
      }
      
      // Find the end of this section
      let headerLastIndex = release.body
        .slice(headerIndex + 1)
        .findIndex(line => CONFIG.PATTERNS.SECTION_HEADER.test(line))
      
      if (headerLastIndex !== -1) {
        headerLastIndex = headerLastIndex + headerIndex
      } else {
        headerLastIndex = release.body.length - 1
      }
      
      const sectionContent = release.body.slice(headerIndex, headerLastIndex + 1)
      
      if (header === '### Credits') {
        // Special handling for credits section
        sectionContent.forEach(line => {
          const usernames = extractUsernames(line, `${release.tag_name}:${header}`)
          usernames.forEach(username => {
            if (!lineItems[header].includes(username)) {
              lineItems[header].push(username)
            }
          })
        })
        processedSections++
      } else {
        // Standard section processing
        const validItems = sectionContent
          .filter(line => line.startsWith('-'))
          .filter(line => line.trim().length > 1) // Filter out empty or minimal items
        
        if (validItems.length > 0) {
          lineItems[header].push(...validItems)
          processedSections++
        } else {
          skippedSections++
        }
      }
    })
  })
  
  console.log(`📊 Processed ${processedSections} sections, skipped ${skippedSections} empty sections`)
  
  return lineItems
}

/**
 * Generate final message with proper formatting
 */
function generateFinalMessage(lineItems) {
  console.log('📜 Generating final release message...')
  
  const finalMessage = []
  let totalItems = 0
  
  CONFIG.VALIDATION.REQUIRED_SECTIONS.forEach(header => {
    const items = lineItems[header] || []
    
    if (items.length === 0) {
      console.log(`⚠️  Section '${header}' is empty, skipping`)
      return
    }
    
    finalMessage.push(header, '') // Header and blank line
    
    if (header === '### Credits') {
      // Special formatting for credits
      const uniqueItems = [...new Set(items)].filter(item => item && item.trim().length > 0)
      
      if (uniqueItems.length === 0) {
        finalMessage.push('No contributors found', '')
        return
      }
      
      let creditsMessage = 'Huge thanks to '
      
      if (uniqueItems.length === 1) {
        creditsMessage += uniqueItems[0]
      } else if (uniqueItems.length === 2) {
        creditsMessage += `${uniqueItems[0]} and ${uniqueItems[1]}`
      } else {
        creditsMessage += uniqueItems.slice(0, -1).join(', ')
        creditsMessage += `, and ${uniqueItems[uniqueItems.length - 1]}`
      }
      
      creditsMessage += ' for helping!'
      finalMessage.push(creditsMessage)
      totalItems += uniqueItems.length
    } else {
      // Standard section formatting
      const validItems = items.filter(item => item && item.trim().length > 0)
      validItems.forEach(item => finalMessage.push(item))
      totalItems += validItems.length
    }
    
    finalMessage.push('') // Blank line after section
  })
  
  console.log(`📈 Generated message with ${totalItems} items across ${CONFIG.VALIDATION.REQUIRED_SECTIONS.length} sections`)
  
  return finalMessage
}

/**
 * Main processing function with comprehensive error handling
 */
async function main() {
  const startTime = performance.now()
  console.log('🚀 Release Log Generator Started')
  
  try {
    // Step 1: Fetch releases
    const allReleases = await fetchReleases()
    
    if (allReleases.length === 0) {
      throw new DataProcessingError('No valid releases found after processing', null)
    }
    
    // Step 2: Determine target version
    const targetVersion = determineTargetVersion(allReleases)
    
    // Step 3: Filter releases for target version
    const targetReleases = allReleases.filter(release => 
      release.tag_name.includes(targetVersion)
    )
    
    if (targetReleases.length === 0) {
      throw new DataProcessingError(`No releases found for target version: ${targetVersion}`, { targetVersion, totalReleases: allReleases.length })
    }
    
    console.log(`🔍 Found ${targetReleases.length} releases for version ${targetVersion}`)
    
    // Step 4: Process sections
    const lineItems = processReleaseSections(targetReleases, targetVersion)
    
    // Step 5: Generate final message
    const finalMessageArray = generateFinalMessage(lineItems)
    
    const result = {
      version: targetVersion.slice(0, -1), // Remove trailing dash
      firstVersion: targetReleases[0]?.tag_name || 'unknown',
      lastVersion: targetReleases[targetReleases.length - 1]?.tag_name || 'unknown',
      content: finalMessageArray.join('\n'),
      metadata: {
        totalReleases: allReleases.length,
        targetReleases: targetReleases.length,
        generatedAt: new Date().toISOString(),
        processingTimeMs: (performance.now() - startTime).toFixed(2)
      }
    }
    
    console.log(`✅ Release log generated successfully in ${result.metadata.processingTimeMs}ms`)
    console.log(`📊 Version range: ${result.firstVersion} → ${result.lastVersion}`)
    
    return result
    
  } catch (error) {
    const duration = (performance.now() - startTime).toFixed(2)
    console.error(`\n💥 Release log generation failed after ${duration}ms`)
    
    if (error instanceof GitHubAPIError) {
      console.error(`🌐 GitHub API Error: ${error.message}`)
      console.error(`📍 URL: ${error.url}`)
    } else if (error instanceof ReleaseValidationError) {
      console.error(`📦 Release Validation Error: ${error.message}`)
    } else if (error instanceof DataProcessingError) {
      console.error(`⚙️  Data Processing Error: ${error.message}`)
    } else {
      console.error(`❌ Unexpected Error: ${error.message}`)
      console.error('📍 Stack trace:', error.stack)
    }
    
    throw error
  }
}

/**
 * Enhanced main execution with comprehensive error handling and output management
 */
if (process.argv[1].includes('generate-release-log.mjs')) {
  main().then((result) => {
    if (process.env.OUTPUT_JSON === 'true') {
      // Output full result as JSON
      console.log(JSON.stringify(result, null, 2))
    } else if (process.env.OUTPUT_METADATA === 'true') {
      // Output metadata only
      console.log('\n📊 Generation Metadata:')
      console.log(`Version: ${result.version}`)
      console.log(`First Version: ${result.firstVersion}`)
      console.log(`Last Version: ${result.lastVersion}`)
      console.log(`Total Releases: ${result.metadata.totalReleases}`)
      console.log(`Target Releases: ${result.metadata.targetReleases}`)
      console.log(`Generated At: ${result.metadata.generatedAt}`)
      console.log(`Processing Time: ${result.metadata.processingTimeMs}ms`)
    } else {
      // Default: output content only
      console.log('\n' + result.content)
    }
    
    process.exit(0)
  }).catch((error) => {
    console.error('\n💥 Fatal error generating release log:')
    console.error(error.message)
    
    if (process.env.DEBUG === 'true') {
      console.error('Stack trace:', error.stack)
    }
    
    process.exit(1)
  })
}

// Export for testing and reuse
export { 
  main, 
  fetchReleases, 
  determineTargetVersion, 
  processReleaseSections, 
  generateFinalMessage,
  GitHubAPIError,
  ReleaseValidationError,
  DataProcessingError,
  CONFIG 
}
